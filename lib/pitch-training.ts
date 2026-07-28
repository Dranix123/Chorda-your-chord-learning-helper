export const PITCH_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

export const PITCH_LEARNING_ORDER = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
] as const;

export type PitchName = (typeof PITCH_NAMES)[number];
export type PitchModule = "ear" | "sight";
export type PitchStage = "baseline" | "A" | "B" | "C" | "D" | "E" | "F";
export type PitchSessionKind =
  | "baseline"
  | "stage-a"
  | "training"
  | "certification"
  | "retention"
  | "weekly";
export type PitchRepresentation = "note-name" | "staff";
export type TrainingTimbre = "Piano" | "Electric Piano" | "Organ";

export type PitchQuestion = {
  id: string;
  target: PitchName;
  octave: number;
  midi: number;
  timbre: TrainingTimbre;
};

export type PitchResponse = {
  id: string;
  sessionId: string;
  module: PitchModule;
  kind: PitchSessionKind;
  stage: PitchStage;
  target: PitchName;
  octave: number;
  timbre: TrainingTimbre;
  representation: PitchRepresentation;
  selectedPitch?: PitchName;
  selectedMidi?: number;
  detectedPitch?: PitchName;
  detectedMidi?: number;
  cents?: number;
  valid: boolean;
  correct: boolean;
  octaveCorrect?: boolean;
  timeout: boolean;
  assisted: boolean;
  replayed: boolean;
  deviceError: boolean;
  responseMs: number;
  createdAt: string;
};

export type PitchSession = {
  id: string;
  module: PitchModule;
  kind: PitchSessionKind;
  stage: PitchStage;
  representation: PitchRepresentation;
  questions: PitchQuestion[];
  index: number;
  responses: PitchResponse[];
  startedAt: string;
  questionStartedAt: string;
  replayUsed: boolean;
  retryUsed: boolean;
  deviceRetryUsed: boolean;
};

export type PitchSessionSummary = {
  id: string;
  module: PitchModule;
  kind: PitchSessionKind;
  stage: PitchStage;
  representation: PitchRepresentation;
  startedAt: string;
  completedAt: string;
  total: number;
  scored: number;
  correct: number;
  accuracy: number;
  validRate: number;
  timeoutRate: number;
  medianResponseMs: number;
  passed: boolean | null;
  abnormal: number;
};

export type PitchCourseState = {
  started: boolean;
  introCompleted: boolean;
  volumeCheckCompleted: boolean;
  microphoneCheckCompleted: boolean;
  baselineCompleted: boolean;
  stage: PitchStage;
  currentPitch: PitchName | null;
  learnedPitches: PitchName[];
  retainedPitches: PitchName[];
  representation: PitchRepresentation;
  timed: boolean;
  earFullKeyboardUnlocked: boolean;
  vocalRangeLowMidi: number | null;
  vocalRangeHighMidi: number | null;
  vocalRangeTestedAt: string | null;
  pendingRetentionAt: string | null;
  retentionAttemptedAt: string | null;
  retentionRecoveryRequired: boolean;
  retentionRecoveryBlocks: number;
  lastWeeklyAt: string | null;
  trainingDays: string[];
  certificationAttempts: Record<string, number>;
  consecutiveCertificationFailures: number;
  consolidationBlocks: number;
  records: PitchResponse[];
  sessions: PitchSessionSummary[];
  activeSession: PitchSession | null;
};

export type PitchTrainingState = {
  ear: PitchCourseState;
  sight: PitchCourseState;
};

export type PitchStats = {
  total: number;
  correct: number;
  accuracy: number;
  validRate: number;
  timeoutRate: number;
  medianResponseMs: number;
  octaveAccuracy: number;
  perPitch: Array<{ pitch: PitchName; attempts: number; accuracy: number }>;
  confusion: Array<{ target: PitchName; answer: PitchName; count: number }>;
  noteNameAccuracy: number;
  staffAccuracy: number;
  replayRate: number;
  averageCents: number;
  perOctave: Array<{ octave: number; attempts: number; accuracy: number }>;
  perTimbre: Array<{ timbre: TrainingTimbre; attempts: number; accuracy: number }>;
};

const PITCH_CLASS: Record<PitchName, number> = {
  C: 0,
  "C♯": 1,
  D: 2,
  "E♭": 3,
  E: 4,
  F: 5,
  "F♯": 6,
  G: 7,
  "A♭": 8,
  A: 9,
  "B♭": 10,
  B: 11,
};

const TIMBRES: TrainingTimbre[] = ["Piano", "Electric Piano", "Organ"];
const OCTAVES = [3, 4, 5];
const FORMAL_KINDS: PitchSessionKind[] = ["baseline", "certification", "retention", "weekly"];

