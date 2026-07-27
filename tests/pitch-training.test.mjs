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
  createPitchSession,
  midiForPitch,
  normalizePitchTrainingState,
  pitchNameForMidi,
  pitchTrainingCsv,
  retentionIsAvailable,
  samePitchName,
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
  assert.deepEqual(PITCH_LEARNING_ORDER, ["F", "E", "F♯", "E♭", "G", "D", "A♭", "C♯", "A", "C", "B♭", "B"]);
});

test("scores the same pitch name as equal across octaves", () => {
  assert.equal(samePitchName(midiForPitch("C", 3), midiForPitch("C", 5)), true);
  assert.equal(samePitchName(midiForPitch("C", 3), midiForPitch("C♯", 3)), false);
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

test("sight baseline contains 36 balanced questions and freezes representation", () => {
  const state = normalizePitchTrainingState({
    sight: { ...DEFAULT_PITCH_TRAINING_STATE.sight, representation: "staff" },
  });
  const session = createPitchSession("sight", "baseline", state.sight, new Date(), seededRandom());
  assert.equal(session.questions.length, 36);
  assert.equal(session.representation, "staff");
  for (const pitch of PITCH_NAMES) {
    assert.equal(session.questions.filter((question) => question.target === pitch).length, 3);
  }
});

test("the two course states normalize independently", () => {
  const state = normalizePitchTrainingState({
    ear: { ...DEFAULT_PITCH_TRAINING_STATE.ear, retainedPitches: ["F"] },
  });
  assert.deepEqual(state.ear.retainedPitches, ["F"]);
  assert.deepEqual(state.sight.retainedPitches, []);
  assert.notEqual(state.ear, state.sight);
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
    pendingRetentionAt: "2026-07-27T19:59:59",
  };
  const started = beginPitchSession("sight", "retention", ready, now, seededRandom());
  assert.ok(started.activeSession);
  assert.ok(started.retentionAttemptedAt);
  assert.equal(retentionIsAvailable({ ...started, activeSession: null }, now), false);
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
  assert.equal(course.records.length, 108);
  const csv = pitchTrainingCsv("ear", course);
  assert.match(csv, /^module,session_id,kind,stage,target,/);
  assert.equal(csv.split("\n").length, 109);
});
