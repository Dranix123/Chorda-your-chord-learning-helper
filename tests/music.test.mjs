import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChords,
  defaultVoicing,
  getFormulaCatalog,
  invertVoicing,
  isPracticeMatch,
  matchesChordSearch,
  PROGRESSION_TEMPLATES,
  progressionChordForNumeral,
  randomPracticeVoicing,
  setVoicingBass,
} from "../lib/music.ts";

test("C major In Scale contains the seven required diatonic triads", () => {
  const chords = buildChords("C", "Major", "contextual", "In Scale");
  const triads = chords
    .filter((chord) => chord.family === "Triads")
    .map((chord) => chord.symbol);
  for (const required of ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]) {
    assert.ok(triads.includes(required), `missing ${required}`);
  }
  assert.ok(chords.length > 36, "expected the complete result set to require continue-loading");
  assert.deepEqual([...new Set(chords.map((chord) => chord.root))].sort(), ["A", "B", "C", "D", "E", "F", "G"]);
  assert.ok(chords.every((chord) => chord.pitchClasses.every((pitchClass) => [0, 2, 4, 5, 7, 9, 11].includes(pitchClass))));
});

test("default C major voicing is C3 E3 G3", () => {
  assert.deepEqual(defaultVoicing(0, [0, 4, 7]), [48, 52, 55]);
});

test("extended chords retain every stacked chord tone", () => {
  const formulas = new Map(
    getFormulaCatalog()
      .filter((formula) => formula.family === "Extended")
      .map((formula) => [formula.suffix, formula.intervals]),
  );
  const expected = {
    9: [0, 4, 7, 10, 14],
    maj9: [0, 4, 7, 11, 14],
    m9: [0, 3, 7, 10, 14],
    mMaj9: [0, 3, 7, 11, 14],
    11: [0, 4, 7, 10, 14, 17],
    maj11: [0, 4, 7, 11, 14, 17],
    m11: [0, 3, 7, 10, 14, 17],
    13: [0, 4, 7, 10, 14, 17, 21],
    maj13: [0, 4, 7, 11, 14, 17, 21],
    m13: [0, 3, 7, 10, 14, 17, 21],
  };
  for (const [suffix, intervals] of Object.entries(expected)) {
    assert.deepEqual(formulas.get(suffix), intervals, `${suffix} has an incomplete formula`);
  }

  const cMajorEleven = buildChords("C", "Major", "contextual", "All Chords")
    .find((chord) => chord.symbol === "Cmaj11");
  assert.ok(cMajorEleven);
  assert.deepEqual(cMajorEleven.notes, ["C", "E", "G", "B", "D", "F"]);
});

test("the chord catalog contains no exact duplicate formulas", () => {
  const formulas = getFormulaCatalog();
  const signatures = formulas.map((formula) => formula.intervals.join(","));
  assert.equal(new Set(signatures).size, signatures.length);
  for (const redundant of ["add6", "m(add6)", "sus2(add2)", "sus4(add4)"]) {
    assert.equal(formulas.some((formula) => formula.suffix === redundant), false, `${redundant} is redundant`);
  }
});

test("search accepts Unicode and ASCII accidentals", () => {
  const chord = buildChords("C♯/D♭", "Major", "sharps", "All Chords")
    .find((candidate) => candidate.symbol === "F♯maj7");
  assert.ok(chord);
  assert.equal(matchesChordSearch(chord, "F#maj7"), true);
  assert.equal(matchesChordSearch(chord, "F♯maj7"), true);
});

test("inversion moves the selected chord tone to the bass", () => {
  const chord = buildChords("C", "Major", "contextual", "All Chords")
    .find((candidate) => candidate.symbol === "C");
  assert.ok(chord);
  const inversion = invertVoicing(chord, 4);
  assert.equal(inversion[0] % 12, 4);
});

test("a saved voicing can move any present chord tone to the bass", () => {
  const changed = setVoicingBass([36, 55, 64], 7);
  assert.equal(changed[0] % 12, 7);
  assert.deepEqual(changed.map((note) => note % 12).sort((a, b) => a - b), [0, 4, 7]);
});

test("practice distinguishes pitch classes from exact voicing", () => {
  assert.equal(isPracticeMatch([60, 64, 67], [48, 52, 55], "Chord Learning"), true);
  assert.equal(isPracticeMatch([60, 64, 67], [48, 52, 55], "Exact Voicing"), false);
  assert.equal(isPracticeMatch([48, 52, 55], [48, 52, 55], "Exact Voicing"), true);
});

test("Hear voicings include every chord tone inside one three-octave window", () => {
  const voicing = randomPracticeVoicing([0, 4, 7], 6, () => 0);
  assert.equal(voicing.length, 6);
  assert.deepEqual([...new Set(voicing.map((note) => note % 12))].sort((a, b) => a - b), [0, 4, 7]);
  assert.ok(voicing.every((note) => note >= 24 && note <= 83));
  assert.ok(Math.floor(Math.max(...voicing) / 12) - Math.floor(Math.min(...voicing) / 12) <= 2);
});

test("progression numerals resolve to the matching scale degrees and triad qualities", () => {
  const chords = buildChords("C", "Major", "contextual", "In Scale");
  const symbols = ["I", "V", "vi", "IV"].map((numeral) =>
    progressionChordForNumeral(chords, numeral)?.symbol,
  );
  assert.deepEqual(symbols, ["C", "G", "Am", "F"]);

  for (const [mode, templates] of Object.entries(PROGRESSION_TEMPLATES)) {
    const modeChords = buildChords("C", mode, "contextual", "In Scale");
    for (const template of templates) {
      for (const numeral of template) {
        const chord = progressionChordForNumeral(modeChords, numeral);
        assert.ok(chord, `${mode} ${numeral} does not resolve`);
        const core = numeral.replace(/[^ivIV]/g, "");
        const expected = numeral.includes("°")
          ? [0, 3, 6]
          : numeral.includes("+")
            ? [0, 4, 8]
            : core === core.toLowerCase()
              ? [0, 3, 7]
              : [0, 4, 7];
        assert.deepEqual(chord.intervals, expected, `${mode} ${numeral} has the wrong quality`);
      }
    }
  }
});
