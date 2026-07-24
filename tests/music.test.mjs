import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChords,
  defaultVoicing,
  invertVoicing,
  isPracticeMatch,
  matchesChordSearch,
} from "../lib/music.ts";

test("C major In Scale contains the seven required diatonic triads", () => {
  const triads = buildChords("C", "Major", "contextual", "In Scale")
    .filter((chord) => chord.family === "Triads")
    .map((chord) => chord.symbol);
  for (const required of ["C", "Dm", "Em", "F", "G", "Am", "Bdim"]) {
    assert.ok(triads.includes(required), `missing ${required}`);
  }
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
