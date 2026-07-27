"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PITCH_NAMES,
  answerTimeLimitMs,
  autocorrelatedFrequency,
  beginPitchSession,
  canStartCertification,
  completePitchSession,
  isFormalSession,
  midiForPitch,
  pitchNameForMidi,
  pitchStats,
  pitchTrainingCsv,
  type PitchName,
  retentionIsAvailable,
  sessionAllowsReplay,
  sessionAllowsRetry,
  sessionShowsImmediateFeedback,
  summarizePitchSession,
  weeklyIsDue,
  type PitchCourseState,
  type PitchModule,
  type PitchResponse,
  type PitchSession,
  type PitchSessionKind,
  type TrainingTimbre,
} from "@/lib/pitch-training";

type PianoAnswer = { note: number; id: number } | null;
type MicrophoneState = "idle" | "requesting" | "listening" | "stable" | "denied" | "error";
type Feedback = {
  correct: boolean;
  target: string;
  answer: string;
  direction?: string;
  retryAvailable: boolean;
  deviceError?: boolean;
  batchAccuracy?: number;
};

type Props = {
  module: PitchModule;
  course: PitchCourseState;
  pianoAnswer: PianoAnswer;
  onChange: (course: PitchCourseState) => void;
  onPlayTone: (note: number, timbre: TrainingTimbre, duration: number) => boolean;
  onHighlightPitch: (pitch: PitchName | null) => void;
  onStatus: (message: string) => void;
};

const MODULE_COPY = {
  ear: {
    eyebrow: "Pitch course · listening",
    title: "Single-note Ear Training",
    intro: "Hear one isolated note, then identify its pitch name on the existing piano. Any octave of the same pitch name is accepted.",
  },
  sight: {
    eyebrow: "Pitch course · voice",
    title: "Single-note Sight Singing",
    intro: "Read a note name or staff position, form the pitch internally, then sing one stable unaccompanied note.",
  },
} as const;

const STAGE_NAMES = {
  baseline: "Baseline",
  A: "Build the association",
  B: "Focused recognition",
  C: "Guided recall",
  D: "Speed and stability",
  E: "Certification",
  F: "Overnight retention",
} as const;