function defaultCourse(representation: PitchRepresentation): PitchCourseState {
  return {
    started: false,
    introCompleted: false,
    volumeCheckCompleted: false,
    microphoneCheckCompleted: false,
    baselineCompleted: false,
    stage: "baseline",
    currentPitch: null,
    learnedPitches: [],
    retainedPitches: [],
    representation,
    timed: true,
    earFullKeyboardUnlocked: false,
    vocalRangeLowMidi: null,
    vocalRangeHighMidi: null,
    vocalRangeTestedAt: null,
    pendingRetentionAt: null,
    retentionAttemptedAt: null,
    retentionRecoveryRequired: false,
    retentionRecoveryBlocks: 0,
    lastWeeklyAt: null,
    trainingDays: [],
    certificationAttempts: {},
    consecutiveCertificationFailures: 0,
    consolidationBlocks: 0,
    records: [],
    sessions: [],
    activeSession: null,
  };
}

export const DEFAULT_PITCH_TRAINING_STATE: PitchTrainingState = {
  ear: defaultCourse("note-name"),
  sight: defaultCourse("note-name"),
};

export function normalizePitchTrainingState(value: unknown): PitchTrainingState {
  const candidate = value && typeof value === "object"
    ? value as Partial<PitchTrainingState>
    : {};
  const ear = normalizeCourse(candidate.ear, "note-name");
  return {
    ear: {
      ...ear,
      earFullKeyboardUnlocked: ear.earFullKeyboardUnlocked || ear.retainedPitches.length === PITCH_NAMES.length,
    },
    sight: normalizeCourse(candidate.sight, "note-name"),
  };
}

function normalizeCourse(value: unknown, representation: PitchRepresentation): PitchCourseState {
  const candidate = value && typeof value === "object"
    ? value as Partial<PitchCourseState>
    : {};
  const base = defaultCourse(representation);
  return {
    ...base,
    ...candidate,
    earFullKeyboardUnlocked: candidate.earFullKeyboardUnlocked === true,
    vocalRangeLowMidi: validMidi(candidate.vocalRangeLowMidi),
    vocalRangeHighMidi: validMidi(candidate.vocalRangeHighMidi),
    vocalRangeTestedAt: typeof candidate.vocalRangeTestedAt === "string" ? candidate.vocalRangeTestedAt : null,
    learnedPitches: validPitchArray(candidate.learnedPitches),
    retainedPitches: validPitchArray(candidate.retainedPitches),
    trainingDays: Array.isArray(candidate.trainingDays) ? candidate.trainingDays.filter((day): day is string => typeof day === "string") : [],
    certificationAttempts: candidate.certificationAttempts && typeof candidate.certificationAttempts === "object"
      ? candidate.certificationAttempts
      : {},
    records: Array.isArray(candidate.records) ? candidate.records : [],
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
    activeSession: candidate.activeSession ?? null,
  };
}

function validMidi(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 21 && value <= 108
    ? value
    : null;
}

function validPitchArray(value: unknown): PitchName[] {
  return Array.isArray(value)
    ? value.filter((pitch): pitch is PitchName => PITCH_NAMES.includes(pitch as PitchName))
    : [];
}

export function pitchNameForMidi(note: number): PitchName {
  return PITCH_NAMES[((note % 12) + 12) % 12];
}

export function midiForPitch(pitch: PitchName, octave: number): number {
  return (octave + 1) * 12 + PITCH_CLASS[pitch];
}

export function samePitchName(firstMidi: number, secondMidi: number): boolean {
  return ((firstMidi - secondMidi) % 12 + 12) % 12 === 0;
}

export function isPitchAnswerCorrect(_module: PitchModule, answerMidi: number, targetMidi: number): boolean {
  return answerMidi === targetMidi;
}

export function courseHasVocalRange(course: PitchCourseState): boolean {
  return course.vocalRangeLowMidi !== null
    && course.vocalRangeHighMidi !== null
    && course.vocalRangeLowMidi < course.vocalRangeHighMidi;
}

export function pitchIsInVocalRange(course: PitchCourseState, pitch: PitchName): boolean {
  if (!courseHasVocalRange(course)) return false;
  for (let midi = course.vocalRangeLowMidi as number; midi <= (course.vocalRangeHighMidi as number); midi += 1) {
    if (pitchNameForMidi(midi) === pitch) return true;
  }
  return false;
}

export function firstPitchInVocalRange(course: PitchCourseState): PitchName | null {
  return PITCH_LEARNING_ORDER.find((pitch) => pitchIsInVocalRange(course, pitch)) ?? null;
}

export function completedEarMidiNotes(course: PitchCourseState): number[] {
  return [...new Set(course.records
    .filter((response) =>
      response.module === "ear"
      && response.correct
      && response.valid
      && !response.assisted
      && !response.deviceError,
    )
    .map((response) => midiForPitch(response.target, response.octave))
    .filter((midi) => midi >= 21 && midi <= 108))]
    .sort((first, second) => first - second);
}

export function autocorrelatedFrequency(buffer: Float32Array, sampleRate: number): number | null {
  const size = buffer.length;
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 1_100);
  const maxOffset = Math.min(Math.floor(sampleRate / 80), size - 2);
  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let index = 0; index < size - offset; index += 1) {
      const first = buffer[index];
      const second = buffer[index + offset];
      correlation += first * second;
      energyA += first * first;
      energyB += second * second;
    }
    const normalized = correlation / Math.sqrt(energyA * energyB);
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestOffset = offset;
    }
  }
  return bestCorrelation >= 0.88 && bestOffset > 0 ? sampleRate / bestOffset : null;
}

