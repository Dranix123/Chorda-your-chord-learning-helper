import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChords,
  defaultVoicing,
  invertVoicing,
  isPracticeMatch,
  matchesChordSearch,
  randomPracticeVoicing,
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
