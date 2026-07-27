import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PITCH_TRAINING_STATE,
  PITCH_LEARNING_ORDER,
  PITCH_NAMES,
  autocorrelatedFrequency,
  beginPitchSession,
  canStartCertification,
  completePitchSession,
  completedEarMidiNotes,
  courseHasVocalRange,
  createPitchSession,
  isPitchAnswerCorrect,
  midiForPitch,
  normalizePitchTrainingState,
  pitchNameForMidi,
  pitchTrainingCsv,
  retentionIsAvailable,
  samePitchName,
  skipPitchBaseline,
  summarizePitchSession,
} from "../lib/pitch-training.ts";

function seededRandom() {
  let state = 123456789;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function answerSession(session, correct) {
  session.responses = session.questions.map((question, index) => ({
    id: `answer-${session.id}-${index}`,
    sessionId: session.id,
    module: session.module,
    kind: session.kind,
    stage: session.stage,
    target: question.target,
    octave: question.octave,
    timbre: question.timbre,
    representation: session.representation,
    selectedPitch: correct ? question.target : question.target === "C" ? "D" : "C",
    selectedMidi: correct ? question.midi : midiForPitch(question.target === "C" ? "D" : "C", question.octave),
    detectedPitch: session.module === "sight" ? correct ? question.target : question.target === "C" ? "D" : "C" : undefined,
    detectedMidi: session.module === "sight" ? correct ? question.midi : midiForPitch(question.target === "C" ? "D" : "C", question.octave) : undefined,
    valid: true,
    correct,
    timeout: false,
    assisted: false,
    replayed: false,
    deviceError: false,
    responseMs: 900,
    createdAt: new Date().toISOString(),
  }));
  return session;
}

test("uses the documented pitch names and learning order", () => {
  assert.deepEqual(PITCH_NAMES, ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"]);
  assert.deepEqual(PITCH_LEARNING_ORDER, PITCH_NAMES);
});

test("both pitch modules require the exact octave", () => {
  assert.equal(samePitchName(midiForPitch("C", 3), midiForPitch("C", 5)), true);
  assert.equal(samePitchName(midiForPitch("C", 3), midiForPitch("C♯", 3)), false);
  assert.equal(isPitchAnswerCorrect("ear", midiForPitch("C", 3), midiForPitch("C", 3)), true);
  assert.equal(isPitchAnswerCorrect("ear", midiForPitch("C", 5), midiForPitch("C", 3)), false);
  assert.equal(isPitchAnswerCorrect("sight", midiForPitch("C", 5), midiForPitch("C", 3)), false);
  assert.equal(pitchNameForMidi(midiForPitch("E♭", 5)), "E♭");
});

test("detects a stable A4 waveform and rejects silence", () => {
  const sampleRate = 48_000;
  const sine = Float32Array.from({ length: 4096 }, (_, index) =>
    Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.2,
  );
  const detected = autocorrelatedFrequency(sine, sampleRate);
  assert.ok(detected);
  assert.ok(Math.abs(detected - 440) < 3);
  assert.equal(autocorrelatedFrequency(new Float32Array(4096), sampleRate), null);
});

test("ear baseline contains the exact 12 × 3 × 3 balanced grid", () => {
  const session = createPitchSession("ear", "baseline", DEFAULT_PITCH_TRAINING_STATE.ear, new Date(), seededRandom());
  assert.equal(session.questions.length, 108);
  for (const pitch of PITCH_NAMES) {
    const questions = session.questions.filter((question) => question.target === pitch);
    assert.equal(questions.length, 9);
    assert.deepEqual([...new Set(questions.map((question) => question.octave))].sort(), [3, 4, 5]);
    assert.equal(new Set(questions.map((question) => question.timbre)).size, 3);
  }
  assert.ok(session.questions.every((question, index) => index === 0 || question.target !== session.questions[index - 1].target));
});

test("ear training grows from cumulative pitch mixing into complete 88-key coverage", () => {
  const associationCourse = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    baselineCompleted: true,
    stage: "A",
    currentPitch: "C",
    learnedPitches: ["C"],
  };
  const association = createPitchSession("ear", "stage-a", associationCourse, new Date(), seededRandom());
  const associationCounts = Object.groupBy(association.questions, (question) => question.target);
  assert.ok(Object.keys(associationCounts).length > 1);
  assert.ok(associationCounts.C.length > Math.max(
    ...Object.entries(associationCounts)
      .filter(([pitch]) => pitch !== "C")
      .map(([, questions]) => questions.length),
  ));
  assert.ok(association.questions
    .filter((question) => question.target !== "C")
    .every((question) =>
      [3, 4, 5].some((octave) =>
        Math.abs(question.midi - midiForPitch("C", octave)) <= 2,
      )));

  const lowerNeighborCourse = {
    ...associationCourse,
    stage: "B",
    learnedPitches: ["C", "B"],
  };
  const lowerNeighbor = createPitchSession("ear", "training", lowerNeighborCourse, new Date(), seededRandom());
  const lowerNeighborMidis = [...new Set(
    lowerNeighbor.questions
      .filter((question) => question.target === "B")
      .map((question) => question.midi),
  )];
  assert.ok(lowerNeighborMidis.includes(midiForPitch("B", 2)));
  assert.ok(lowerNeighborMidis.every((midi) =>
    [2, 3, 4].some((octave) => midi === midiForPitch("B", octave)),
  ));
  assert.ok(!lowerNeighborMidis.includes(midiForPitch("B", 5)));

  const mixedCourse = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    baselineCompleted: true,
    stage: "B",
    currentPitch: "E",
    learnedPitches: ["C", "C♯", "D", "E♭", "E"],
  };
  const mixed = createPitchSession("ear", "training", mixedCourse, new Date(), seededRandom());
  const mixedTargets = new Set(mixed.questions.map((question) => question.target));
  assert.ok(mixedCourse.learnedPitches.every((pitch) => mixedTargets.has(pitch)));
  const mixedCounts = Object.groupBy(mixed.questions, (question) => question.target);
  assert.ok(mixedCounts.E.length > Math.max(
    ...Object.entries(mixedCounts)
      .filter(([pitch]) => pitch !== "E")
      .map(([, questions]) => questions.length),
  ));
  assert.ok(mixed.questions.every((question) => question.octave >= 3 && question.octave <= 5));

  const certificationCourse = {
    ...mixedCourse,
    stage: "E",
    currentPitch: "B",
    learnedPitches: [...PITCH_NAMES],
  };
  const certification = createPitchSession("ear", "certification", certificationCourse, new Date(), seededRandom());
  const certificationCounts = Object.groupBy(certification.questions, (question) => question.target);
  assert.equal(Object.keys(certificationCounts).length, 12);
  assert.ok(certificationCounts.B.length > Math.max(
    ...Object.entries(certificationCounts)
      .filter(([pitch]) => pitch !== "B")
      .map(([, questions]) => questions.length),
  ));

  let fullCourse = {
    ...mixedCourse,
    stage: "C",
    currentPitch: "B",
    learnedPitches: [...PITCH_NAMES],
    retainedPitches: [...PITCH_NAMES],
    earFullKeyboardUnlocked: true,
  };
  const firstBlock = createPitchSession("ear", "training", fullCourse, new Date(), seededRandom());
  assert.equal(firstBlock.questions.length, 72);
  assert.ok(firstBlock.questions.every((question) => question.midi >= 21 && question.midi <= 108));
  fullCourse = completePitchSession(fullCourse, answerSession(firstBlock, true));
  assert.equal(completedEarMidiNotes(fullCourse).length, 72);
  assert.equal(fullCourse.stage, "C");

  const secondBlock = createPitchSession("ear", "training", fullCourse, new Date(), seededRandom());
  const firstCovered = new Set(completedEarMidiNotes(fullCourse));
  const missing = Array.from({ length: 88 }, (_, index) => index + 21).filter((midi) => !firstCovered.has(midi));
  assert.ok(missing.every((midi) => secondBlock.questions.some((question) => question.midi === midi)));
  fullCourse = completePitchSession(fullCourse, answerSession(secondBlock, true));
  assert.equal(completedEarMidiNotes(fullCourse).length, 88);
  assert.equal(fullCourse.stage, "E");
});