export function isFormalSession(kind: PitchSessionKind): boolean {
  return FORMAL_KINDS.includes(kind);
}

export function sessionAllowsReplay(session: PitchSession): boolean {
  return session.module === "ear"
    && session.kind === "training"
    && session.stage === "C"
    && !session.replayUsed;
}

export function sessionAllowsRetry(session: PitchSession): boolean {
  return session.module === "sight"
    && session.kind === "training"
    && (session.stage === "B" || session.stage === "C")
    && !session.retryUsed;
}

export function sessionShowsImmediateFeedback(session: PitchSession): boolean {
  return !isFormalSession(session.kind) && session.stage !== "D";
}

export function answerTimeLimitMs(module: PitchModule, stage: PitchStage, learnedCount: number): number {
  if (module === "ear") {
    if (stage === "D") return 3_000;
    if (stage === "E" || stage === "F") {
      return Math.round(2_000 + Math.max(0, Math.min(11, learnedCount - 1)) * 60);
    }
    return 4_000;
  }
  if (stage === "D") return 4_000;
  if (stage === "E" || stage === "F") return 5_000;
  return 5_000;
}

export function canStartCertification(course: PitchCourseState, now = new Date()): boolean {
  const day = localDay(now);
  return course.stage === "E" && (course.certificationAttempts[day] ?? 0) < 2;
}

export function retentionIsAvailable(course: PitchCourseState, now = new Date()): boolean {
  return course.stage === "F"
    && Boolean(course.pendingRetentionAt)
    && !course.retentionAttemptedAt
    && new Date(course.pendingRetentionAt as string).getTime() <= now.getTime();
}

export function weeklyIsDue(course: PitchCourseState, now = new Date()): boolean {
  if (course.trainingDays.length < 7) return false;
  if (!course.lastWeeklyAt) return true;
  return now.getTime() - new Date(course.lastWeeklyAt).getTime() >= 7 * 86_400_000;
}

export function createPitchSession(
  module: PitchModule,
  kind: PitchSessionKind,
  course: PitchCourseState,
  now = new Date(),
  random: () => number = Math.random,
): PitchSession {
  const stage = stageForKind(kind, course.stage);
  const representation = module === "ear" ? "note-name" : course.representation;
  const questions = questionsForSession(module, kind, stage, course, random);
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    module,
    kind,
    stage,
    representation,
    questions,
    index: 0,
    responses: [],
    startedAt: timestamp,
    questionStartedAt: timestamp,
    replayUsed: false,
    retryUsed: false,
    deviceRetryUsed: false,
  };
}

export function beginPitchSession(
  module: PitchModule,
  kind: PitchSessionKind,
  course: PitchCourseState,
  now = new Date(),
  random: () => number = Math.random,
): PitchCourseState {
  if (module === "sight" && !courseHasVocalRange(course)) return course;
  if (kind === "certification" && !canStartCertification(course, now)) return course;
  if (kind === "retention" && !retentionIsAvailable(course, now)) return course;
  const day = localDay(now);
  return {
    ...course,
    started: true,
    certificationAttempts: kind === "certification"
      ? {
          ...course.certificationAttempts,
          [day]: (course.certificationAttempts[day] ?? 0) + 1,
        }
      : course.certificationAttempts,
    retentionAttemptedAt: kind === "retention" ? now.toISOString() : course.retentionAttemptedAt,
    activeSession: createPitchSession(module, kind, course, now, random),
  };
}

export function skipPitchBaseline(course: PitchCourseState, module: PitchModule = "ear"): PitchCourseState {
  if (module === "sight" && !courseHasVocalRange(course)) return course;
  const firstPitch = module === "sight"
    ? firstPitchInVocalRange(course) ?? PITCH_LEARNING_ORDER[0]
    : PITCH_LEARNING_ORDER[0];
  return {
    ...course,
    started: true,
    introCompleted: true,
    baselineCompleted: true,
    stage: "A",
    currentPitch: firstPitch,
    learnedPitches: course.learnedPitches.length ? course.learnedPitches : [firstPitch],
    activeSession: null,
  };
}

function stageForKind(kind: PitchSessionKind, current: PitchStage): PitchStage {
  if (kind === "baseline") return "baseline";
  if (kind === "stage-a") return "A";
  if (kind === "certification") return "E";
  if (kind === "retention") return "F";
  return current;
}