export default function PitchTraining({
  module,
  course,
  pianoAnswer,
  onChange,
  onPlayTone,
  onHighlightPitch,
  onStatus,
}: Props) {
  const copy = MODULE_COPY[module];
  const [view, setView] = useState<"course" | "report" | "settings">("course");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [stageADemos, setStageADemos] = useState(0);
  const [extraDemos, setExtraDemos] = useState(0);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [microphoneMessage, setMicrophoneMessage] = useState("Microphone not checked");
  const [masking, setMasking] = useState(false);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const microphoneStopRef = useRef<(() => void) | null>(null);
  const stablePitchCallbackRef = useRef<(pitch: { midi: number; cents: number }) => void>(() => undefined);
  const maskingTimerRef = useRef<number | null>(null);
  const maskingStopRef = useRef<(() => void) | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const handledPianoAnswerRef = useRef(0);
  const answeringRef = useRef(false);
  const session = course.activeSession;
  const question = session?.questions[session.index];
  const learnedCount = Math.max(1, course.learnedPitches.length);
  const formal = session ? isFormalSession(session.kind) : false;
  const timeLimit = session ? answerTimeLimitMs(module, session.stage, learnedCount) : 0;

  const stopMicrophone = useCallback(() => {
    microphoneStopRef.current?.();
    microphoneStopRef.current = null;
    setMicrophoneState((current) => current === "denied" ? current : "idle");
  }, []);

  const startMicrophone = useCallback(async (checkOnly = false) => {
    stopMicrophone();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicrophoneState("error");
      setMicrophoneMessage("This browser does not provide microphone input.");
      return;
    }
    setMicrophoneState("requesting");
    setMicrophoneMessage("Waiting for microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Web Audio is unavailable");
      const context = new AudioContextClass();
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      let frame = 0;
      let stableSamples: number[] = [];
      let quietFrames = 0;
      let loudFrames = 0;
      let analysisFrames = 0;
      let stopped = false;

      const stop = () => {
        if (stopped) return;
        stopped = true;
        window.cancelAnimationFrame(frame);
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
      };
      microphoneStopRef.current = stop;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (stopped) return;
          setMicrophoneState("error");
          setMicrophoneMessage("The microphone disconnected during the question.");
        };
      });
      setMicrophoneState("listening");
      setMicrophoneMessage(checkOnly ? "Sing one comfortable, steady note." : "Listening for one stable note…");

      const analyse = () => {
        if (stopped) return;
        analyser.getFloatTimeDomainData(buffer);
        const rms = Math.sqrt(buffer.reduce((sum, sample) => sum + sample * sample, 0) / buffer.length);
        quietFrames = rms < 0.012 ? quietFrames + 1 : 0;
        loudFrames = rms > 0.65 ? loudFrames + 1 : 0;
        if (quietFrames > 45) setMicrophoneMessage("Input is very quiet. Move closer or check the input level.");
        if (loudFrames > 10) setMicrophoneMessage("Input is clipping. Move back or lower the input level.");
        analysisFrames += 1;
        if (analysisFrames % 3 !== 0) {
          frame = window.requestAnimationFrame(analyse);
          return;
        }
        const frequency = rms >= 0.012 && rms <= 0.65
          ? autocorrelatedFrequency(buffer, context.sampleRate)
          : null;
        if (frequency && frequency >= 80 && frequency <= 1_100) {
          const exactMidi = 69 + 12 * Math.log2(frequency / 440);
          const roundedMidi = Math.round(exactMidi);
          const cents = Math.round((exactMidi - roundedMidi) * 100);
          const previous = stableSamples.at(-1);
          stableSamples = previous === undefined || Math.abs(exactMidi - previous) < 0.35
            ? [...stableSamples.slice(-10), exactMidi]
            : [exactMidi];
          if (stableSamples.length >= 8 && spread(stableSamples) < 0.28) {
            setMicrophoneState("stable");
            if (checkOnly) {
              setMicrophoneMessage("Stable single-note input received. Exact pitch is hidden during setup.");
              onChange({ ...course, microphoneCheckCompleted: true });
              stop();
              microphoneStopRef.current = null;
            } else {
              stablePitchCallbackRef.current({ midi: roundedMidi, cents });
            }
            stableSamples = [];
          }
        } else {
          stableSamples = [];
        }
        frame = window.requestAnimationFrame(analyse);
      };
      frame = window.requestAnimationFrame(analyse);
    } catch (error) {
      stopMicrophone();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setMicrophoneState(denied ? "denied" : "error");
      setMicrophoneMessage(denied
        ? "Microphone access was denied. Allow it in browser settings, then try again."
        : "The microphone could not be started. Check the selected input device.");
    }
  }, [course, onChange, stopMicrophone]);

  useEffect(() => () => {
    stopMicrophone();
    if (maskingTimerRef.current !== null) window.clearTimeout(maskingTimerRef.current);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    maskingStopRef.current?.();
    onHighlightPitch(null);
  }, [onHighlightPitch, stopMicrophone]);

  useEffect(() => {
    if (module !== "sight" || !session || session.stage === "A" || feedback) {
      microphoneStopRef.current?.();
      microphoneStopRef.current = null;
      return;
    }
    const needsReferenceDelay = session.stage === "B" || session.retryUsed;
    const preparation = window.setTimeout(() => void startMicrophone(false), needsReferenceDelay ? 1_050 : 500);
    return () => window.clearTimeout(preparation);
  }, [feedback, module, session?.id, session?.index, session?.stage, startMicrophone, stopMicrophone]);

  useEffect(() => {
    if (!session || !question || session.stage === "A") return;
    const update = () => {
      const elapsed = Date.now() - new Date(session.questionStartedAt).getTime();
      setRemainingMs(Math.max(0, timeLimit - elapsed));
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [question?.id, session?.id, session?.questionStartedAt, session?.stage, timeLimit]);

  const submitResponse = useCallback((response: PitchResponse) => {
    if (!session || answeringRef.current) return;
    answeringRef.current = true;
    const nextSession: PitchSession = {
      ...session,
      responses: [...session.responses, response],
    };
    const showBatchFeedback = session.kind === "training"
      && session.stage === "D"
      && (session.index + 1) % 6 === 0
      && session.index < session.questions.length - 1;
    const recentBatch = nextSession.responses.filter((item) => !item.deviceError).slice(-6);
    const nextFeedback: Feedback = {
      correct: response.correct,
      target: response.target,
      answer: response.selectedPitch ?? response.detectedPitch ?? "No stable note",
      direction: response.detectedMidi === undefined
        ? undefined
        : pitchDirection(response.detectedMidi, question?.midi ?? response.detectedMidi, response.cents ?? 0),
      retryAvailable: response.deviceError || (!response.correct && sessionAllowsRetry(session)),
      deviceError: response.deviceError,
      batchAccuracy: showBatchFeedback
        ? recentBatch.filter((item) => item.correct).length / Math.max(1, recentBatch.length)
        : undefined,
    };
    stopMicrophone();

    const advance = () => {
      answeringRef.current = false;
      setFeedback(null);
      if (session.index >= session.questions.length - 1) {
        const completed = completePitchSession(course, nextSession);
        onChange(completed);
        const result = completed.sessions.at(-1);
        setCompletedSessionId(result?.id ?? null);
        onStatus(result?.passed === true ? "Stage passed" : result?.passed === false ? "Stage needs another pass" : "Session complete");
        return;
      }
      onChange({
        ...course,
        activeSession: {
          ...nextSession,
          index: session.index + 1,
          questionStartedAt: new Date().toISOString(),
          replayUsed: false,
          retryUsed: false,
          deviceRetryUsed: false,
        },
      });
    };

    if (response.deviceError || showBatchFeedback || sessionShowsImmediateFeedback(session)) {
      setFeedback(nextFeedback);
      if (!nextFeedback.retryAvailable) window.setTimeout(advance, 850);
      else {
        onChange({ ...course, activeSession: nextSession });
        answeringRef.current = false;
      }
    } else {
      advance();
    }
  }, [course, onChange, onStatus, question?.midi, session, stopMicrophone]);

  useEffect(() => {
    if (
      module !== "sight"
      || !session
      || !question
      || session.stage === "A"
      || feedback
      || answeringRef.current
      || (microphoneState !== "denied" && microphoneState !== "error")
    ) return;
    submitResponse(responseForDeviceError(session, question));
  }, [feedback, microphoneState, module, question, session, submitResponse]);

  useEffect(() => {
    const elapsed = session ? Date.now() - new Date(session.questionStartedAt).getTime() : 0;
    if (!session || !question || session.stage === "A" || feedback || remainingMs > 0 || elapsed < timeLimit || answeringRef.current) return;
    const response = responseForTimeout(session, question);
    submitResponse(response);
  }, [feedback, question, remainingMs, session, submitResponse, timeLimit]);

  useEffect(() => {
    if (module !== "ear" || !pianoAnswer || !session || !question || session.stage === "A" || feedback) return;
    if (pianoAnswer.id === handledPianoAnswerRef.current) return;
    handledPianoAnswerRef.current = pianoAnswer.id;
    const selectedPitch = pitchNameForMidi(pianoAnswer.note);
    submitResponse({
      id: crypto.randomUUID(),
      sessionId: session.id,
      module,
      kind: session.kind,
      stage: session.stage,
      target: question.target,
      octave: question.octave,
      timbre: question.timbre,
      representation: session.representation,
      selectedPitch,
      selectedMidi: pianoAnswer.note,
      valid: true,
      correct: selectedPitch === question.target,
      octaveCorrect: Math.floor(pianoAnswer.note / 12) - 1 === question.octave,
      timeout: false,
      assisted: session.replayUsed,
      replayed: session.replayUsed,
      deviceError: false,
      responseMs: Date.now() - new Date(session.questionStartedAt).getTime(),
      createdAt: new Date().toISOString(),
    });
  }, [feedback, module, pianoAnswer, question, session, submitResponse]);

  useEffect(() => {
    stablePitchCallbackRef.current = (detected) => {
      if (module !== "sight" || !session || !question || feedback) return;
      const detectedPitch = pitchNameForMidi(detected.midi);
      submitResponse({
        id: crypto.randomUUID(),
        sessionId: session.id,
        module,
        kind: session.kind,
        stage: session.stage,
        target: question.target,
        octave: question.octave,
        timbre: question.timbre,
        representation: session.representation,
        detectedPitch,
        detectedMidi: detected.midi,
        cents: centsFromTarget(detected.midi, detected.cents, question.midi),
        valid: true,
        correct: detectedPitch === question.target,
        octaveCorrect: Math.floor(detected.midi / 12) - 1 === question.octave,
        timeout: false,
        assisted: session.retryUsed,
        replayed: false,
        deviceError: false,
        responseMs: Date.now() - new Date(session.questionStartedAt).getTime(),
        createdAt: new Date().toISOString(),
      });
    };
  }, [feedback, module, question, session, submitResponse]);

  useEffect(() => {
    if (
      module !== "ear"
      || !session
      || !question
      || session.stage === "A"
      || (session.responses.length !== session.index && !session.deviceRetryUsed)
    ) return;
    const timer = window.setTimeout(() => {
      if (!onPlayTone(question.midi, question.timbre, 0.8)) {
        submitResponse(responseForDeviceError(session, question));
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [module, onPlayTone, question, session, submitResponse]);

  useEffect(() => {
    if (module !== "sight" || !session || !question || session.stage === "A") return;
    const initialStageBReference = session.stage === "B"
      && session.responses.length === session.index
      && !session.retryUsed
      && !session.deviceRetryUsed;
    const deviceStageBReference = session.stage === "B" && session.deviceRetryUsed;
    if (!initialStageBReference && !deviceStageBReference && !session.retryUsed) return;
    const timer = window.setTimeout(() => {
      if (!onPlayTone(question.midi, question.timbre, 0.8)) {
        submitResponse(responseForDeviceError(session, question));
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [module, onPlayTone, question, session, submitResponse]);

  function updateCourse(patch: Partial<PitchCourseState>) {
    onChange({ ...course, ...patch });
  }

  function start(kind: PitchSessionKind) {
    setFeedback(null);
    setCompletedSessionId(null);
    setStageADemos(0);
    setExtraDemos(0);
    if (kind === "certification" || kind === "retention") {
      setMasking(true);
      onStatus("Playing ten seconds of non-pitched masking noise");
      maskingStopRef.current = playMaskingNoise(10);
      if (!maskingStopRef.current) {
        setMasking(false);
        onStatus("Audio output is unavailable; the formal test did not start");
        return;
      }
      maskingTimerRef.current = window.setTimeout(() => {
        setMasking(false);
        maskingTimerRef.current = null;
        maskingStopRef.current = null;
        onChange(beginPitchSession(module, kind, course));
      }, 10_000);
      return;
    }
    onChange(beginPitchSession(module, kind, course));
  }

  function playStageADemo() {
    if (!session || !question) return;
    if (!onPlayTone(question.midi, question.timbre, 0.8)) {
      onStatus("Audio output is unavailable");
      return;
    }
    if (module === "ear") {
      onHighlightPitch(question.target);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => onHighlightPitch(null), 850);
    }
    setStageADemos((count) => count + 1);
    if (module === "ear") onStatus("The matching pitch-class keys are marked on the piano.");
    if (session.index < session.questions.length - 1) {
      onChange({ ...course, activeSession: { ...session, index: session.index + 1 } });
    }
  }

  function finishStageA() {
    if (!session) return;
    onChange(completePitchSession(course, session));
    setStageADemos(0);
    setExtraDemos(0);
    onStatus("Association stage complete");
  }

  function replay() {
    if (!session || !question || !sessionAllowsReplay(session)) return;
    if (!onPlayTone(question.midi, question.timbre, 0.8)) {
      submitResponse(responseForDeviceError(session, question));
      return;
    }
    onChange({ ...course, activeSession: { ...session, replayUsed: true } });
  }

  function retrySight() {
    if (!session || (!feedback?.deviceError && !sessionAllowsRetry(session))) return;
    setFeedback(null);
    answeringRef.current = false;
    onChange({
      ...course,
      activeSession: {
        ...session,
        retryUsed: feedback?.deviceError ? session.retryUsed : true,
        deviceRetryUsed: Boolean(feedback?.deviceError),
        questionStartedAt: new Date().toISOString(),
      },
    });
  }

  function exitSession() {
    stopMicrophone();
    setFeedback(null);
    answeringRef.current = false;
    updateCourse({ activeSession: null });
    onStatus(formal ? "Formal session exited without a result" : "Session paused and closed");
  }

  function exportData(format: "csv" | "json") {
    const data = format === "csv"
      ? pitchTrainingCsv(module, course)
      : JSON.stringify({ module, course }, null, 2);
    const blob = new Blob([data], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `chorda-${module}-training.${format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (session) {
    return (
      <TrainingSession
        module={module}
        session={session}
        question={question}
        feedback={feedback}
        remainingMs={remainingMs}
        microphoneState={microphoneState}
        stageADemos={stageADemos}
        extraDemos={extraDemos}
        onExit={exitSession}
        onReplay={replay}
        onRetry={retrySight}
        onPlayDemo={playStageADemo}
        onPlayExtra={() => {
          if (!question || extraDemos >= 6) return;
          if (!onPlayTone(question.midi, question.timbre, 0.8)) {
            onStatus("Audio output is unavailable");
            return;
          }
          if (module === "ear") {
            onHighlightPitch(question.target);
            if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = window.setTimeout(() => onHighlightPitch(null), 850);
          }
          setExtraDemos((count) => count + 1);
        }}
        onFinishStageA={finishStageA}
      />
    );
  }

  if (!course.baselineCompleted) {
    return (
      <section className="pitch-module">
        <PageHeading copy={copy} retained={0} view={view} onView={setView} showNavigation={false} />
        <div className="pitch-onboarding">
          <div>
            <p className="eyebrow">Before the baseline</p>
            <h2>{module === "ear" ? "Identify without a visible clue" : "Sing without a reference tone"}</h2>
            <p>{copy.intro}</p>
            <ul>
              <li>A4 is fixed at 440 Hz; questions span C3–B5.</li>
              <li>{module === "ear" ? "The baseline has 108 balanced questions and cannot be replayed." : "The baseline has 36 balanced questions and does not play target notes."}</li>
              <li>Results are used only to select a sensible starting pitch.</li>
            </ul>
          </div>
          <div className="setup-checks">
            <p className="eyebrow">Device check</p>
            <button
              className={course.volumeCheckCompleted ? "completed" : ""}
              onClick={() => {
                if (!playMaskingNoise(1.2)) {
                  onStatus("Audio output is unavailable");
                  return;
                }
                updateCourse({ introCompleted: true, volumeCheckCompleted: true });
                onStatus("Volume check played");
              }}
            >
              <span>01</span>
              <strong>Check output volume</strong>
              <small>{course.volumeCheckCompleted ? "Complete" : "Plays non-pitched noise"}</small>
            </button>
            {module === "sight" && (
              <button
                className={course.microphoneCheckCompleted ? "completed" : ""}
                onClick={() => void startMicrophone(true)}
              >
                <span>02</span>
                <strong>Check microphone</strong>
                <small>{microphoneMessage}</small>
              </button>
            )}
            {module === "sight" && (
              <label className="pitch-select">
                <span>Baseline representation</span>
                <select
                  value={course.representation}
                  onChange={(event) => updateCourse({ representation: event.target.value as "note-name" | "staff" })}
                >
                  <option value="note-name">Note name</option>
                  <option value="staff">Staff</option>
                </select>
              </label>
            )}
            <button
              className="primary-button"
              disabled={!course.volumeCheckCompleted || (module === "sight" && !course.microphoneCheckCompleted)}
              onClick={() => start("baseline")}
            >
              Start baseline
            </button>
          </div>
        </div>
      </section>
    );
  }

  const completedSession = course.sessions.find((item) => item.id === completedSessionId);

  return (
    <section className="pitch-module">
      <PageHeading copy={copy} retained={course.retainedPitches.length} view={view} onView={setView} />
      {completedSession && view === "course" && (
        <div className="pitch-result-card">
          <div>
            <p className="eyebrow">{completedSession.kind} complete</p>
            <h2>{completedSession.passed === true ? "Stage passed" : completedSession.passed === false ? "Another block is recommended" : "Measurement complete"}</h2>
            <p>{completedSession.scored} scored questions · {completedSession.abnormal} device exceptions excluded</p>
          </div>
          <dl>
            <div><dt>Accuracy</dt><dd>{percent(completedSession.accuracy)}</dd></div>
            <div><dt>Valid rate</dt><dd>{percent(completedSession.validRate)}</dd></div>
            <div><dt>Median response</dt><dd>{completedSession.medianResponseMs ? `${(completedSession.medianResponseMs / 1000).toFixed(2)}s` : "—"}</dd></div>
          </dl>
          <div className="button-row">
            <button className="primary-button" onClick={() => setCompletedSessionId(null)}>Back to course</button>
            <button onClick={() => {
              setCompletedSessionId(null);
              setView("report");
            }}>Open report</button>
          </div>
        </div>
      )}
      {view === "course" && !completedSession && (
        <CourseDashboard
          module={module}
          course={course}
          masking={masking}
          onStart={start}
        />
      )}
      {view === "report" && <TrainingReport module={module} course={course} onExport={exportData} />}
      {view === "settings" && (
        <div className="pitch-settings">
          <div>
            <p className="eyebrow">Representation</p>
            <h2>Sight-reading display</h2>
            <p>The selection is fixed when a session starts. Formal scores remain separated by representation.</p>
          </div>
          {module === "sight" ? (
            <div className="segmented" aria-label="Sight-singing representation">
              <button className={course.representation === "note-name" ? "active" : ""} onClick={() => updateCourse({ representation: "note-name" })}>Note name</button>
              <button className={course.representation === "staff" ? "active" : ""} onClick={() => updateCourse({ representation: "staff" })}>Staff</button>
            </div>
          ) : <p className="muted-copy">Ear-training answers always use the existing piano.</p>}
          {module === "sight" && (
            <button className="pitch-device-button" onClick={() => void startMicrophone(true)}>
              Recheck microphone
              <small>{microphoneMessage}</small>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PageHeading({
  copy,
  retained,
  view,
  onView,
  showNavigation = true,
}: {
  copy: (typeof MODULE_COPY)[PitchModule];
  retained: number;
  view: "course" | "report" | "settings";
  onView: (view: "course" | "report" | "settings") => void;
  showNavigation?: boolean;
}) {
  return (
    <div className="page-heading pitch-heading">
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
      </div>
      <div className="pitch-heading-actions">
        <div className="heading-stat"><span>{retained}/12</span><small>stable pitch names</small></div>
        {showNavigation && <div className="segmented">
          {(["course", "report", "settings"] as const).map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => onView(item)}>{item}</button>
          ))}
        </div>}
      </div>
    </div>
  );
}

function CourseDashboard({
  module,
  course,
  masking,
  onStart,
}: {
  module: PitchModule;
  course: PitchCourseState;
  masking: boolean;
  onStart: (kind: PitchSessionKind) => void;
}) {
  const recentCertification = [...course.sessions].reverse().find((session) => session.kind === "certification");
  const current = course.currentPitch ?? "F";
  const dueWeekly = weeklyIsDue(course);
  const certificationAvailable = canStartCertification(course);
  const retentionAvailable = retentionIsAvailable(course);
  const retentionTime = course.pendingRetentionAt ? new Date(course.pendingRetentionAt) : null;
  const stageKind: PitchSessionKind = course.stage === "A" ? "stage-a" : "training";

  return (
    <div className="pitch-dashboard">
      <article className="pitch-current">
        <div>
          <p className="eyebrow">Current course point</p>
          <h2>{STAGE_NAMES[course.stage]}</h2>
          <p>
            Working pitch <strong>{current}</strong> · {course.learnedPitches.length} learned · {course.retainedPitches.length} retained
          </p>
        </div>
        <div className="pitch-stage-mark" aria-label={`Stage ${course.stage}`}>{course.stage}</div>
      </article>
      <div className="pitch-metrics">
        <article><span>Retained</span><strong>{course.retainedPitches.length}/12</strong><small>{course.retainedPitches.join(" · ") || "Course just started"}</small></article>
        <article><span>Recent certification</span><strong>{recentCertification ? percent(recentCertification.accuracy) : "—"}</strong><small>{recentCertification ? new Date(recentCertification.completedAt).toLocaleDateString() : "No formal result yet"}</small></article>
        <article><span>{module === "ear" ? "Median response" : "Valid singing"}</span><strong>{recentCertification ? module === "ear" ? `${(recentCertification.medianResponseMs / 1000).toFixed(2)}s` : percent(recentCertification.validRate) : "—"}</strong><small>Formal sessions only</small></article>
      </div>
      <div className="pitch-actions">
        <article>
          <p className="eyebrow">Recommended next</p>
          <h3>{course.stage === "F" ? "Overnight check" : STAGE_NAMES[course.stage]}</h3>
          <p>{stageDescription(module, course.stage)}</p>
          {course.stage === "E" ? (
            <button className="primary-button" disabled={!certificationAvailable || masking} onClick={() => onStart("certification")}>
              {masking ? "Masking sound · test starts shortly" : certificationAvailable ? "Start certification" : "Daily certification limit reached"}
            </button>
          ) : course.stage === "F" ? (
            <button className="primary-button" disabled={!retentionAvailable || masking} onClick={() => onStart("retention")}>
              {masking ? "Masking sound · test starts shortly" : retentionAvailable ? "Start retention test" : `Available ${retentionTime?.toLocaleString() ?? "after 12 hours"}`}
            </button>
          ) : (
            <button className="primary-button" onClick={() => onStart(stageKind)}>
              {course.stage === "A" ? "Start association" : "Start training block"}
            </button>
          )}
        </article>
        <article>
          <p className="eyebrow">Weekly calibration</p>
          <h3>{dueWeekly ? "Weekly test is ready" : "Not due yet"}</h3>
          <p>{module === "ear" ? "108 balanced questions across three octaves and three timbres." : "36 balanced questions across twelve pitch names."}</p>
          <button disabled={!dueWeekly} onClick={() => onStart("weekly")}>Start weekly test</button>
        </article>
      </div>
      <div className="pitch-map" aria-label="Pitch-name course map">
        {PITCH_NAMES.map((pitch) => {
          const state = course.retainedPitches.includes(pitch) ? "retained" : course.learnedPitches.includes(pitch) ? "learning" : "locked";
          return <div key={pitch} className={state}><strong>{pitch}</strong><span>{state}</span></div>;
        })}
      </div>
    </div>
  );
}

function TrainingSession({
  module,
  session,
  question,
  feedback,
  remainingMs,
  microphoneState,
  stageADemos,
  extraDemos,
  onExit,
  onReplay,
  onRetry,
  onPlayDemo,
  onPlayExtra,
  onFinishStageA,
}: {
  module: PitchModule;
  session: PitchSession;
  question: PitchSession["questions"][number] | undefined;
  feedback: Feedback | null;
  remainingMs: number;
  microphoneState: MicrophoneState;
  stageADemos: number;
  extraDemos: number;
  onExit: () => void;
  onReplay: () => void;
  onRetry: () => void;
  onPlayDemo: () => void;
  onPlayExtra: () => void;
  onFinishStageA: () => void;
}) {
  if (!question) return null;
  const formal = isFormalSession(session.kind);
  const progress = (session.index + 1) / session.questions.length;
  const title = session.kind === "baseline"
    ? "Baseline"
    : session.kind === "weekly"
      ? "Weekly test"
      : STAGE_NAMES[session.stage];

  if (session.stage === "A") {
    return (
      <section className="pitch-module pitch-session-page">
        <div className="pitch-session-top">
          <button onClick={onExit}>← Back</button>
          <div><p className="eyebrow">{module === "ear" ? "Ear training" : "Sight singing"}</p><h1>{title}</h1></div>
          <span>{Math.min(stageADemos, 6)}/6 demonstrations</span>
        </div>
        <div className="pitch-stage-a">
          <p className="eyebrow">Association only · no score</p>
          {module === "sight" && (
            session.representation === "note-name"
              ? <div className="sight-note-name">{question.target}{question.octave}</div>
              : <StaffNote midi={question.midi} pitch={question.target} />
          )}
          {module === "ear" && <div className="sound-orbit" aria-label="Sound demonstration"><i /><span>Listen, then notice every matching key</span></div>}
          <button className="primary-button" disabled={stageADemos >= 6} onClick={onPlayDemo}>Play demonstration {Math.min(stageADemos + 1, 6)}</button>
          {stageADemos >= 6 && (
            <div className="practice-buttons">
              <button disabled={extraDemos >= 6} onClick={onPlayExtra}>Extra listen · {extraDemos}/6</button>
              <button className="primary-button" onClick={onFinishStageA}>Continue to Stage B</button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="pitch-module pitch-session-page">
      <div className="pitch-session-top">
        <button onClick={onExit}>← Back</button>
        <div><p className="eyebrow">{formal ? "Formal session · no live score" : `${module === "ear" ? "Ear training" : "Sight singing"} · Stage ${session.stage}`}</p><h1>{title}</h1></div>
        <span>{session.index + 1} / {session.questions.length}</span>
      </div>
      <div className="pitch-progress"><i style={{ width: `${progress * 100}%` }} /></div>
      <div className={`pitch-question ${module}`}>
        <div className="pitch-question-meta">
          <span>{module === "ear" ? "Sound" : "Target"}</span>
          <strong>{(remainingMs / 1000).toFixed(1)}s</strong>
        </div>
        {module === "ear" ? (
          <div className="ear-prompt">
            <div className="sound-orbit"><i /><span>Sound played · choose one piano key</span></div>
            {sessionAllowsReplay(session) && <button onClick={onReplay}>Replay once · marks this answer assisted</button>}
          </div>
        ) : (
          <div className="sight-prompt">
            {session.representation === "note-name"
              ? <div className="sight-note-name">{question.target}{question.octave}</div>
              : <StaffNote midi={question.midi} pitch={question.target} />}
            <div className={`recording-state ${microphoneState}`}>
              <i />
              <span>{microphoneState === "requesting" ? "Preparing microphone" : microphoneState === "stable" ? "Stable note received" : "Listening for one stable note"}</span>
            </div>
          </div>
        )}
        {feedback && (!formal || feedback.deviceError) && (
          <div className={`pitch-feedback ${feedback.correct ? "correct" : "wrong"}`} role="status">
            <strong>{feedback.batchAccuracy !== undefined ? "Six-question checkpoint" : feedback.deviceError ? "Audio device interrupted" : feedback.correct ? "Correct pitch name" : feedback.answer === "No stable note" ? "No stable single note" : "Try that pitch again"}</strong>
            <span>{feedback.batchAccuracy !== undefined ? `${percent(feedback.batchAccuracy)} in this block · individual answers remain hidden` : feedback.deviceError ? "This question is excluded and can be attempted again." : `Target ${feedback.target} · received ${feedback.answer}${feedback.direction ? ` · ${feedback.direction}` : ""}`}</span>
            {feedback.retryAvailable && <button onClick={onRetry}>{feedback.deviceError ? "Reconnect and retry question" : "Listen once and retry · assisted"}</button>}
          </div>
        )}
      </div>
      <p className="pitch-session-note">
        {formal ? "Answers and accuracy remain hidden until the block is complete." : module === "ear" ? "Any octave of the same pitch name is accepted." : "A different octave of the same pitch name is accepted and recorded separately."}
      </p>
    </section>
  );
}

function TrainingReport({
  module,
  course,
  onExport,
}: {
  module: PitchModule;
  course: PitchCourseState;
  onExport: (format: "csv" | "json") => void;
}) {
  const stats = pitchStats(course.records);
  const trainingStats = pitchStats(course.records.filter((record) => !isFormalSession(record.kind)));
  const formalStats = pitchStats(course.records.filter((record) => isFormalSession(record.kind)));
  const formalHistory = [...course.sessions].filter((session) => isFormalSession(session.kind)).reverse();
  const strongest = [...stats.perPitch].filter((item) => item.attempts).sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakest = [...stats.perPitch].filter((item) => item.attempts).sort((a, b) => a.accuracy - b.accuracy)[0];

  return (
    <div className="pitch-report">
      <div className="pitch-report-summary">
        <article><span>Training accuracy</span><strong>{trainingStats.total ? percent(trainingStats.accuracy) : "—"}</strong><small>{trainingStats.total} scored training questions</small></article>
        <article><span>Formal accuracy</span><strong>{formalStats.total ? percent(formalStats.accuracy) : "—"}</strong><small>{formalStats.total} scored formal questions</small></article>
        <article><span>Strongest / focus</span><strong>{strongest?.pitch ?? "—"} / {weakest?.pitch ?? "—"}</strong><small>Based on scored records</small></article>
      </div>
      <section className="pitch-report-section">
        <div className="pitch-report-title"><div><p className="eyebrow">Twelve pitch names</p><h2>Accuracy by pitch</h2></div><div className="button-row"><button onClick={() => onExport("csv")}>Export CSV</button><button onClick={() => onExport("json")}>Export JSON</button></div></div>
        <div className="pitch-accuracy-grid">
          {stats.perPitch.map((item) => (
            <article key={item.pitch}>
              <strong>{item.pitch}</strong>
              <div><i style={{ width: `${item.accuracy * 100}%` }} /></div>
              <span>{item.attempts ? percent(item.accuracy) : "No data"} · {item.attempts}</span>
            </article>
          ))}
        </div>
      </section>
      <div className="pitch-report-columns">
        <section>
          <p className="eyebrow">Common confusions</p>
          <h2>Answer relationships</h2>
          {stats.confusion.length ? stats.confusion.slice(0, 8).map((item) => (
            <div className="confusion-row" key={`${item.target}-${item.answer}`}>
              <strong>{item.target} → {item.answer}</strong><span>{item.count}</span>
            </div>
          )) : <p className="muted-copy">No confusion data yet.</p>}
        </section>
        <section>
          <p className="eyebrow">Formal history</p>
          <h2>Tests and certification</h2>
          {formalHistory.length ? formalHistory.slice(0, 10).map((item) => (
            <div className="history-row" key={item.id}>
              <div><strong>{item.kind}</strong><small>{new Date(item.completedAt).toLocaleString()} · {item.representation}</small></div>
              <span>{percent(item.accuracy)} · {item.passed === null ? "measured" : item.passed ? "passed" : "not passed"}</span>
            </div>
          )) : <p className="muted-copy">No formal sessions completed yet.</p>}
        </section>
      </div>
      {module === "sight" && (
        <section className="pitch-representation-stats">
          <div><span>Formal note-name</span><strong>{formalStats.total ? percent(formalStats.noteNameAccuracy) : "—"}</strong></div>
          <div><span>Formal staff</span><strong>{formalStats.total ? percent(formalStats.staffAccuracy) : "—"}</strong></div>
          <div><span>Valid singing</span><strong>{stats.total ? percent(stats.validRate) : "—"}</strong></div>
          <div><span>Original octave</span><strong>{stats.total ? percent(stats.octaveAccuracy) : "—"}</strong></div>
          <div><span>Pitch tendency</span><strong>{stats.total ? stats.averageCents > 8 ? "Sharp" : stats.averageCents < -8 ? "Flat" : "Centered" : "—"}</strong></div>
          <div><span>Timeout rate</span><strong>{stats.total ? percent(stats.timeoutRate) : "—"}</strong></div>
        </section>
      )}
      {module === "ear" && (
        <section className="pitch-representation-stats">
          {stats.perOctave.map((item) => <div key={item.octave}><span>Octave {item.octave}</span><strong>{item.attempts ? percent(item.accuracy) : "—"}</strong></div>)}
          {stats.perTimbre.map((item) => <div key={item.timbre}><span>{item.timbre}</span><strong>{item.attempts ? percent(item.accuracy) : "—"}</strong></div>)}
          <div><span>Replay rate</span><strong>{stats.total ? percent(stats.replayRate) : "—"}</strong></div>
        </section>
      )}
    </div>
  );
}

function StaffNote({ midi, pitch }: { midi: number; pitch: string }) {
  const octave = Math.floor(midi / 12) - 1;
  const bass = midi < 60;
  const natural = pitch[0];
  const letterIndex = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 }[natural as "C" | "D" | "E" | "F" | "G" | "A" | "B"];
  const diatonicFromC = (octave - (bass ? 3 : 4)) * 7 + letterIndex;
  const y = (bass ? 62 : 92) - diatonicFromC * 6;
  const accidental = pitch.includes("♯") ? "♯" : pitch.includes("♭") ? "♭" : "";
  const ledgerYs: number[] = [];
  for (let ledger = 20; ledger <= 92; ledger += 12) {
    if ((y < 32 && ledger <= 32 && ledger >= y - 1) || (y > 80 && ledger >= 80 && ledger <= y + 1)) ledgerYs.push(ledger);
  }
  return (
    <svg className="staff-note" viewBox="0 0 300 124" role="img" aria-label="Target note on staff">
      {[32, 44, 56, 68, 80].map((line) => <line key={line} x1="38" x2="276" y1={line} y2={line} />)}
      <text className="clef" x="45" y="78">{bass ? "𝄢" : "𝄞"}</text>
      {ledgerYs.map((line) => <line className="ledger" key={line} x1="156" x2="208" y1={line} y2={line} />)}
      {accidental && <text className="accidental" x="143" y={y + 7}>{accidental}</text>}
      <ellipse cx="184" cy={y} rx="13" ry="8" transform={`rotate(-16 184 ${y})`} />
      <line className="stem" x1={y < 56 ? "172" : "196"} x2={y < 56 ? "172" : "196"} y1={y} y2={y < 56 ? y + 39 : y - 39} />
    </svg>
  );
}

function responseForTimeout(session: PitchSession, question: PitchSession["questions"][number]): PitchResponse {
  return {
    id: crypto.randomUUID(),
    sessionId: session.id,
    module: session.module,
    kind: session.kind,
    stage: session.stage,
    target: question.target,
    octave: question.octave,
    timbre: question.timbre,
    representation: session.representation,
    valid: false,
    correct: false,
    timeout: true,
    assisted: session.replayUsed || session.retryUsed,
    replayed: session.replayUsed,
    deviceError: false,
    responseMs: answerTimeLimitMs(session.module, session.stage, Math.max(1, new Set(session.questions.map((item) => item.target)).size)),
    createdAt: new Date().toISOString(),
  };
}

function responseForDeviceError(session: PitchSession, question: PitchSession["questions"][number]): PitchResponse {
  return {
    id: crypto.randomUUID(),
    sessionId: session.id,
    module: session.module,
    kind: session.kind,
    stage: session.stage,
    target: question.target,
    octave: question.octave,
    timbre: question.timbre,
    representation: session.representation,
    valid: false,
    correct: false,
    timeout: false,
    assisted: false,
    replayed: false,
    deviceError: true,
    responseMs: Date.now() - new Date(session.questionStartedAt).getTime(),
    createdAt: new Date().toISOString(),
  };
}

function stageDescription(module: PitchModule, stage: PitchCourseState["stage"]): string {
  if (stage === "A") return module === "ear" ? "Hear the new pitch name across three octaves and connect it to every matching piano key." : "Connect the visual target, standard sound, and your singing action.";
  if (stage === "B") return module === "ear" ? "Separate the new pitch from nearby distractors with immediate feedback." : "Hear the target once, then reproduce it with immediate feedback.";
  if (stage === "C") return "Recall all learned pitch names with guidance and one assisted second attempt.";
  if (stage === "D") return "Build faster, stable responses without per-question cues.";
  if (stage === "E") return "Complete a balanced, no-feedback formal certification.";
  if (stage === "F") return "Confirm the pitch remains stable at least twelve hours later.";
  return "Complete the baseline to establish an individual starting point.";
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function pitchDirection(detectedMidi: number, targetMidi: number, cents: number): string {
  const pitchClassDifference = ((detectedMidi - targetMidi + 18) % 12) - 6;
  if (pitchClassDifference > 0) return "sharp";
  if (pitchClassDifference < 0) return "flat";
  return cents > 15 ? "sharp" : cents < -15 ? "flat" : "centered";
}

function centsFromTarget(detectedMidi: number, tuningCents: number, targetMidi: number): number {
  const pitchClassDifference = ((detectedMidi - targetMidi + 18) % 12) - 6;
  return pitchClassDifference * 100 + tuningCents;
}

function playMaskingNoise(duration: number): (() => void) | null {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  const frames = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) data[index] = (Math.random() * 2 - 1) * 0.18;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  filter.type = "bandpass";
  filter.frequency.value = 1_400;
  filter.Q.value = 0.35;
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.linearRampToValueAtTime(0.35, context.currentTime + 0.08);
  gain.gain.linearRampToValueAtTime(0.001, context.currentTime + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start();
  source.stop(context.currentTime + duration);
  window.setTimeout(() => void context.close(), (duration + 0.2) * 1000);
  return () => {
    try {
      source.stop();
    } catch {
      // The source may already have ended.
    }
    void context.close();
  };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