test("sight baseline contains 36 balanced questions and freezes representation", () => {
  const state = normalizePitchTrainingState({
    sight: {
      ...DEFAULT_PITCH_TRAINING_STATE.sight,
      representation: "staff",
      vocalRangeLowMidi: midiForPitch("G", 3),
      vocalRangeHighMidi: midiForPitch("E", 5),
    },
  });
  const session = createPitchSession("sight", "baseline", state.sight, new Date(), seededRandom());
  assert.equal(session.questions.length, 36);
  assert.equal(session.representation, "staff");
  assert.ok(session.questions.every((question) =>
    question.midi >= state.sight.vocalRangeLowMidi
    && question.midi <= state.sight.vocalRangeHighMidi,
  ));
  for (const pitch of PITCH_NAMES) {
    assert.equal(session.questions.filter((question) => question.target === pitch).length, 3);
  }
});

test("sight singing uses weighted second-neighbor confusion in learning and certification", () => {
  const range = {
    vocalRangeLowMidi: midiForPitch("C", 3),
    vocalRangeHighMidi: midiForPitch("B", 5),
    vocalRangeTestedAt: new Date().toISOString(),
  };
  const associationCourse = {
    ...DEFAULT_PITCH_TRAINING_STATE.sight,
    ...range,
    baselineCompleted: true,
    stage: "A",
    currentPitch: "C",
    learnedPitches: ["C"],
  };
  const association = createPitchSession("sight", "stage-a", associationCourse, new Date(), seededRandom());
  const associationCounts = Object.groupBy(association.questions, (question) => question.target);
  assert.ok(Object.keys(associationCounts).length > 1);
  assert.ok(associationCounts.C.length > Math.max(
    ...Object.entries(associationCounts)
      .filter(([pitch]) => pitch !== "C")
      .map(([, questions]) => questions.length),
  ));
  assert.ok(association.questions.every((question) =>
    question.midi >= range.vocalRangeLowMidi
    && question.midi <= range.vocalRangeHighMidi,
  ));

  const lowerNeighborCourse = {
    ...associationCourse,
    stage: "B",
    learnedPitches: ["C", "B"],
  };
  const lowerNeighbor = createPitchSession("sight", "training", lowerNeighborCourse, new Date(), seededRandom());
  const lowerNeighborMidis = [...new Set(
    lowerNeighbor.questions
      .filter((question) => question.target === "B")
      .map((question) => question.midi),
  )];
  assert.ok(lowerNeighborMidis.length > 0);
  assert.ok(lowerNeighborMidis.every((midi) =>
    [3, 4].some((octave) => midi === midiForPitch("B", octave)),
  ));
  assert.ok(!lowerNeighborMidis.includes(midiForPitch("B", 2)));
  assert.ok(!lowerNeighborMidis.includes(midiForPitch("B", 5)));

  const certificationCourse = {
    ...associationCourse,
    stage: "E",
    currentPitch: "E",
    learnedPitches: ["C", "C♯", "D", "E♭", "E"],
  };
  const certification = createPitchSession("sight", "certification", certificationCourse, new Date(), seededRandom());
  const certificationCounts = Object.groupBy(certification.questions, (question) => question.target);
  assert.ok(certificationCourse.learnedPitches.every((pitch) => certificationCounts[pitch]));
  assert.ok(certificationCounts.E.length > Math.max(
    ...Object.entries(certificationCounts)
      .filter(([pitch]) => pitch !== "E")
      .map(([, questions]) => questions.length),
  ));
  assert.ok(certification.questions.every((question) =>
    question.midi >= range.vocalRangeLowMidi
    && question.midi <= range.vocalRangeHighMidi,
  ));
});