function questionsForSession(
  module: PitchModule,
  kind: PitchSessionKind,
  stage: PitchStage,
  course: PitchCourseState,
  random: () => number,
): PitchQuestion[] {
  if (
    module === "ear"
    && course.earFullKeyboardUnlocked
    && kind !== "baseline"
    && kind !== "stage-a"
  ) {
    return fullKeyboardQuestions(course, kind === "weekly" ? 88 : 72, random);
  }
  if (kind === "baseline") {
    return module === "ear"
      ? exactGrid(PITCH_NAMES, OCTAVES, TIMBRES, random)
      : sightQuestions(PITCH_NAMES, 36, course, random);
  }
  if (kind === "weekly") {
    return module === "ear"
      ? exactGrid(PITCH_NAMES, OCTAVES, TIMBRES, random)
      : sightQuestions(PITCH_NAMES, 36, course, random);
  }

  const current = module === "sight"
    ? course.currentPitch && pitchIsInVocalRange(course, course.currentPitch)
      ? course.currentPitch
      : firstPitchInVocalRange(course) ?? PITCH_LEARNING_ORDER[0]
    : course.currentPitch ?? PITCH_LEARNING_ORDER[0];
  const learned = uniquePitches([...course.learnedPitches, current])
    .filter((pitch) => module === "ear" || pitchIsInVocalRange(course, pitch));
  if (kind === "stage-a") {
    return module === "sight"
      ? weightedSightQuestions(current, learned, 6, course, random, 0.5)
      : weightedEarQuestions(current, learned, 6, ["Piano"], random, 0.5);
  }
  if (stage === "B") {
    if (module === "sight") {
      const count = Math.max(24, Math.min(60, learned.length * 5));
      return weightedSightQuestions(current, learned, count, course, random);
    }
    const count = Math.max(36, Math.min(72, learned.length * 6));
    return weightedEarQuestions(current, learned, count, ["Piano"], random);
  }
  if (module === "ear" && stage === "C") {
    const maximum = 72;
    const count = Math.max(36, Math.min(maximum, learned.length * 7));
    return weightedEarQuestions(current, learned, count, ["Piano"], random);
  }
  if (kind === "certification" || kind === "retention") {
    const perPitch = module === "ear" ? 6 : 4;
    const minimum = module === "ear" ? 36 : 24;
    const maximum = module === "ear" ? 72 : 60;
    const count = Math.max(minimum, Math.min(maximum, learned.length * perPitch));
    return module === "sight"
      ? weightedSightQuestions(current, learned, count, course, random)
      : weightedEarQuestions(current, learned, count, ["Piano", "Electric Piano"], random);
  }
  const maximum = 72;
  const count = Math.max(36, Math.min(maximum, learned.length * 6));
  if (module === "sight" && stage === "C") {
    return weightedSightQuestions(current, learned, count, course, random);
  }
  if (module === "sight") return weightedSightQuestions(current, learned, count, course, random);
  return weightedEarQuestions(
    current,
    learned,
    count,
    stage === "D" ? ["Piano", "Electric Piano"] : ["Piano"],
    random,
  );
}

function weightedEarQuestions(
  current: PitchName,
  learned: PitchName[],
  count: number,
  timbres: TrainingTimbre[],
  random: () => number,
  currentRatio = 0.4,
): PitchQuestion[] {
  const anchors = OCTAVES.map((octave) => midiForPitch(current, octave));
  return weightedAbsoluteQuestions(
    current,
    learned,
    count,
    timbres,
    random,
    anchors,
    21,
    108,
    currentRatio,
  );
}

function weightedSightQuestions(
  current: PitchName,
  learned: PitchName[],
  count: number,
  course: PitchCourseState,
  random: () => number,
  currentRatio = 0.4,
): PitchQuestion[] {
  const low = course.vocalRangeLowMidi ?? midiForPitch("C", 3);
  const high = course.vocalRangeHighMidi ?? midiForPitch("B", 5);
  const middleRangeAnchors = OCTAVES
    .map((octave) => midiForPitch(current, octave))
    .filter((midi) => midi >= low && midi <= high);
  const anchors = middleRangeAnchors.length
    ? middleRangeAnchors
    : midiNotesForPitch(current, low, high);
  return weightedAbsoluteQuestions(
    current,
    learned,
    count,
    ["Piano"],
    random,
    anchors,
    low,
    high,
    currentRatio,
  );
}

function weightedAbsoluteQuestions(
  current: PitchName,
  learned: PitchName[],
  count: number,
  timbres: TrainingTimbre[],
  random: () => number,
  anchors: number[],
  low: number,
  high: number,
  currentRatio: number,
): PitchQuestion[] {
  const mixed = reviewPitchPool(
    current,
    learned,
    random,
    (pitch) => midiNotesForPitch(pitch, low, high).length > 0,
  ).map((pitch) => ({
    pitch,
    notes: absoluteReviewMidis(current, pitch, anchors, low, high),
  })).filter((entry) => entry.notes.length);
  const currentCount = weightedCurrentCount(count, mixed.length, currentRatio);
  const shuffledAnchors = shuffled(anchors, random);
  const currentQuestions = Array.from({ length: currentCount }, (_, index) =>
    questionForMidi(
      shuffledAnchors[index % shuffledAnchors.length],
      timbres[index % timbres.length],
    ));
  const reviewOrder = shuffled(mixed, random);
  const reviewQuestions = Array.from({ length: count - currentCount }, (_, index) => {
    const entry = reviewOrder[index % reviewOrder.length];
    const cycle = Math.floor(index / reviewOrder.length);
    return questionForMidi(
      entry.notes[cycle % entry.notes.length],
      timbres[index % timbres.length],
    );
  });
  return arrangeQuestions([...currentQuestions, ...reviewQuestions], random);
}

