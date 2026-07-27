"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PITCH_NAMES,
  answerTimeLimitMs,
  autocorrelatedFrequency,
  beginPitchSession,
  canStartCertification,
  completePitchSession,
  completedEarMidiNotes,
  courseHasVocalRange,
  firstPitchInVocalRange,
  isPitchAnswerCorrect,
  isFormalSession,
  midiForPitch,
  pitchNameForMidi,
  pitchIsInVocalRange,
  pitchStats,
  pitchTrainingCsv,
  type PitchName,
  retentionIsAvailable,
  sessionAllowsReplay,
  sessionAllowsRetry,
  skipPitchBaseline,
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
type MicrophoneMode = "answer" | "range-low" | "range-high";
type VocalRangeStep = "idle" | "low" | "high";
type SightRecording = { midi: number; cents: number } | null;
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
  onHighlightPitch: (midi: number | null) => void;
  onStatus: (message: string) => void;
  selectedTimbre: TrainingTimbre;
};

const MODULE_COPY = {
  ear: {
    eyebrow: "Pitch course · listening",
    title: "Single-note Ear Training",
    intro: "Hear one isolated note, then identify its exact pitch and octave on the existing piano.",
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
  selectedTimbre,
}: Props) {
  const copy = MODULE_COPY[module];
  const [view, setView] = useState<"course" | "report" | "settings">("course");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [stageADemos, setStageADemos] = useState(0);
  const [extraDemos, setExtraDemos] = useState(0);
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [microphoneMessage, setMicrophoneMessage] = useState("Microphone not checked");
  const [vocalRangeStep, setVocalRangeStep] = useState<VocalRangeStep>("idle");
  const [rangeDraftLow, setRangeDraftLow] = useState<number | null>(null);
  const [sightRecording, setSightRecording] = useState<SightRecording>(null);
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
  const currentTimbre = selectedTimbre;
  const hasVocalRange = courseHasVocalRange(course);
  const learnedCount = Math.max(1, course.learnedPitches.length);
  const formal = session ? isFormalSession(session.kind) : false;
  const timeLimit = session ? answerTimeLimitMs(module, session.stage, learnedCount) : 0;

  const stopMicrophone = useCallback(() => {
    microphoneStopRef.current?.();
    microphoneStopRef.current = null;
    setMicrophoneState((current) => current === "denied" ? current : "idle");
  }, []);

  const startMicrophone = useCallback(async (mode: MicrophoneMode = "answer") => {
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
      setMicrophoneMessage(
        mode === "range-low"
          ? "Sing and hold your lowest comfortable note."
          : mode === "range-high"
            ? "Sing and hold your highest comfortable note."
            : "Listening for one stable note…",
      );

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
            if (mode === "range-low") {
              setRangeDraftLow(roundedMidi);
              setVocalRangeStep("high");
              setMicrophoneMessage(`Lowest comfortable note captured: ${midiLabel(roundedMidi)}. Now capture your highest note.`);
              stop();
              microphoneStopRef.current = null;
            } else if (mode === "range-high") {
              if (rangeDraftLow === null || roundedMidi <= rangeDraftLow) {
                setMicrophoneState("listening");
                setMicrophoneMessage("The highest note must be above the captured lowest note. Try again.");
              } else {
                const rangedCourse: PitchCourseState = {
                  ...course,
                  microphoneCheckCompleted: true,
                  vocalRangeLowMidi: rangeDraftLow,
                  vocalRangeHighMidi: roundedMidi,
                  vocalRangeTestedAt: new Date().toISOString(),
                  activeSession: null,
                };
                const nextCurrentPitch = rangedCourse.currentPitch
                  && pitchIsInVocalRange(rangedCourse, rangedCourse.currentPitch)
                  ? rangedCourse.currentPitch
                  : firstPitchInVocalRange(rangedCourse);
                onChange({
                  ...rangedCourse,
                  currentPitch: rangedCourse.baselineCompleted ? nextCurrentPitch : rangedCourse.currentPitch,
                  learnedPitches: rangedCourse.baselineCompleted && nextCurrentPitch
                    ? [...new Set([...rangedCourse.learnedPitches, nextCurrentPitch])]
                    : rangedCourse.learnedPitches,
                });
                setVocalRangeStep("idle");
                setRangeDraftLow(null);
                setMicrophoneMessage(`Vocal range saved: ${midiLabel(rangeDraftLow)}–${midiLabel(roundedMidi)}.`);
                stop();
                microphoneStopRef.current = null;
              }
            } else {
              stablePitchCallbackRef.current({ midi: roundedMidi, cents });
              stop();
              microphoneStopRef.current = null;
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
  }, [course, onChange, rangeDraftLow, stopMicrophone]);

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
    const preparation = window.setTimeout(() => void startMicrophone("answer"), needsReferenceDelay ? 1_050 : 500);
    return () => window.clearTimeout(preparation);
  }, [feedback, module, session?.id, session?.index, session?.stage, startMicrophone, stopMicrophone]);

  useEffect(() => {
    if (!course.timed || !session || !question || session.stage === "A") return;
    const update = () => {
      const elapsed = Date.now() - new Date(session.questionStartedAt).getTime();
      setRemainingMs(Math.max(0, timeLimit - elapsed));
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [course.timed, question?.id, session?.id, session?.questionStartedAt, session?.stage, timeLimit]);

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
      target: `${response.target}${response.octave}`,
      answer: response.selectedMidi !== undefined
        ? midiLabel(response.selectedMidi)
        : response.detectedMidi !== undefined
          ? midiLabel(response.detectedMidi)
          : response.selectedPitch ?? response.detectedPitch ?? "No stable note",
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

    setFeedback(nextFeedback);
    onChange({ ...course, activeSession: nextSession });
    answeringRef.current = false;
  }, [course, module, onChange, onStatus, question?.midi, session, stopMicrophone]);

  const submitSightRecording = useCallback((timedOut = false) => {
    if (module !== "sight" || !session || !question || feedback) return;
    const detected = sightRecording;
    submitResponse({
      id: crypto.randomUUID(),
      sessionId: session.id,
      module,
      kind: session.kind,
      stage: session.stage,
      target: question.target,
      octave: question.octave,
      timbre: currentTimbre,
      representation: session.representation,
      detectedPitch: detected ? pitchNameForMidi(detected.midi) : undefined,
      detectedMidi: detected?.midi,
      cents: detected ? centsFromTarget(detected.midi, detected.cents, question.midi) : undefined,
      valid: Boolean(detected),
      correct: detected ? isPitchAnswerCorrect(module, detected.midi, question.midi) : false,
      octaveCorrect: detected ? Math.floor(detected.midi / 12) - 1 === question.octave : undefined,
      timeout: timedOut && !detected,
      assisted: session.retryUsed,
      replayed: false,
      deviceError: false,
      responseMs: timedOut
        ? timeLimit
        : Date.now() - new Date(session.questionStartedAt).getTime(),
      createdAt: new Date().toISOString(),
    });
  }, [currentTimbre, feedback, module, question, session, sightRecording, submitResponse, timeLimit]);

  function advanceAfterFeedback() {
    if (!session || !feedback) return;
    answeringRef.current = false;
    setFeedback(null);
    setSightRecording(null);
    if (session.index >= session.questions.length - 1) {
      const completed = completePitchSession(course, session);
      onChange(completed);
      const result = completed.sessions.at(-1);
      setCompletedSessionId(result?.id ?? null);
      onStatus(result?.passed === true ? "Stage passed" : result?.passed === false ? "Stage needs another pass" : "Session complete");
      return;
    }
    onChange({
      ...course,
      activeSession: {
        ...session,
        index: session.index + 1,
        questionStartedAt: new Date().toISOString(),
        replayUsed: false,
        retryUsed: false,
        deviceRetryUsed: false,
      },
    });
  }

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
    submitResponse(responseForDeviceError(session, question, currentTimbre));
  }, [currentTimbre, feedback, microphoneState, module, question, session, submitResponse]);

  useEffect(() => {
    const elapsed = session ? Date.now() - new Date(session.questionStartedAt).getTime() : 0;
    if (!course.timed || !session || !question || session.stage === "A" || feedback || remainingMs > 0 || elapsed < timeLimit || answeringRef.current) return;
    if (module === "sight") {
      submitSightRecording(true);
      return;
    }
    const response = responseForTimeout(session, question, currentTimbre);
    submitResponse(response);
  }, [course.timed, currentTimbre, feedback, module, question, remainingMs, session, submitResponse, submitSightRecording, timeLimit]);

  useEffect(() => {
    if (module !== "ear" || !pianoAnswer) return;
    if (pianoAnswer.id === handledPianoAnswerRef.current) return;
    handledPianoAnswerRef.current = pianoAnswer.id;
    if (!session || !question || session.stage === "A" || feedback) return;
    const selectedPitch = pitchNameForMidi(pianoAnswer.note);
    const response: PitchResponse = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      module,
      kind: session.kind,
      stage: session.stage,
      target: question.target,
      octave: question.octave,
      timbre: currentTimbre,
      representation: session.representation,
      selectedPitch,
      selectedMidi: pianoAnswer.note,
      valid: true,
      correct: isPitchAnswerCorrect(module, pianoAnswer.note, question.midi),
      octaveCorrect: Math.floor(pianoAnswer.note / 12) - 1 === question.octave,
      timeout: false,
      assisted: course.timed && session.replayUsed,
      replayed: session.replayUsed,
      deviceError: false,
      responseMs: Date.now() - new Date(session.questionStartedAt).getTime(),
      createdAt: new Date().toISOString(),
    };
    const timer = window.setTimeout(() => submitResponse(response), 0);
    return () => window.clearTimeout(timer);
  }, [course.timed, currentTimbre, feedback, module, pianoAnswer, question, session, submitResponse]);

  useEffect(() => {
    stablePitchCallbackRef.current = (detected) => {
      if (module !== "sight" || !session || !question || feedback) return;
      setSightRecording(detected);
      setMicrophoneMessage(`Stable recording captured: ${midiLabel(detected.midi)}.`);
    };
  }, [feedback, module, question, session]);

  useEffect(() => {
    const freshQuestion = session
      ? session.responses.length === session.index && !session.replayUsed
      : false;
    if (
      module !== "ear"
      || !session
      || !question
      || session.stage === "A"
      || (!freshQuestion && !session.deviceRetryUsed)
    ) return;
    const timer = window.setTimeout(() => {
      if (!onPlayTone(question.midi, currentTimbre, 0.8)) {
        submitResponse(responseForDeviceError(session, question, currentTimbre));
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [currentTimbre, module, onPlayTone, question, session, submitResponse]);

  useEffect(() => {
    if (module !== "sight" || !session || !question || session.stage === "A") return;
    const initialStageBReference = session.stage === "B"
      && session.responses.length === session.index
      && !session.retryUsed
      && !session.deviceRetryUsed;
    const deviceStageBReference = session.stage === "B" && session.deviceRetryUsed;
    if (!initialStageBReference && !deviceStageBReference && !session.retryUsed) return;
    const timer = window.setTimeout(() => {
      if (!onPlayTone(question.midi, currentTimbre, 0.8)) {
        submitResponse(responseForDeviceError(session, question, currentTimbre));
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [currentTimbre, module, onPlayTone, question, session, submitResponse]);

  function updateCourse(patch: Partial<PitchCourseState>) {
    onChange({ ...course, ...patch });
  }

  function beginVocalRangeTest() {
    stopMicrophone();
    setRangeDraftLow(null);
    setVocalRangeStep("low");
    void startMicrophone("range-low");
  }

  function captureVocalRangeHigh() {
    if (rangeDraftLow === null) {
      beginVocalRangeTest();
      return;
    }
    void startMicrophone("range-high");
  }

  function start(kind: PitchSessionKind, practicePitch?: PitchName) {
    if (module === "sight" && !hasVocalRange) {
      onStatus("Complete the vocal range test before starting Sight Singing");
      return;
    }
    setFeedback(null);
    setSightRecording(null);
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
    const practiceCourse = practicePitch
      ? {
          ...course,
          currentPitch: practicePitch,
          learnedPitches: [...new Set([...course.learnedPitches, practicePitch])],
          earFullKeyboardUnlocked: module === "ear" ? false : course.earFullKeyboardUnlocked,
        }
      : course;
    const started = beginPitchSession(module, kind, practiceCourse);
    onChange(practicePitch
      ? {
          ...started,
          currentPitch: course.currentPitch,
          learnedPitches: course.learnedPitches,
          earFullKeyboardUnlocked: course.earFullKeyboardUnlocked,
        }
      : started);
  }

  function skipBaseline() {
    if (module === "sight" && !hasVocalRange) {
      onStatus("The first vocal range test cannot be skipped");
      return;
    }
    setFeedback(null);
    setCompletedSessionId(null);
    const skipped = skipPitchBaseline(course, module);
    onChange(skipped);
    onStatus(`Baseline skipped · course starts with ${skipped.currentPitch ?? "C"}`);
  }

  function playStageADemo() {
    if (!session || !question) return;
    if (!onPlayTone(question.midi, currentTimbre, 0.8)) {
      onStatus("Audio output is unavailable");
      return;
    }
    if (module === "ear") {
      onHighlightPitch(question.midi);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => onHighlightPitch(null), 850);
    }
    setStageADemos((count) => count + 1);
    if (module === "ear") onStatus("The exact played key is marked; the main pitch appears most often.");
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
    if (module !== "ear") return;
    if (!session || !question || (course.timed && !sessionAllowsReplay(session))) return;
    if (!onPlayTone(question.midi, currentTimbre, 0.8)) {
      submitResponse(responseForDeviceError(session, question, currentTimbre));
      return;
    }
    onChange({ ...course, activeSession: { ...session, replayUsed: true } });
  }

  function replayFeedback() {
    if (module !== "ear") return;
    if (!session || !question || !feedback) return;
    if (!onPlayTone(question.midi, currentTimbre, 0.8)) {
      onStatus("Audio output is unavailable");
    }
  }

  function retrySight() {
    if (!session || (!feedback?.deviceError && !sessionAllowsRetry(session))) return;
    setFeedback(null);
    setSightRecording(null);
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
    setSightRecording(null);
    answeringRef.current = false;
    updateCourse({ activeSession: null });
    onStatus(formal ? "Formal session exited without a result" : "Session paused and closed");
  }

  function recordSightAgain() {
    if (module !== "sight" || !session || !question || feedback) return;
    stopMicrophone();
    setSightRecording(null);
    setMicrophoneState("idle");
    setMicrophoneMessage("Listening for a new recording…");
    void startMicrophone("answer");
  }

  function finishSightRecording() {
    if (module !== "sight" || !session || !question || feedback) return;
    stopMicrophone();
    submitSightRecording(false);
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

  if (module === "sight" && !hasVocalRange) {
    return (
      <section className="pitch-module">
        <PageHeading copy={copy} retained={0} view={view} onView={setView} showNavigation={false} />
        <div className="pitch-onboarding">
          <div>
            <p className="eyebrow">Required first step</p>
            <h2>Measure your comfortable vocal range</h2>
            <p>Capture one comfortable low note and one comfortable high note. Every Sight Singing target will stay inside this range.</p>
            <ul>
              <li>Use a steady, unaccompanied vowel sound.</li>
              <li>Do not force either end of your range.</li>
              <li>The first range test cannot be skipped; it can be repeated later.</li>
            </ul>
          </div>
          <div className="vocal-range-card">
            <p className="eyebrow">Vocal range test</p>
            <div className="vocal-range-steps">
              <div className={rangeDraftLow !== null ? "complete" : vocalRangeStep === "low" ? "active" : ""}>
                <span>01</span>
                <strong>Lowest comfortable note</strong>
                <small>{rangeDraftLow === null ? "Not captured" : midiLabel(rangeDraftLow)}</small>
              </div>
              <div className={vocalRangeStep === "high" ? "active" : ""}>
                <span>02</span>
                <strong>Highest comfortable note</strong>
                <small>Captured after the low note</small>
              </div>
            </div>
            <p className={`range-listening ${microphoneState}`}>{microphoneMessage}</p>
            {vocalRangeStep === "high" ? (
              <button
                className="primary-button"
                disabled={microphoneState === "requesting" || microphoneState === "listening"}
                onClick={captureVocalRangeHigh}
              >
                {microphoneState === "requesting" || microphoneState === "listening" ? "Listening…" : "Capture highest note"}
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={vocalRangeStep === "low" && (microphoneState === "requesting" || microphoneState === "listening")}
                onClick={beginVocalRangeTest}
              >
                {vocalRangeStep === "low" ? "Retry lowest note" : "Start vocal range test"}
              </button>
            )}
          </div>
        </div>
      </section>
    );
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
        sightRecording={sightRecording}
        stageADemos={stageADemos}
        extraDemos={extraDemos}
        onExit={exitSession}
        onReplay={replay}
        onReplayFeedback={replayFeedback}
        onRecordAgain={recordSightAgain}
        onFinishRecording={finishSightRecording}
        onNext={advanceAfterFeedback}
        onRetry={retrySight}
        onPlayDemo={playStageADemo}
        onPlayExtra={() => {
          if (!question || extraDemos >= 6) return;
          if (!onPlayTone(question.midi, currentTimbre, 0.8)) {
            onStatus("Audio output is unavailable");
            return;
          }
          if (module === "ear") {
            onHighlightPitch(question.midi);
            if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = window.setTimeout(() => onHighlightPitch(null), 850);
          }
          setExtraDemos((count) => count + 1);
        }}
        onFinishStageA={finishStageA}
        timed={course.timed}
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
              <li>{module === "ear"
                ? "A4 is fixed at 440 Hz; questions span C3–B5."
                : `Targets stay inside your saved range: ${midiLabel(course.vocalRangeLowMidi as number)}–${midiLabel(course.vocalRangeHighMidi as number)}.`}</li>
              <li>{module === "ear" ? "The baseline has 108 questions and may be skipped." : "The baseline has 36 questions and may be skipped."}</li>
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
              <div className="vocal-range-summary">
                <span>02</span>
                <strong>Vocal range ready</strong>
                <small>{midiLabel(course.vocalRangeLowMidi as number)}–{midiLabel(course.vocalRangeHighMidi as number)}</small>
              </div>
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
            <div className="setup-option">
              <span>Answer timing</span>
              <div className="segmented" aria-label="Answer timing">
                <button className={course.timed ? "active" : ""} onClick={() => updateCourse({ timed: true })}>Timed</button>
                <button className={!course.timed ? "active" : ""} onClick={() => updateCourse({ timed: false })}>No limit</button>
              </div>
              {!course.timed && <small>{module === "ear"
                ? "Target sounds can be replayed as often as needed."
                : "Recordings can be repeated until you choose one to submit."}</small>}
            </div>
            <div className="baseline-actions">
              <button
                className="primary-button"
                disabled={!course.volumeCheckCompleted || (module === "sight" && !hasVocalRange)}
                onClick={() => start("baseline")}
              >
                Start baseline
              </button>
              <button disabled={module === "sight" && !hasVocalRange} onClick={skipBaseline}>Skip baseline</button>
            </div>
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
            <p className="eyebrow">Timing</p>
            <h2>Answer window</h2>
            <p>{module === "ear"
              ? "Timed mode uses an answer window; No limit allows repeated target playback."
              : "Timed mode can be ended early; No limit allows repeated recording before submission."}</p>
          </div>
          <div className="segmented" aria-label="Answer timing">
            <button className={course.timed ? "active" : ""} onClick={() => updateCourse({ timed: true })}>Timed</button>
            <button className={!course.timed ? "active" : ""} onClick={() => updateCourse({ timed: false })}>No limit</button>
          </div>
          {module === "sight" && <>
            <div>
              <p className="eyebrow">Representation</p>
              <h2>Sight-reading display</h2>
              <p>The selection is fixed when a session starts.</p>
            </div>
            <div className="segmented" aria-label="Sight-singing representation">
              <button className={course.representation === "note-name" ? "active" : ""} onClick={() => updateCourse({ representation: "note-name" })}>Note name</button>
              <button className={course.representation === "staff" ? "active" : ""} onClick={() => updateCourse({ representation: "staff" })}>Staff</button>
            </div>
          </>}
          {module === "sight" && (
            <div className="vocal-range-settings">
              <span>Current vocal range</span>
              <strong>{midiLabel(course.vocalRangeLowMidi as number)}–{midiLabel(course.vocalRangeHighMidi as number)}</strong>
              <small>{vocalRangeStep === "high" ? microphoneMessage : "Retesting replaces the saved range after both notes are captured."}</small>
              {vocalRangeStep === "high" ? (
                <button
                  disabled={microphoneState === "requesting" || microphoneState === "listening"}
                  onClick={captureVocalRangeHigh}
                >
                  {microphoneState === "requesting" || microphoneState === "listening" ? "Listening…" : "Capture highest note"}
                </button>
              ) : (
                <button
                  disabled={vocalRangeStep === "low" && (microphoneState === "requesting" || microphoneState === "listening")}
                  onClick={beginVocalRangeTest}
                >
                  {vocalRangeStep === "low" ? "Retry lowest note" : "Retest vocal range"}
                </button>
              )}
            </div>
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
  onStart: (kind: PitchSessionKind, practicePitch?: PitchName) => void;
}) {
  const recentCertification = [...course.sessions].reverse().find((session) => session.kind === "certification");
  const current = course.currentPitch ?? PITCH_NAMES[0];
  const dueWeekly = weeklyIsDue(course);
  const certificationAvailable = canStartCertification(course);
  const retentionAvailable = retentionIsAvailable(course);
  const retentionTime = course.pendingRetentionAt ? new Date(course.pendingRetentionAt) : null;
  const stageKind: PitchSessionKind = course.stage === "A" ? "stage-a" : "training";
  const fullKeyboard = module === "ear" && course.earFullKeyboardUnlocked;
  const completedKeys = fullKeyboard ? completedEarMidiNotes(course).length : 0;
  const practiceOptions = [...PITCH_NAMES];
  const [waitingPracticePitch, setWaitingPracticePitch] = useState<PitchName>(
    course.currentPitch ?? practiceOptions[0],
  );
  const selectedPracticePitch = practiceOptions.includes(waitingPracticePitch)
    ? waitingPracticePitch
    : practiceOptions[0];

  return (
    <div className="pitch-dashboard">
      <article className="pitch-current">
        <div>
          <p className="eyebrow">Current course point</p>
          <h2>{fullKeyboard && course.stage === "C" ? "88-key expansion" : STAGE_NAMES[course.stage]}</h2>
          <p>{fullKeyboard
            ? `${completedKeys}/88 piano keys completed · incomplete keys are prioritised`
            : <>Working pitch <strong>{current}</strong> · {course.learnedPitches.length} learned · {course.retainedPitches.length} retained</>}</p>
        </div>
        <div className="pitch-stage-mark" aria-label={`Stage ${course.stage}`}>{course.stage}</div>
      </article>
      <div className="pitch-metrics">
        <article><span>{fullKeyboard ? "Keyboard coverage" : "Retained"}</span><strong>{fullKeyboard ? `${completedKeys}/88` : `${course.retainedPitches.length}/12`}</strong><small>{fullKeyboard ? `${88 - completedKeys} keys remaining` : course.retainedPitches.join(" · ") || "Course just started"}</small></article>
        <article><span>Recent certification</span><strong>{recentCertification ? percent(recentCertification.accuracy) : "—"}</strong><small>{recentCertification ? new Date(recentCertification.completedAt).toLocaleDateString() : "No formal result yet"}</small></article>
        <article><span>{module === "ear" ? "Median response" : "Valid singing"}</span><strong>{recentCertification ? module === "ear" ? `${(recentCertification.medianResponseMs / 1000).toFixed(2)}s` : percent(recentCertification.validRate) : "—"}</strong><small>Formal sessions only</small></article>
      </div>
      {fullKeyboard && (
        <div className="keyboard-coverage" aria-label={`${completedKeys} of 88 piano keys completed`}>
          <div><span>88-key completion</span><strong>{completedKeys}/88</strong></div>
          <div className="keyboard-coverage-track"><i style={{ width: `${completedKeys / 88 * 100}%` }} /></div>
          <small>A0–C8 · each key completes after one correct unassisted answer</small>
        </div>
      )}
      <div className="pitch-actions">
        <article>
          <p className="eyebrow">Recommended next</p>
          <h3>{fullKeyboard && course.stage === "C" ? "Complete every piano key" : course.stage === "F" ? "Overnight check" : STAGE_NAMES[course.stage]}</h3>
          <p>{fullKeyboard && course.stage === "C"
            ? "Training blocks prioritise keys that have not yet received a correct unassisted answer."
            : stageDescription(module, course.stage)}</p>
          {course.stage === "E" ? (
            <button className="primary-button" disabled={!certificationAvailable || masking} onClick={() => onStart("certification")}>
              {masking ? "Masking sound · test starts shortly" : certificationAvailable ? "Start certification" : "Daily certification limit reached"}
            </button>
          ) : course.stage === "F" ? (
            <div className="overnight-actions">
              <button className="primary-button" disabled={!retentionAvailable || masking} onClick={() => onStart("retention")}>
                {masking ? "Masking sound · test starts shortly" : retentionAvailable ? "Start retention test" : `Available ${retentionTime?.toLocaleString() ?? "after 12 hours"}`}
              </button>
              {!retentionAvailable && (
                <>
                  <label>
                    <span>Practice focus</span>
                    <select
                      value={selectedPracticePitch}
                      onChange={(event) => setWaitingPracticePitch(event.target.value as PitchName)}
                    >
                      {practiceOptions.map((pitch) => <option key={pitch} value={pitch}>{pitch}</option>)}
                    </select>
                  </label>
                  <button onClick={() => onStart("training", selectedPracticePitch)}>Practice while waiting</button>
                </>
              )}
            </div>
          ) : (
            <button className="primary-button" onClick={() => onStart(stageKind)}>
              {course.stage === "A" ? "Start association" : "Start training block"}
            </button>
          )}
        </article>
        <article>
          <p className="eyebrow">Weekly calibration</p>
          <h3>{dueWeekly ? "Weekly test is ready" : "Not due yet"}</h3>
          <p>{module === "ear"
            ? fullKeyboard
              ? "88 questions covering A0–C8, with one question for every piano key."
              : "108 questions across the middle three octaves using the currently selected piano sound."
            : "36 balanced questions across twelve pitch names."}</p>
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
  sightRecording,
  stageADemos,
  extraDemos,
  onExit,
  onReplay,
  onReplayFeedback,
  onRecordAgain,
  onFinishRecording,
  onNext,
  onRetry,
  onPlayDemo,
  onPlayExtra,
  onFinishStageA,
  timed,
}: {
  module: PitchModule;
  session: PitchSession;
  question: PitchSession["questions"][number] | undefined;
  feedback: Feedback | null;
  remainingMs: number;
  microphoneState: MicrophoneState;
  sightRecording: SightRecording;
  stageADemos: number;
  extraDemos: number;
  onExit: () => void;
  onReplay: () => void;
  onReplayFeedback: () => void;
  onRecordAgain: () => void;
  onFinishRecording: () => void;
  onNext: () => void;
  onRetry: () => void;
  onPlayDemo: () => void;
  onPlayExtra: () => void;
  onFinishStageA: () => void;
  timed: boolean;
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
          {module === "ear" && <div className="sound-orbit" aria-label="Sound demonstration"><i /><span>Main pitch weighted · nearby seconds mixed in</span></div>}
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
        <div><p className="eyebrow">{formal ? `${module === "ear" ? "Ear training" : "Sight singing"} · feedback after each answer` : `${module === "ear" ? "Ear training" : "Sight singing"} · Stage ${session.stage}`}</p><h1>{title}</h1></div>
        <span>{session.index + 1} / {session.questions.length}</span>
      </div>
      <div className="pitch-progress"><i style={{ width: `${progress * 100}%` }} /></div>
      <div className={`pitch-question ${module}`}>
        <div className="pitch-question-meta">
          <span>{module === "ear" ? "Sound" : "Target"}</span>
          <strong>{timed ? `${(remainingMs / 1000).toFixed(1)}s` : "No limit"}</strong>
        </div>
        {module === "ear" ? (
          <div className="ear-prompt">
            <div className="sound-orbit"><i /><span>Sound played · choose one piano key</span></div>
            {!feedback && (!timed || sessionAllowsReplay(session)) && (
              <button onClick={onReplay}>{timed ? "Replay once · marks this answer assisted" : "Replay sound"}</button>
            )}
          </div>
        ) : (
          <div className="sight-prompt">
            {session.representation === "note-name"
              ? <div className="sight-note-name">{question.target}{question.octave}</div>
              : <StaffNote midi={question.midi} pitch={question.target} />}
            <div className={`recording-state ${microphoneState}`}>
              <i />
              <span>{microphoneState === "requesting" ? "Preparing microphone" : sightRecording ? "Stable recording captured" : "Listening for one stable note"}</span>
            </div>
            {!feedback && (
              <div className="recording-actions">
                {timed ? (
                  <button
                    className="primary-button"
                    disabled={microphoneState === "idle" || microphoneState === "requesting"}
                    onClick={onFinishRecording}
                  >
                    End recording
                  </button>
                ) : sightRecording ? (
                  <>
                    <button onClick={onRecordAgain}>Record again</button>
                    <button className="primary-button" onClick={onFinishRecording}>Use recording</button>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}
        {feedback && (
          <div className={`pitch-feedback ${feedback.correct ? "correct" : "wrong"}`} role="status">
            <strong>{feedback.batchAccuracy !== undefined ? "Six-question checkpoint" : feedback.deviceError ? "Audio device interrupted" : feedback.correct ? "Correct pitch" : feedback.answer === "No stable note" ? "No stable single note" : "Try that pitch again"}</strong>
            <span>{feedback.batchAccuracy !== undefined ? `${percent(feedback.batchAccuracy)} in this block · individual answers remain hidden` : feedback.deviceError ? "This question is excluded and can be attempted again." : `Target ${feedback.target} · received ${feedback.answer}${feedback.direction ? ` · ${feedback.direction}` : ""}`}</span>
            <div className="pitch-feedback-actions">
              {module === "ear" && !feedback.deviceError && <button onClick={onReplayFeedback}>Replay sound</button>}
              {feedback.retryAvailable && <button onClick={onRetry}>{feedback.deviceError ? "Reconnect and retry question" : module === "ear" ? "Listen once and retry · assisted" : "Record again · assisted"}</button>}
              {!feedback.deviceError && <button className="primary-button" onClick={onNext}>Next</button>}
            </div>
          </div>
        )}
      </div>
      <p className="pitch-session-note">
        {module === "ear" ? "Select the exact piano key, including the correct octave." : "Sing the exact displayed pitch inside your saved vocal range."}
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

function responseForTimeout(
  session: PitchSession,
  question: PitchSession["questions"][number],
  timbre: TrainingTimbre,
): PitchResponse {
  return {
    id: crypto.randomUUID(),
    sessionId: session.id,
    module: session.module,
    kind: session.kind,
    stage: session.stage,
    target: question.target,
    octave: question.octave,
    timbre,
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

function responseForDeviceError(
  session: PitchSession,
  question: PitchSession["questions"][number],
  timbre: TrainingTimbre,
): PitchResponse {
  return {
    id: crypto.randomUUID(),
    sessionId: session.id,
    module: session.module,
    kind: session.kind,
    stage: session.stage,
    target: question.target,
    octave: question.octave,
    timbre,
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

function midiLabel(midi: number): string {
  return `${pitchNameForMidi(midi)}${Math.floor(midi / 12) - 1}`;
}

function stageDescription(module: PitchModule, stage: PitchCourseState["stage"]): string {
  if (stage === "A") return module === "ear" ? "Hear the main pitch most often while nearby seconds are mixed across three octaves." : "Connect the visual target, standard sound, and your singing action.";
  if (stage === "B") return module === "ear" ? "Add the new pitch to a cumulative mix of every pitch already learned." : "Hear the target once, then reproduce it with immediate feedback.";
  if (stage === "C") return "Recall all learned pitches with guidance and one assisted second attempt.";
  if (stage === "D") return "Build faster, stable responses with feedback after every answer.";
  if (stage === "E") return "Complete a formal mixed certification with the current pitch weighted and feedback before each Next step.";
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