test("sight singing requires a measured range before baseline or learning can start", () => {
  const initial = DEFAULT_PITCH_TRAINING_STATE.sight;
  assert.equal(courseHasVocalRange(initial), false);
  assert.equal(beginPitchSession("sight", "baseline", initial), initial);
  assert.equal(skipPitchBaseline(initial, "sight"), initial);

  const measured = {
    ...initial,
    vocalRangeLowMidi: midiForPitch("A", 3),
    vocalRangeHighMidi: midiForPitch("D", 5),
    vocalRangeTestedAt: new Date().toISOString(),
  };
  assert.equal(courseHasVocalRange(measured), true);
  const baseline = beginPitchSession("sight", "baseline", measured, new Date(), seededRandom());
  assert.ok(baseline.activeSession);
  assert.ok(baseline.activeSession.questions.every((question) =>
    question.midi >= measured.vocalRangeLowMidi
    && question.midi <= measured.vocalRangeHighMidi,
  ));
  const skipped = skipPitchBaseline(measured, "sight");
  assert.equal(skipped.baselineCompleted, true);
});

test("the two course states normalize independently", () => {
  const state = normalizePitchTrainingState({
    ear: { ...DEFAULT_PITCH_TRAINING_STATE.ear, retainedPitches: ["F"] },
  });
  assert.deepEqual(state.ear.retainedPitches, ["F"]);
  assert.deepEqual(state.sight.retainedPitches, []);
  assert.notEqual(state.ear, state.sight);
  assert.equal(state.ear.timed, true);
  assert.equal(state.sight.timed, true);
});