function absoluteReviewMidis(
  current: PitchName,
  review: PitchName,
  anchors: number[],
  low: number,
  high: number,
): number[] {
  const pitchClassDistance = Math.abs(PITCH_CLASS[current] - PITCH_CLASS[review]);
  const wrappedDistance = Math.min(pitchClassDistance, 12 - pitchClassDistance);
  if (wrappedDistance === 1 || wrappedDistance === 2) {
    return [...new Set(anchors.flatMap((anchor) =>
      [-2, -1, 1, 2]
        .map((offset) => anchor + offset)
        .filter((midi) =>
          midi >= low
          && midi <= high
          && pitchNameForMidi(midi) === review,
        ),
    ))];
  }
  return [...new Set(anchors.map((anchor) =>
    nearestMidiForPitch(review, anchor, low, high),
  ).filter((midi): midi is number => midi !== null))];
}

function nearestMidiForPitch(
  pitch: PitchName,
  anchor: number,
  low: number,
  high: number,
): number | null {
  return midiNotesForPitch(pitch, low, high)
    .sort((first, second) =>
      Math.abs(first - anchor) - Math.abs(second - anchor)
      || first - second,
    )[0] ?? null;
}

function midiNotesForPitch(pitch: PitchName, low: number, high: number): number[] {
  return Array.from({ length: Math.max(0, high - low + 1) }, (_, index) => low + index)
    .filter((midi) => pitchNameForMidi(midi) === pitch);
}

function reviewPitchPool(
  current: PitchName,
  learned: PitchName[],
  random: () => number,
  allowed: (pitch: PitchName) => boolean = () => true,
): PitchName[] {
  const currentClass = PITCH_CLASS[current];
  const neighbors = PITCH_NAMES.filter((pitch) => {
    const distance = Math.abs(PITCH_CLASS[pitch] - currentClass);
    const wrappedDistance = Math.min(distance, 12 - distance);
    return pitch !== current
      && allowed(pitch)
      && (wrappedDistance === 1 || wrappedDistance === 2);
  });
  const learnedReview = learned.filter((pitch) => pitch !== current && allowed(pitch));
  const newNeighbors = shuffled(
    neighbors.filter((pitch) => !learnedReview.includes(pitch)),
    random,
  ).slice(0, 2);
  return uniquePitches([
    ...learnedReview,
    ...newNeighbors,
  ]);
}

function weightedCurrentCount(
  count: number,
  reviewPitchCount: number,
  currentRatio: number,
): number {
  const minimumPerReviewPitch = count >= 36 ? 5 : 1;
  const canReserveReviewMinimum = count >= reviewPitchCount * minimumPerReviewPitch + 6;
  const maximumCurrentCount = canReserveReviewMinimum
    ? count - reviewPitchCount * minimumPerReviewPitch
    : count - 1;
  return Math.max(
    1,
    Math.min(count - 1, maximumCurrentCount, Math.round(count * currentRatio)),
  );
}

function fullKeyboardQuestions(
  course: PitchCourseState,
  count: number,
  random: () => number,
): PitchQuestion[] {
  const allNotes = Array.from({ length: 88 }, (_, index) => index + 21);
  const completed = new Set(completedEarMidiNotes(course));
  const incomplete = shuffled(allNotes.filter((midi) => !completed.has(midi)), random);
  const repeats = shuffled(allNotes, random);
  const selected = [...incomplete.slice(0, count)];
  let repeatIndex = 0;
  while (selected.length < count) {
    selected.push(repeats[repeatIndex % repeats.length]);
    repeatIndex += 1;
  }
  return arrangeQuestions(selected.map((midi) => questionForMidi(midi, "Piano")), random);
}

function sightQuestions(
  names: readonly PitchName[],
  count: number,
  course: PitchCourseState,
  random: () => number,
): PitchQuestion[] {
  const low = course.vocalRangeLowMidi ?? midiForPitch("C", 3);
  const high = course.vocalRangeHighMidi ?? midiForPitch("B", 5);
  const candidates = names.map((target) => ({
    target,
    notes: midiNotesForPitch(target, low, high),
  })).filter((entry) => entry.notes.length);
  if (!candidates.length || count <= 0) return [];
  const order = shuffled(candidates, random);
  const pool = Array.from({ length: count }, (_, index) => {
    const entry = order[index % order.length];
    const cycle = Math.floor(index / order.length);
    const midi = entry.notes[cycle % entry.notes.length];
    return questionForMidi(midi, "Piano");
  });
  return arrangeQuestions(pool, random);
}

function exactGrid(
  names: readonly PitchName[],
  octaves: number[],
  timbres: TrainingTimbre[],
  random: () => number,
): PitchQuestion[] {
  const pool = names.flatMap((target) =>
    octaves.flatMap((octave) => timbres.map((timbre) => question(target, octave, timbre))),
  );
  return arrangeQuestions(pool, random);
}

function balancedQuestions(
  names: readonly PitchName[],
  count: number,
  timbres: TrainingTimbre[],
  random: () => number,
): PitchQuestion[] {
  const randomizedNames = shuffled([...names], random);
  const pool = Array.from({ length: count }, (_, index) => {
    const target = randomizedNames[index % randomizedNames.length];
    const octave = OCTAVES[Math.floor(index / randomizedNames.length) % OCTAVES.length];
    const timbre = timbres[Math.floor(index / Math.max(1, randomizedNames.length * OCTAVES.length)) % timbres.length];
    return question(target, octave, timbre);
  });
  return arrangeQuestions(pool, random);
}

