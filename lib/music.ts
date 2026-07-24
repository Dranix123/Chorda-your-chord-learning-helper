export type AccidentalPreference = "contextual" | "sharps" | "flats";

export type ChordFormula = {
  suffix: string;
  family: string;
  intervals: number[];
  defining: number[];
  optional: number[];
  complexity: number;
};

export type Chord = {
  id: string;
  symbol: string;
  root: string;
  rootPc: number;
  family: string;
  intervals: number[];
  pitchClasses: number[];
  notes: string[];
  degree: string;
  source: string;
  complexity: number;
  voicing: number[];
};

export const ROOT_OPTIONS = [
  "C",
  "C♯/D♭",
  "D",
  "D♯/E♭",
  "E",
  "F",
  "F♯/G♭",
  "G",
  "G♯/A♭",
  "A",
  "A♯/B♭",
  "B",
] as const;

export const MODE_INTERVALS: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  "Natural Minor": [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Major Pentatonic": [0, 2, 4, 7, 9],
  "Minor Pentatonic": [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
};

const SHARPS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const FLATS = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

const BASE_FORMULAS: ChordFormula[] = [
  { suffix: "", family: "Triads", intervals: [0, 4, 7], defining: [4], optional: [7], complexity: 1 },
  { suffix: "m", family: "Triads", intervals: [0, 3, 7], defining: [3], optional: [7], complexity: 1 },
  { suffix: "dim", family: "Triads", intervals: [0, 3, 6], defining: [3, 6], optional: [], complexity: 1 },
  { suffix: "aug", family: "Triads", intervals: [0, 4, 8], defining: [4, 8], optional: [], complexity: 1 },
  { suffix: "sus2", family: "Triads", intervals: [0, 2, 7], defining: [2], optional: [7], complexity: 1 },
  { suffix: "sus4", family: "Triads", intervals: [0, 5, 7], defining: [5], optional: [7], complexity: 1 },
  { suffix: "5", family: "Triads", intervals: [0, 7], defining: [7], optional: [], complexity: 1 },
  { suffix: "6", family: "Sixth", intervals: [0, 4, 7, 9], defining: [4, 9], optional: [7], complexity: 2 },
  { suffix: "m6", family: "Sixth", intervals: [0, 3, 7, 9], defining: [3, 9], optional: [7], complexity: 2 },
  { suffix: "6/9", family: "Sixth", intervals: [0, 4, 7, 9, 14], defining: [4, 9, 14], optional: [7], complexity: 3 },
  { suffix: "m6/9", family: "Sixth", intervals: [0, 3, 7, 9, 14], defining: [3, 9, 14], optional: [7], complexity: 3 },
  { suffix: "7", family: "Seventh", intervals: [0, 4, 7, 10], defining: [4, 10], optional: [7], complexity: 2 },
  { suffix: "maj7", family: "Seventh", intervals: [0, 4, 7, 11], defining: [4, 11], optional: [7], complexity: 2 },
  { suffix: "m7", family: "Seventh", intervals: [0, 3, 7, 10], defining: [3, 10], optional: [7], complexity: 2 },
  { suffix: "mMaj7", family: "Seventh", intervals: [0, 3, 7, 11], defining: [3, 11], optional: [7], complexity: 2 },
  { suffix: "dim7", family: "Seventh", intervals: [0, 3, 6, 9], defining: [3, 6, 9], optional: [], complexity: 2 },
  { suffix: "m7b5", family: "Seventh", intervals: [0, 3, 6, 10], defining: [3, 6, 10], optional: [], complexity: 2 },
  { suffix: "augMaj7", family: "Seventh", intervals: [0, 4, 8, 11], defining: [4, 8, 11], optional: [], complexity: 2 },
  { suffix: "aug7", family: "Seventh", intervals: [0, 4, 8, 10], defining: [4, 8, 10], optional: [], complexity: 2 },
  { suffix: "7sus2", family: "Seventh", intervals: [0, 2, 7, 10], defining: [2, 10], optional: [7], complexity: 2 },
  { suffix: "7sus4", family: "Seventh", intervals: [0, 5, 7, 10], defining: [5, 10], optional: [7], complexity: 2 },
  { suffix: "9", family: "Extended", intervals: [0, 4, 7, 10, 14], defining: [4, 10, 14], optional: [7], complexity: 3 },
  { suffix: "maj9", family: "Extended", intervals: [0, 4, 7, 11, 14], defining: [4, 11, 14], optional: [7], complexity: 3 },
  { suffix: "m9", family: "Extended", intervals: [0, 3, 7, 10, 14], defining: [3, 10, 14], optional: [7], complexity: 3 },
  { suffix: "mMaj9", family: "Extended", intervals: [0, 3, 7, 11, 14], defining: [3, 11, 14], optional: [7], complexity: 3 },
  { suffix: "11", family: "Extended", intervals: [0, 4, 10, 14, 17], defining: [4, 10, 14, 17], optional: [7], complexity: 4 },
  { suffix: "maj11", family: "Extended", intervals: [0, 4, 11, 14, 17], defining: [4, 11, 14, 17], optional: [7], complexity: 4 },
  { suffix: "m11", family: "Extended", intervals: [0, 3, 10, 14, 17], defining: [3, 10, 14, 17], optional: [7], complexity: 4 },
  { suffix: "13", family: "Extended", intervals: [0, 4, 10, 14, 21], defining: [4, 10, 14, 21], optional: [7], complexity: 5 },
  { suffix: "maj13", family: "Extended", intervals: [0, 4, 11, 14, 21], defining: [4, 11, 14, 21], optional: [7], complexity: 5 },
  { suffix: "m13", family: "Extended", intervals: [0, 3, 10, 14, 21], defining: [3, 10, 14, 21], optional: [7], complexity: 5 },
];

const ADDED_BASES = [
  { suffix: "", intervals: [0, 4, 7] },
  { suffix: "m", intervals: [0, 3, 7] },
  { suffix: "sus2", intervals: [0, 2, 7] },
  { suffix: "sus4", intervals: [0, 5, 7] },
];
const ADDS = [
  { label: "add2", interval: 2 },
  { label: "add4", interval: 5 },
  { label: "add6", interval: 9 },
  { label: "add9", interval: 14 },
  { label: "add11", interval: 17 },
  { label: "add13", interval: 21 },
];

export function getFormulaCatalog(): ChordFormula[] {
  const added = ADDED_BASES.flatMap((base) =>
    ADDS.map((add) => ({
      suffix:
        base.suffix === ""
          ? add.label
          : `${base.suffix}(${add.label})`,
      family: "Added Tone",
      intervals: [...new Set([...base.intervals, add.interval])],
      defining: [base.intervals[1], add.interval],
      optional: [7],
      complexity: 3,
    })),
  );
  return [...BASE_FORMULAS, ...added];
}

export function rootPitchClass(root: string): number {
  return ROOT_OPTIONS.indexOf(root as (typeof ROOT_OPTIONS)[number]);
}

function noteName(pc: number, preference: AccidentalPreference, rootPc: number): string {
  const flatsContext = [1, 3, 5, 8, 10].includes(rootPc);
  const names = preference === "flats" || (preference === "contextual" && flatsContext) ? FLATS : SHARPS;
  return names[(pc + 120) % 12];
}

function canonicalRoot(rootPc: number, preference: AccidentalPreference): string {
  return noteName(rootPc, preference, rootPc);
}

export function midiNoteName(note: number, preference: AccidentalPreference = "contextual"): string {
  const pc = ((note % 12) + 12) % 12;
  return `${noteName(pc, preference, pc)}${Math.floor(note / 12) - 1}`;
}

export function defaultVoicing(rootPc: number, intervals: number[]): number[] {
  let rootMidi = 48 + rootPc;
  if (rootMidi > 59) rootMidi -= 12;
  return [...new Set(intervals.map((interval) => rootMidi + interval))].sort((a, b) => a - b);
}

export function randomPracticeVoicing(
  pitchClasses: number[],
  noteCount: number,
  random: () => number = Math.random,
): number[] {
  const tones = [...new Set(pitchClasses.map((pitchClass) => ((pitchClass % 12) + 12) % 12))];
  if (!tones.length || noteCount < tones.length || noteCount > tones.length * 3) {
    throw new Error("The requested note count cannot include every chord tone within three octaves.");
  }

  const windowStart = 24 + Math.floor(random() * 3) * 12;
  const candidates = tones.flatMap((pitchClass) =>
    [0, 1, 2].map((octave) => windowStart + octave * 12 + pitchClass),
  );
  const selected = tones.map((pitchClass) => {
    const choices = candidates.filter((note) => note % 12 === pitchClass);
    return choices[Math.floor(random() * choices.length)];
  });
  const remaining = candidates.filter((note) => !selected.includes(note));

  for (let index = remaining.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [remaining[index], remaining[swapIndex]] = [remaining[swapIndex], remaining[index]];
  }

  return [...selected, ...remaining.slice(0, noteCount - selected.length)].sort((a, b) => a - b);
}

export function buildChords(
  key: string,
  mode: string,
  preference: AccidentalPreference,
  view: "In Scale" | "Neighbor Keys" | "All Chords",
): Chord[] {
  const keyPc = rootPitchClass(key);
  const scale = MODE_INTERVALS[mode] ?? MODE_INTERVALS.Major;
  const scalePcs = scale.map((interval) => (keyPc + interval) % 12);
  const sources =
    view === "Neighbor Keys"
      ? [
          { pc: (keyPc + 7) % 12, label: `From ${canonicalRoot((keyPc + 7) % 12, preference)} ${mode}` },
          { pc: (keyPc + 5) % 12, label: `From ${canonicalRoot((keyPc + 5) % 12, preference)} ${mode}` },
        ]
      : [{ pc: keyPc, label: "In Scale" }];
  const formulas = getFormulaCatalog();
  const chords: Chord[] = [];

  for (let rootPc = 0; rootPc < 12; rootPc += 1) {
    for (const formula of formulas) {
      const pitchClasses = [...new Set(formula.intervals.map((interval) => (rootPc + interval) % 12))];
      let source = "All Chords";
      let degree = "—";
      if (view === "In Scale") {
        if (!pitchClasses.every((pc) => scalePcs.includes(pc))) continue;
        degree = ROMAN[scalePcs.indexOf(rootPc)] ?? "—";
        source = "In Scale";
      } else if (view === "Neighbor Keys") {
        const match = sources.find(({ pc }) => {
          const neighborScale = scale.map((interval) => (pc + interval) % 12);
          return pitchClasses.every((tone) => neighborScale.includes(tone));
        });
        if (!match || scalePcs.includes(rootPc)) continue;
        const neighborScale = scale.map((interval) => (match.pc + interval) % 12);
        degree = ROMAN[neighborScale.indexOf(rootPc)] ?? "—";
        source = match.label;
      }
      const rootName = canonicalRoot(rootPc, preference);
      chords.push({
        id: `${rootPc}:${formula.suffix}`,
        symbol: `${rootName}${formula.suffix}`,
        root: rootName,
        rootPc,
        family: formula.family,
        intervals: formula.intervals,
        pitchClasses,
        notes: pitchClasses.map((pc) => noteName(pc, preference, keyPc)),
        degree,
        source,
        complexity: formula.complexity,
        voicing: defaultVoicing(rootPc, formula.intervals.filter((interval) => interval !== 19)),
      });
    }
  }

  return chords.sort((a, b) => {
    const degreeDifference = (ROMAN.indexOf(a.degree) + 1 || 99) - (ROMAN.indexOf(b.degree) + 1 || 99);
    return degreeDifference || a.complexity - b.complexity || a.voicing.length - b.voicing.length || a.symbol.localeCompare(b.symbol);
  });
}

export function normalizeChordSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("♯", "#")
    .replaceAll("♭", "b")
    .replaceAll("𝄪", "##")
    .replaceAll("𝄫", "bb");
}