test("baseline can be skipped without affecting the other course", () => {
  const skipped = skipPitchBaseline(DEFAULT_PITCH_TRAINING_STATE.ear);
  assert.equal(skipped.baselineCompleted, true);
  assert.equal(skipped.stage, "A");
  assert.equal(skipped.currentPitch, "C");
  assert.deepEqual(skipped.learnedPitches, ["C"]);
  assert.equal(DEFAULT_PITCH_TRAINING_STATE.sight.baselineCompleted, false);
});

test("formal results exclude assisted and device-error responses", () => {
  const state = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    stage: "E",
    currentPitch: "F",
    learnedPitches: ["F"],
  };
  const session = createPitchSession("ear", "certification", state, new Date(), seededRandom());
  session.responses = session.questions.map((question, index) => ({
    id: `r-${index}`,
    sessionId: session.id,
    module: "ear",
    kind: "certification",
    stage: "E",
    target: question.target,
    octave: question.octave,
    timbre: question.timbre,
    representation: "note-name",
    selectedPitch: index === 0 ? "E" : "F",
    selectedMidi: midiForPitch(index === 0 ? "E" : "F", 4),
    valid: true,
    correct: index !== 0,
    timeout: false,
    assisted: index === 0,
    replayed: index === 0,
    deviceError: false,
    responseMs: 1000,
    createdAt: new Date().toISOString(),
  }));
  session.responses[1].deviceError = true;
  session.responses[1].correct = false;
  const summary = summarizePitchSession(session);
  assert.equal(summary.scored, session.questions.length - 2);
  assert.equal(summary.accuracy, 1);
  assert.equal(summary.passed, true);
});

test("certification is limited to two starts per local day and retention waits 12 hours", () => {
  const now = new Date("2026-07-27T08:00:00");
  const course = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    stage: "E",
    certificationAttempts: { "2026-07-27": 2 },
  };
  assert.equal(canStartCertification(course, now), false);
  const retention = {
    ...course,
    stage: "F",
    pendingRetentionAt: "2026-07-27T20:00:00",
  };
  assert.equal(retentionIsAvailable(retention, new Date("2026-07-27T19:59:59")), false);
  assert.equal(retentionIsAvailable(retention, new Date("2026-07-27T20:00:00")), true);
});

test("formal attempts are consumed when a session starts, including an abandoned session", () => {
  const now = new Date("2026-07-27T08:00:00");
  const ready = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    stage: "E",
    currentPitch: "F",
    learnedPitches: ["F"],
  };
  const first = beginPitchSession("ear", "certification", ready, now, seededRandom());
  assert.equal(first.certificationAttempts["2026-07-27"], 1);
  assert.ok(first.activeSession);
  const abandoned = { ...first, activeSession: null };
  const second = beginPitchSession("ear", "certification", abandoned, now, seededRandom());
  assert.equal(second.certificationAttempts["2026-07-27"], 2);
  const blocked = beginPitchSession("ear", "certification", { ...second, activeSession: null }, now, seededRandom());
  assert.equal(blocked.activeSession, null);
});

test("a retention opening can only be started once", () => {
  const now = new Date("2026-07-27T20:00:00");
  const ready = {
    ...DEFAULT_PITCH_TRAINING_STATE.sight,
    stage: "F",
    currentPitch: "F",
    learnedPitches: ["F"],
    vocalRangeLowMidi: midiForPitch("G", 3),
    vocalRangeHighMidi: midiForPitch("E", 5),
    pendingRetentionAt: "2026-07-27T19:59:59",
  };
  const started = beginPitchSession("sight", "retention", ready, now, seededRandom());
  assert.ok(started.activeSession);
  assert.ok(started.retentionAttemptedAt);
  assert.equal(retentionIsAvailable({ ...started, activeSession: null }, now), false);
});