function question(target: PitchName, octave: number, timbre: TrainingTimbre): PitchQuestion {
  return {
    id: crypto.randomUUID(),
    target,
    octave,
    midi: midiForPitch(target, octave),
    timbre,
  };
}

function questionForMidi(midi: number, timbre: TrainingTimbre): PitchQuestion {
  return {
    id: crypto.randomUUID(),
    target: pitchNameForMidi(midi),
    octave: Math.floor(midi / 12) - 1,
    midi,
    timbre,
  };
}

function arrangeQuestions(questions: PitchQuestion[], random: () => number): PitchQuestion[] {
  const remaining = shuffled(questions, random);
  const result: PitchQuestion[] = [];
  while (remaining.length) {
    const previous = result.at(-1);
    const preferred = remaining.findIndex((candidate) =>
      candidate.target !== previous?.target
      && (!previous || Math.abs(candidate.octave - previous.octave) >= 1),
    );
    const fallback = remaining.findIndex((candidate) => candidate.target !== previous?.target);
    const index = preferred >= 0 ? preferred : fallback >= 0 ? fallback : 0;
    result.push(remaining.splice(index, 1)[0]);
  }
  return result;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function uniquePitches(pitches: PitchName[]): PitchName[] {
  return [...new Set(pitches)];
}

export function completePitchSession(
  course: PitchCourseState,
  session: PitchSession,
  now = new Date(),
): PitchCourseState {
  const summary = summarizePitchSession(session, now);
  const day = localDay(now);
  let next: PitchCourseState = {
    ...course,
    activeSession: null,
    records: [...course.records, ...session.responses],
    sessions: [...course.sessions, summary],
    trainingDays: session.kind === "training"
      ? uniqueStrings([...course.trainingDays, day])
      : course.trainingDays,
    lastWeeklyAt: session.kind === "weekly" ? now.toISOString() : course.lastWeeklyAt,
  };

  if (session.kind === "baseline") {
    const selected = session.module === "ear"
      ? PITCH_LEARNING_ORDER[0]
      : selectFirstTrainingPitch(session.responses);
    const firstPitch = session.module === "sight" && !pitchIsInVocalRange(next, selected)
      ? firstPitchInVocalRange(next) ?? selected
      : selected;
    return {
      ...next,
      started: true,
      baselineCompleted: true,
      stage: "A",
      currentPitch: firstPitch,
      learnedPitches: [firstPitch],
    };
  }
  if (session.kind === "stage-a") return { ...next, stage: "B" };
  if (session.kind === "weekly") return next;
  if (session.kind === "training") {
    if (next.retentionRecoveryRequired && summary.passed) {
      const blocks = next.retentionRecoveryBlocks + 1;
      return {
        ...next,
        stage: blocks >= 2 ? "F" : "C",
        retentionRecoveryBlocks: blocks,
        pendingRetentionAt: blocks >= 2 ? now.toISOString() : next.pendingRetentionAt,
        retentionAttemptedAt: blocks >= 2 ? null : next.retentionAttemptedAt,
      };
    }
    if (session.module === "ear" && next.earFullKeyboardUnlocked) {
      const keyboardComplete = completedEarMidiNotes(next).length === 88;
      return {
        ...next,
        stage: keyboardComplete ? "E" : "C",
        consolidationBlocks: summary.passed ? next.consolidationBlocks + 1 : next.consolidationBlocks,
      };
    }
    if (summary.passed) {
      const following: Record<Exclude<PitchStage, "baseline" | "F">, PitchStage> = {
        A: "B",
        B: "C",
        C: "D",
        D: "E",
        E: "F",
      };
      next = { ...next, stage: following[session.stage as keyof typeof following] ?? next.stage };
    }
    return {
      ...next,
      consolidationBlocks: summary.passed ? next.consolidationBlocks + 1 : next.consolidationBlocks,
    };
  }
  if (session.kind === "certification") {
    if (summary.passed) {
      return {
        ...next,
        consecutiveCertificationFailures: 0,
        stage: "F",
        pendingRetentionAt: new Date(now.getTime() + 12 * 3_600_000).toISOString(),
        retentionAttemptedAt: null,
        retentionRecoveryRequired: false,
        retentionRecoveryBlocks: 0,
      };
    }
    const failures = next.consecutiveCertificationFailures + 1;
    return {
      ...next,
      consecutiveCertificationFailures: failures,
      stage: failures >= 3 ? "C" : failures >= 2 ? "D" : "C",
      consolidationBlocks: 0,
    };
  }
  if (session.kind === "retention") {
    if (!summary.passed) {
      return {
        ...next,
        stage: "C",
        pendingRetentionAt: null,
        retentionAttemptedAt: next.retentionAttemptedAt,
        retentionRecoveryRequired: true,
        retentionRecoveryBlocks: 0,
        consolidationBlocks: 0,
      };
    }
    const retained = uniquePitches([
      ...next.retainedPitches,
      ...(next.currentPitch ? [next.currentPitch] : []),
    ]);
    const nextPitch = nextLearningPitch(retained, session.module, next);
    const unlockFullKeyboard = session.module === "ear"
      && !nextPitch
      && !next.earFullKeyboardUnlocked;
    return {
      ...next,
      earFullKeyboardUnlocked: next.earFullKeyboardUnlocked || unlockFullKeyboard,
      retainedPitches: retained,
      learnedPitches: nextPitch ? uniquePitches([...next.learnedPitches, nextPitch]) : next.learnedPitches,
      currentPitch: nextPitch ?? next.currentPitch,
      stage: nextPitch ? "A" : unlockFullKeyboard ? "C" : "E",
      pendingRetentionAt: null,
      retentionAttemptedAt: null,
      retentionRecoveryRequired: false,
      retentionRecoveryBlocks: 0,
      consolidationBlocks: 0,
    };
  }
  return next;
}

function nextLearningPitch(
  retained: PitchName[],
  module: PitchModule,
  course: PitchCourseState,
): PitchName | null {
  return PITCH_LEARNING_ORDER
    .filter((pitch) =>
      !retained.includes(pitch)
      && (module === "ear" || pitchIsInVocalRange(course, pitch)),
    )
    .sort((first, second) => {
      const distanceToRetained = (pitch: PitchName) => retained.length
        ? Math.min(...retained.map((known) => {
            const distance = Math.abs(PITCH_CLASS[pitch] - PITCH_CLASS[known]);
            return Math.min(distance, 12 - distance);
          }))
        : 0;
      return distanceToRetained(first) - distanceToRetained(second)
        || PITCH_LEARNING_ORDER.indexOf(first) - PITCH_LEARNING_ORDER.indexOf(second);
    })[0] ?? null;
}

export function summarizePitchSession(session: PitchSession, now = new Date()): PitchSessionSummary {
  const scored = session.responses.filter((response) => !response.assisted && !response.deviceError);
  const valid = scored.filter((response) => response.valid);
  const correct = scored.filter((response) => response.correct);
  const perPitch = PITCH_NAMES.map((pitch) => {
    const responses = scored.filter((response) => response.target === pitch);
    return responses.length ? responses.filter((response) => response.correct).length / responses.length : null;
  }).filter((value): value is number => value !== null);
  const accuracy = ratio(correct.length, scored.length);
  const validRate = ratio(valid.length, scored.length);
  const timeoutRate = ratio(scored.filter((response) => response.timeout).length, scored.length);
  const medianResponseMs = median(correct.map((response) => response.responseMs));
  const averagePitchAccuracy = perPitch.length
    ? perPitch.reduce((sum, value) => sum + value, 0) / perPitch.length
    : 0;
  const minimumPitchAccuracy = perPitch.length ? Math.min(...perPitch) : 0;
  const minimumValidPerPitch = Math.min(
    ...uniquePitches(session.questions.map((question) => question.target)).map((pitch) =>
      scored.filter((response) => response.target === pitch && response.valid).length,
    ),
  );
  const passed = passForSession(
    session,
    accuracy,
    validRate,
    timeoutRate,
    medianResponseMs,
    averagePitchAccuracy,
    minimumPitchAccuracy,
    minimumValidPerPitch,
  );
  return {
    id: session.id,
    module: session.module,
    kind: session.kind,
    stage: session.stage,
    representation: session.representation,
    startedAt: session.startedAt,
    completedAt: now.toISOString(),
    total: session.responses.length,
    scored: scored.length,
    correct: correct.length,
    accuracy,
    validRate,
    timeoutRate,
    medianResponseMs,
    passed,
    abnormal: session.responses.filter((response) => response.deviceError).length,
  };
}

function passForSession(
  session: PitchSession,
  accuracy: number,
  validRate: number,
  timeoutRate: number,
  medianResponseMs: number,
  averagePitchAccuracy: number,
  minimumPitchAccuracy: number,
  minimumValidPerPitch: number,
): boolean | null {
  if (session.kind === "baseline" || session.kind === "weekly" || session.kind === "stage-a") return null;
  if (session.stage === "B") {
    return accuracy >= 0.8
      && minimumPitchAccuracy >= 0.8
      && (session.module === "ear" || validRate >= 0.9);
  }
  if (session.stage === "C") {
    return accuracy >= 0.85
      && minimumPitchAccuracy >= 0.7
      && minimumValidPerPitch >= 5
      && (session.module === "ear" || validRate >= 0.9);
  }
  if (session.stage === "D") {
    return accuracy >= 0.88
      && averagePitchAccuracy >= 0.85
      && minimumPitchAccuracy >= 0.75
      && (session.module === "ear" ? medianResponseMs <= 3_000 : validRate >= 0.92 && timeoutRate <= 0.08);
  }
  if (session.stage === "E" || session.stage === "F") {
    const learnedCount = Math.max(1, new Set(session.questions.map((question) => question.target)).size);
    return accuracy >= 0.9
      && averagePitchAccuracy >= 0.88
      && minimumPitchAccuracy >= 0.8
      && timeoutRate <= 0.05
      && (session.module === "ear"
        ? medianResponseMs <= answerTimeLimitMs("ear", session.stage, learnedCount)
        : validRate >= 0.95);
  }
  return false;
}

function selectFirstTrainingPitch(responses: PitchResponse[]): PitchName {
  const candidates = PITCH_NAMES.map((pitch) => {
    const pitchResponses = responses.filter((response) => response.target === pitch);
    const correct = pitchResponses.filter((response) => response.correct);
    const octaves = new Set(correct.map((response) => response.octave));
    const timbres = new Set(correct.map((response) => response.timbre));
    return {
      pitch,
      correct: correct.length,
      octaves: octaves.size,
      timbres: timbres.size,
      median: median(correct.map((response) => response.responseMs)),
    };
  }).filter((result) =>
    result.correct >= 3
    && result.octaves >= 2
    && result.timbres >= Math.min(2, new Set(responses.map((response) => response.timbre)).size),
  );
  return candidates.sort((first, second) =>
    second.correct - first.correct
    || first.median - second.median
    || PITCH_LEARNING_ORDER.indexOf(first.pitch) - PITCH_LEARNING_ORDER.indexOf(second.pitch),
  )[0]?.pitch ?? PITCH_LEARNING_ORDER[0];
}

export function pitchStats(records: PitchResponse[]): PitchStats {
  const scored = records.filter((response) => !response.assisted && !response.deviceError);
  const correct = scored.filter((response) => response.correct);
  const valid = scored.filter((response) => response.valid);
  const octaveResponses = valid.filter((response) => typeof response.octaveCorrect === "boolean");
  const perPitch = PITCH_NAMES.map((pitch) => {
    const attempts = scored.filter((response) => response.target === pitch);
    return {
      pitch,
      attempts: attempts.length,
      accuracy: ratio(attempts.filter((response) => response.correct).length, attempts.length),
    };
  });
  const confusionMap = new Map<string, number>();
  scored.filter((response) => !response.correct).forEach((response) => {
    const answer = response.selectedPitch ?? response.detectedPitch;
    if (!answer) return;
    const key = `${response.target}|${answer}`;
    confusionMap.set(key, (confusionMap.get(key) ?? 0) + 1);
  });
  const confusion = [...confusionMap.entries()]
    .map(([key, count]) => {
      const [target, answer] = key.split("|") as [PitchName, PitchName];
      return { target, answer, count };
    })
    .sort((first, second) => second.count - first.count);
  const byRepresentation = (representation: PitchRepresentation) => {
    const items = scored.filter((response) => response.representation === representation);
    return ratio(items.filter((response) => response.correct).length, items.length);
  };
  const cents = valid
    .map((response) => response.cents)
    .filter((value): value is number => typeof value === "number");
  const perOctave = [3, 4, 5].map((octave) => {
    const items = scored.filter((response) => response.octave === octave);
    return {
      octave,
      attempts: items.length,
      accuracy: ratio(items.filter((response) => response.correct).length, items.length),
    };
  });
  const perTimbre = TIMBRES.map((timbre) => {
    const items = scored.filter((response) => response.timbre === timbre);
    return {
      timbre,
      attempts: items.length,
      accuracy: ratio(items.filter((response) => response.correct).length, items.length),
    };
  });
  return {
    total: scored.length,
    correct: correct.length,
    accuracy: ratio(correct.length, scored.length),
    validRate: ratio(valid.length, scored.length),
    timeoutRate: ratio(scored.filter((response) => response.timeout).length, scored.length),
    medianResponseMs: median(correct.map((response) => response.responseMs)),
    octaveAccuracy: ratio(octaveResponses.filter((response) => response.octaveCorrect).length, octaveResponses.length),
    perPitch,
    confusion,
    noteNameAccuracy: byRepresentation("note-name"),
    staffAccuracy: byRepresentation("staff"),
    replayRate: ratio(scored.filter((response) => response.replayed).length, scored.length),
    averageCents: cents.length ? cents.reduce((sum, value) => sum + value, 0) / cents.length : 0,
    perOctave,
    perTimbre,
  };
}

export function pitchTrainingCsv(module: PitchModule, course: PitchCourseState): string {
  const header = [
    "module",
    "session_id",
    "kind",
    "stage",
    "target",
    "octave",
    "timbre",
    "representation",
    "answer",
    "valid",
    "correct",
    "octave_correct",
    "timeout",
    "assisted",
    "replayed",
    "device_error",
    "response_ms",
    "cents",
    "created_at",
  ];
  const rows = course.records.map((record) => [
    module,
    record.sessionId,
    record.kind,
    record.stage,
    record.target,
    String(record.octave),
    record.timbre,
    record.representation,
    record.selectedPitch ?? record.detectedPitch ?? "",
    String(record.valid),
    String(record.correct),
    record.octaveCorrect === undefined ? "" : String(record.octaveCorrect),
    String(record.timeout),
    String(record.assisted),
    String(record.replayed),
    String(record.deviceError),
    String(record.responseMs),
    record.cents === undefined ? "" : String(record.cents),
    record.createdAt,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value;
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