export function matchesChordSearch(chord: Chord, query: string): boolean {
  if (!query.trim()) return true;
  const needle = normalizeChordSearch(query);
  return [chord.symbol, chord.root, chord.family, chord.notes.join(" ")].some((field) =>
    normalizeChordSearch(field).includes(needle),
  );
}

export function invertVoicing(chord: Chord, bassPc: number): number[] {
  const tones = [...chord.pitchClasses];
  const start = tones.indexOf(bassPc);
  const ordered = [...tones.slice(start), ...tones.slice(0, start)];
  const base = 48 + bassPc > 59 ? 36 + bassPc : 48 + bassPc;
  const result: number[] = [];
  let cursor = base - 1;
  for (const pc of ordered) {
    let note = cursor + 1;
    while (note % 12 !== pc) note += 1;
    result.push(note);
    cursor = note;
  }
  return result;
}

export const PROGRESSION_TEMPLATES: Record<string, string[][]> = {
  Major: [
    ["I", "V", "vi", "IV"],
    ["ii", "V", "I"],
    ["I", "vi", "IV", "V"],
    ["I", "IV", "V", "I"],
    ["vi", "IV", "I", "V"],
  ],
  Minor: [
    ["i", "VI", "III", "VII"],
    ["i", "iv", "V", "i"],
    ["ii°", "V", "i"],
    ["i", "VII", "VI", "VII"],
    ["i", "VI", "iv", "V"],
  ],
  Dorian: [
    ["i", "IV", "i", "VII"],
    ["i", "ii", "IV", "i"],
  ],
  Mixolydian: [
    ["I", "♭VII", "IV", "I"],
    ["I", "v", "♭VII", "IV"],
  ],
};

export function isPracticeMatch(
  pressed: number[],
  target: number[],
  mode: "Chord Learning" | "Exact Voicing",
): boolean {
  const sortedPressed = [...pressed].sort((a, b) => a - b);
  const sortedTarget = [...target].sort((a, b) => a - b);
  if (mode === "Exact Voicing") {
    return sortedPressed.length === sortedTarget.length && sortedPressed.every((note, index) => note === sortedTarget[index]);
  }
  const pressedPcs = [...new Set(sortedPressed.map((note) => note % 12))].sort((a, b) => a - b);
  const targetPcs = [...new Set(sortedTarget.map((note) => note % 12))].sort((a, b) => a - b);
  return pressedPcs.length === targetPcs.length && pressedPcs.every((pc, index) => pc === targetPcs[index]);
}