test("retaining the twelfth ear-training pitch unlocks 88-key expansion", () => {
  const now = new Date("2026-07-27T20:00:00");
  const ready = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    stage: "F",
    currentPitch: "B",
    learnedPitches: [...PITCH_NAMES],
    retainedPitches: PITCH_NAMES.filter((pitch) => pitch !== "B"),
    pendingRetentionAt: "2026-07-27T19:59:59",
  };
  const session = createPitchSession("ear", "retention", ready, now, seededRandom());
  const completed = completePitchSession(ready, answerSession(session, true), now);
  assert.equal(completed.retainedPitches.length, 12);
  assert.equal(completed.earFullKeyboardUnlocked, true);
  assert.equal(completed.stage, "C");
});

test("overnight waiting allows practice without changing retention eligibility", () => {
  const now = new Date("2026-07-27T08:00:00");
  const readyAt = "2026-07-27T20:00:00.000Z";
  const waiting = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    stage: "F",
    currentPitch: "E",
    learnedPitches: ["C", "C♯", "D", "E♭", "E"],
    pendingRetentionAt: readyAt,
  };
  const started = beginPitchSession("ear", "training", waiting, now, seededRandom());
  assert.ok(started.activeSession);
  const selectedFocus = createPitchSession("ear", "training", {
    ...waiting,
    currentPitch: "B",
    learnedPitches: [...waiting.learnedPitches, "B"],
  }, now, seededRandom());
  const focusCounts = Object.groupBy(selectedFocus.questions, (question) => question.target);
  assert.ok(focusCounts.B.length > Math.max(
    ...Object.entries(focusCounts)
      .filter(([pitch]) => pitch !== "B")
      .map(([, questions]) => questions.length),
  ));
  const completed = completePitchSession(started, answerSession(started.activeSession, true), now);
  assert.equal(completed.stage, "F");
  assert.equal(completed.pendingRetentionAt, readyAt);
  assert.equal(completed.retentionAttemptedAt, null);
});

test("a failed retention test requires two passed consolidation blocks", () => {
  const now = new Date("2026-07-27T20:00:00");
  const ready = {
    ...DEFAULT_PITCH_TRAINING_STATE.ear,
    stage: "F",
    currentPitch: "F",
    learnedPitches: ["F"],
    pendingRetentionAt: "2026-07-27T19:59:59",
  };
  const started = beginPitchSession("ear", "retention", ready, now, seededRandom());
  const failed = completePitchSession(started, answerSession(started.activeSession, false), now);
  assert.equal(failed.stage, "C");
  assert.equal(failed.retentionRecoveryRequired, true);

  const firstSession = createPitchSession("ear", "training", failed, now, seededRandom());
  const afterFirst = completePitchSession(failed, answerSession(firstSession, true), now);
  assert.equal(afterFirst.stage, "C");
  assert.equal(afterFirst.retentionRecoveryBlocks, 1);

  const secondSession = createPitchSession("ear", "training", afterFirst, now, seededRandom());
  const afterSecond = completePitchSession(afterFirst, answerSession(secondSession, true), now);
  assert.equal(afterSecond.stage, "F");
  assert.equal(afterSecond.retentionRecoveryBlocks, 2);
  assert.equal(retentionIsAvailable(afterSecond, now), true);
});

test("completing a baseline starts stage A and CSV preserves question records", () => {
  const session = createPitchSession("ear", "baseline", DEFAULT_PITCH_TRAINING_STATE.ear, new Date(), seededRandom());
  session.responses = session.questions.map((question, index) => ({
    id: `r-${index}`,
    sessionId: session.id,
    module: "ear",
    kind: "baseline",
    stage: "baseline",
    target: question.target,
    octave: question.octave,
    timbre: question.timbre,
    representation: "note-name",
    selectedPitch: question.target,
    selectedMidi: question.midi,
    valid: true,
    correct: true,
    timeout: false,
    assisted: false,
    replayed: false,
    deviceError: false,
    responseMs: 900,
    createdAt: new Date().toISOString(),
  }));
  const course = completePitchSession(DEFAULT_PITCH_TRAINING_STATE.ear, session);
  assert.equal(course.stage, "A");
  assert.equal(course.currentPitch, "C");
  assert.deepEqual(course.learnedPitches, ["C"]);
  assert.equal(course.records.length, 108);
  const csv = pitchTrainingCsv("ear", course);
  assert.match(csv, /^module,session_id,kind,stage,target,/);
  assert.equal(csv.split("\n").length, 109);
});
