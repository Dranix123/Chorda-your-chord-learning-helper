"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MODE_INTERVALS,
  PROGRESSION_TEMPLATES,
  ROOT_OPTIONS,
  buildChords,
  invertVoicing,
  isPracticeMatch,
  matchesChordSearch,
  midiNoteName,
  randomPracticeVoicing,
  type AccidentalPreference,
  type Chord,
} from "@/lib/music";

type Page = "Library" | "Chord" | "Favorites" | "Builder" | "Practice" | "Progressions" | "Settings";
type ChordView = "In Scale" | "Neighbor Keys";
type PracticeMode = "Chord Learning" | "Exact Voicing" | "Hear";
type PracticeSource = "scale" | "favorites";

type AuthUser = {
  id: string;
  username: string;
  source: "local" | "workspace";
};

type Voicing = {
  id: string;
  chordId: string;
  chordSymbol: string;
  name: string;
  notes: number[];
  explicitDefault: boolean;
  createdAt: string;
};

type Snapshot = {
  id: string;
  chordId: string;
  symbol: string;
  name: string;
  notes: number[];
  source: string;
};

type SavedProgression = {
  id: string;
  name: string;
  bpm: number;
  items: Snapshot[];
  updatedAt: string;
};

type PersistedState = {
  favorites: Snapshot[];
  builder: Snapshot[];
  voicings: Voicing[];
  progressions: SavedProgression[];
  preference: AccidentalPreference;
  key: string;
  mode: string;
  pianoCollapsed: boolean;
};

const DEFAULT_STATE: PersistedState = {
  favorites: [],
  builder: [],
  voicings: [],
  progressions: [],
  preference: "contextual",
  key: "C",
  mode: "Major",
  pianoCollapsed: false,
};

const NAV_ITEMS: Array<{ page: Page; key: string }> = [
  { page: "Library", key: "01" },
  { page: "Chord", key: "02" },
  { page: "Favorites", key: "03" },
  { page: "Builder", key: "04" },
  { page: "Practice", key: "05" },
  { page: "Progressions", key: "06" },
  { page: "Settings", key: "07" },
];

const DEGREE_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII"];

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function snapshotFor(chord: Chord, notes = chord.voicing, name = "System Default"): Snapshot {
  return {
    id: crypto.randomUUID(),
    chordId: chord.id,
    symbol: chord.symbol,
    name,
    notes: [...notes],
    source: chord.source,
  };
}

function useDebouncedStateSave(state: PersistedState, hydrated: boolean) {
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void fetch("/api/state", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state, hydrated]);
}

function writeVarLen(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes: number[] = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= (value & 0x7f) | 0x80;
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function exportMidi(items: Snapshot[], bpm: number) {
  const track: number[] = [];
  const tempo = Math.round(60_000_000 / bpm);
  track.push(0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
  track.push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
  items.forEach((item, itemIndex) => {
    item.notes.forEach((note, noteIndex) => {
      track.push(...writeVarLen(itemIndex === 0 && noteIndex === 0 ? 0 : 0), 0x90, note, 90);
    });
    item.notes.forEach((note, noteIndex) => {
      track.push(...writeVarLen(noteIndex === 0 ? 1920 : 0), 0x80, note, 0);
    });
  });
  track.push(0, 0xff, 0x2f, 0);

  const bytes = [
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    (track.length >> 24) & 0xff,
    (track.length >> 16) & 0xff,
    (track.length >> 8) & 0xff,
    track.length & 0xff,
    ...track,
  ];
  const blob = new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 16).replaceAll(/[-:T]/g, "");
  link.href = URL.createObjectURL(blob);
  link.download = `progression-${stamp}.mid`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function playNotes(notes: number[], duration = 1.5) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.setValueAtTime(0.16 / Math.max(1, Math.sqrt(notes.length)), context.currentTime);
  master.connect(context.destination);
  notes.forEach((note) => {
    const frequency = 440 * 2 ** ((note - 69) / 12);
    [1, 2, 3].forEach((harmonic, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.value = frequency * harmonic;
      envelope.gain.setValueAtTime((1 / harmonic) * 0.7, context.currentTime);
      envelope.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    });
  });
  window.setTimeout(() => void context.close(), (duration + 0.2) * 1000);
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export default function ChordApp() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [page, setPage] = useState<Page>("Library");
  const [stored, setStored] = useState<PersistedState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ChordView>("In Scale");
  const [family, setFamily] = useState("All Families");
  const [query, setQuery] = useState("");
  const [expandedDegrees, setExpandedDegrees] = useState<string[]>([]);
  const [selectedChord, setSelectedChord] = useState<Chord | null>(null);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<number[]>([]);
  const [status, setStatus] = useState("Ready");
  const [bpm, setBpm] = useState(120);
  const [loop, setLoop] = useState(false);
  const [midiState, setMidiState] = useState("Not connected");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("Chord Learning");
  const [practiceSource, setPracticeSource] = useState<PracticeSource>("scale");
  const [practiceCount, setPracticeCount] = useState(10);
  const [hearNoteCount, setHearNoteCount] = useState(3);
  const [hints, setHints] = useState(true);
  const [practiceItems, setPracticeItems] = useState<Snapshot[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceSuccess, setPracticeSuccess] = useState(0);
  const [practiceErrors, setPracticeErrors] = useState(0);
  const [practiceSkipped, setPracticeSkipped] = useState(0);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const saveFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setAuthUser(data.authenticated ? data.user : null);
        setCanBootstrap(Boolean(data.canBootstrap));
        setAuthChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setStatus("Cannot reach the local server.");
        setAuthChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    void fetch("/api/state")
      .then((response) => {
        if (response.status === 401) throw new Error("Session expired");
        return response.ok ? response.json() : DEFAULT_STATE;
      })
      .then((data) => {
        if (!active) return;
        setStored({ ...DEFAULT_STATE, ...data });
        setHydrated(true);
      })
      .catch(() => {
        if (!active) return;
        setStatus("Cannot reach the local server.");
      });
    return () => {
      active = false;
    };
  }, [authUser]);

  useDebouncedStateSave(stored, hydrated);

  const allChords = useMemo(
    () => buildChords(stored.key, stored.mode, stored.preference, view),
    [stored.key, stored.mode, stored.preference, view],
  );

  const filteredChords = useMemo(() => {
    const result = allChords.filter(
      (chord) => (family === "All Families" || chord.family === family) && matchesChordSearch(chord, query),
    );
    return [...result].sort(
      (a, b) =>
        DEGREE_ORDER.indexOf(a.degree) - DEGREE_ORDER.indexOf(b.degree) ||
        a.complexity - b.complexity ||
        a.voicing.length - b.voicing.length ||
        a.symbol.localeCompare(b.symbol),
    );
  }, [allChords, family, query]);

  const chordGroups = useMemo(
    () =>
      DEGREE_ORDER.map((degree) => ({
        degree,
        chords: filteredChords.filter((chord) => chord.degree === degree),
      })).filter((group) => group.chords.length),
    [filteredChords],
  );
  const userVoicings = selectedChord
    ? stored.voicings.filter((voicing) => voicing.chordId === selectedChord.id)
    : [];

  const currentPracticeTarget = practiceItems[practiceIndex];

  const updateStored = useCallback((patch: Partial<PersistedState>) => {
    setStored((current) => ({ ...current, ...patch }));
  }, []);

  function finishAuthentication(user: AuthUser) {
    setAuthUser(user);
    setCanBootstrap(false);
    setStatus("Signed in");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setStored(DEFAULT_STATE);
    setHydrated(false);
    setPage("Library");
    setStatus("Signed out");
  }

  function audition(chord: Chord, notes = chord.voicing) {
    setSelectedChord(chord);
    setActiveNotes(notes);
    setStatus(`Playing ${chord.symbol}`);
    playNotes(notes);
    window.setTimeout(() => setActiveNotes([]), 1500);
  }

  function openChord(chord: Chord) {
    setSelectedChord(chord);
    setSelectedNotes(chord.voicing);
    setPage("Chord");
  }

  function toggleFavorite(chord: Chord, notes = chord.voicing, name = "System Default") {
    const existing = stored.favorites.find(
      (favorite) => favorite.chordId === chord.id && favorite.name === name && favorite.notes.join(",") === notes.join(","),
    );
    updateStored({
      favorites: existing
        ? stored.favorites.filter((favorite) => favorite.id !== existing.id)
        : [...stored.favorites, snapshotFor(chord, notes, name)],
    });
    setStatus(existing ? "Removed from Favorites" : "Added to Favorites");
  }

  function addToBuilder(chord: Chord, notes = chord.voicing, name = "System Default") {
    updateStored({ builder: [...stored.builder, snapshotFor(chord, notes, name)] });
    setStatus(`${chord.symbol} added to Builder`);
  }

  function saveVoicingFor(chordId: string, chordSymbol: string, chordPitchClasses: number[], notes: number[]) {
    if (notes.length < 2 || notes.length > 16 || notes.some((note) => note < 21 || note > 108)) {
      setStatus("Choose 2–16 notes within A0–C8.");
      return;
    }
    const foreign = notes.filter((note) => !chordPitchClasses.includes(note % 12));
    const warning = foreign.length ? `Foreign notes: ${foreign.map((note) => midiNoteName(note, stored.preference)).join(", ")}` : "";
    if (warning && !window.confirm(`${warning}. Save anyway?`)) return;
    const nextNumber = stored.voicings.filter((voicing) => voicing.chordId === chordId).length + 1;
    const voicing: Voicing = {
      id: crypto.randomUUID(),
      chordId,
      chordSymbol,
      name: `Voicing ${nextNumber}`,
      notes: [...notes].sort((a, b) => a - b),
      explicitDefault: false,
      createdAt: new Date().toISOString(),
    };
    updateStored({ voicings: [...stored.voicings, voicing] });
    setStatus(`${voicing.name} saved`);
  }

  function saveVoicing() {
    if (!selectedChord) return;
    saveVoicingFor(selectedChord.id, selectedChord.symbol, selectedChord.pitchClasses, selectedNotes);
  }

  function startPractice(source: PracticeSource = practiceSource) {
    let available =
      source === "favorites"
        ? stored.favorites
        : buildChords(stored.key, stored.mode, stored.preference, "In Scale").map((chord) => snapshotFor(chord));
    const chordCatalog = buildChords(stored.key, stored.mode, stored.preference, "All Chords");
    const tonesFor = (item: Snapshot) =>
      chordCatalog.find((chord) => chord.id === item.chordId)?.pitchClasses
      ?? [...new Set(item.notes.map((note) => note % 12))];
    if (practiceMode === "Hear") {
      available = available.filter((item) => {
        const toneCount = tonesFor(item).length;
        return toneCount <= hearNoteCount && hearNoteCount <= toneCount * 3;
      });
    }
    if (!available.length) {
      setStatus("No chords match this practice setup.");
      return;
    }

    const requestedCount = Math.max(1, Math.min(50, Math.floor(practiceCount)));
    const sourceItems: Snapshot[] = [];
    while (sourceItems.length < requestedCount) {
      const batch = shuffled(available);
      for (const item of batch) {
        if (sourceItems.length >= requestedCount) break;
        const notes = practiceMode === "Hear"
          ? randomPracticeVoicing(tonesFor(item), hearNoteCount)
          : [...item.notes];
        sourceItems.push({
          ...item,
          id: crypto.randomUUID(),
          name: practiceMode === "Hear" ? `Hear · ${hearNoteCount} notes` : item.name,
          notes,
        });
      }
    }
    setPracticeSource(source);
    setPracticeItems(sourceItems);
    setPracticeIndex(0);
    setPracticeSuccess(0);
    setPracticeErrors(0);
    setPracticeSkipped(0);
    setPracticeComplete(false);
    setSelectedNotes([]);
    setStatus(`Practice started with ${sourceItems.length} random chords`);
  }

  function advancePractice(skipped = false) {
    if (skipped) setPracticeSkipped((count) => count + 1);
    setPracticeSuccess(0);
    setSelectedNotes([]);
    if (practiceIndex + 1 >= practiceItems.length) {
      setPracticeComplete(true);
    } else {
      setPracticeIndex((index) => index + 1);
      setStatus(skipped ? "Chord skipped" : "Next chord");
    }
  }

  function returnToPracticeSetup() {
    setPracticeItems([]);
    setPracticeIndex(0);
    setPracticeSuccess(0);
    setPracticeErrors(0);
    setPracticeSkipped(0);
    setPracticeComplete(false);
    setSelectedNotes([]);
    setStatus("Practice setup");
  }

  useEffect(() => {
    if (page !== "Practice" || !currentPracticeTarget || practiceComplete || selectedNotes.length === 0) return;
    const timer = window.setTimeout(() => {
      const matchMode = practiceMode === "Chord Learning" ? "Chord Learning" : "Exact Voicing";
      if (isPracticeMatch(selectedNotes, currentPracticeTarget.notes, matchMode)) {
        setStatus("Correct — release all notes");
        if (practiceSuccess + 1 >= 3) {
          if (practiceIndex + 1 >= practiceItems.length) {
            setPracticeComplete(true);
          } else {
            setPracticeIndex((index) => index + 1);
            setPracticeSuccess(0);
          }
        } else {
          setPracticeSuccess((count) => count + 1);
        }
        setSelectedNotes([]);
      } else if (selectedNotes.some((note) => !currentPracticeTarget.notes.map((target) => target % 12).includes(note % 12))) {
        setPracticeErrors((count) => count + 1);
        setStatus("Wrong note — adjust and try again");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [selectedNotes, currentPracticeTarget, practiceComplete, practiceMode, page, practiceIndex, practiceItems.length, practiceSuccess]);

  useEffect(() => {
    if (page !== "Practice" || practiceMode !== "Hear" || !currentPracticeTarget || practiceComplete) return;
    const timer = window.setTimeout(() => playNotes(currentPracticeTarget.notes), 250);
    return () => window.clearTimeout(timer);
  }, [currentPracticeTarget, page, practiceComplete, practiceMode]);

  async function connectMidi() {
    const midiNavigator = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<{
        inputs: Map<string, { name?: string; onmidimessage: ((event: { data: Uint8Array }) => void) | null }>;
      }>;
    };
    if (!midiNavigator.requestMIDIAccess) {
      setMidiState("Web MIDI unavailable");
      return;
    }
    try {
      const access = await midiNavigator.requestMIDIAccess();
      const input = [...access.inputs.values()][0];
      if (!input) {
        setMidiState("No MIDI input found");
        return;
      }
      input.onmidimessage = (event) => {
        if (!event.data) return;
        const [command, note, velocity] = event.data;
        const isNoteOn = (command & 0xf0) === 0x90 && velocity > 0;
        const isNoteOff = (command & 0xf0) === 0x80 || ((command & 0xf0) === 0x90 && velocity === 0);
        setSelectedNotes((notes) => {
          if (isNoteOn && !notes.includes(note)) return [...notes, note];
          if (isNoteOff) return notes.filter((value) => value !== note);
          return notes;
        });
      };
      setMidiState(`Connected: ${input.name ?? "MIDI input"}`);
    } catch {
      setMidiState("MIDI permission denied");
    }
  }

  function saveProgression() {
    if (!stored.builder.length) return;
    const name = window.prompt("Progression name", `Progression ${stored.progressions.length + 1}`);
    if (!name?.trim()) return;
    const progression: SavedProgression = {
      id: crypto.randomUUID(),
      name: name.trim(),
      bpm,
      items: stored.builder.map((item) => ({ ...item, id: crypto.randomUUID(), notes: [...item.notes] })),
      updatedAt: new Date().toISOString(),
    };
    updateStored({ progressions: [...stored.progressions, progression] });
    setStatus("Progression saved");
  }

  function exportMyData() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, ...stored }, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "chorda-data.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importMyData(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<PersistedState> & { schemaVersion?: number };
      if (parsed.schemaVersion !== 1) throw new Error("Unsupported schema version");
      updateStored({
        favorites: [...stored.favorites, ...(parsed.favorites ?? []).map((item) => ({ ...item, id: crypto.randomUUID() }))],
        builder: parsed.builder ?? stored.builder,
        voicings: [...stored.voicings, ...(parsed.voicings ?? []).map((item) => ({ ...item, id: crypto.randomUUID() }))],
        progressions: [...stored.progressions, ...(parsed.progressions ?? []).map((item) => ({ ...item, id: crypto.randomUUID() }))],
        preference: parsed.preference ?? stored.preference,
      });
      setStatus("Data imported");
    } catch {
      setStatus("Invalid import. Existing data was not changed.");
    }
  }

  function renderChordCard(chord: Chord) {
    const favorite = stored.favorites.some((item) => item.chordId === chord.id && item.name === "System Default");
    return (
      <article className={`chord-card ${selectedChord?.id === chord.id ? "selected" : ""}`} key={chord.id}>
        <button
          className="card-main"
          onClick={(event) => {
            if (event.detail === 1) audition(chord);
          }}
          onDoubleClick={() => openChord(chord)}
          aria-label={`Play ${chord.symbol}; double click for chord details`}
        >
          <h2>{chord.symbol}</h2>
          <p className="notes">{chord.notes.join(" · ")}</p>
          <span className="card-family">{chord.family}</span>
        </button>
        <div className="card-actions">
          <button title={favorite ? "Remove from Favorites" : "Add to Favorites"} onClick={() => toggleFavorite(chord)}>
            {favorite ? "♥ Saved" : "♡ Save"}
          </button>
          <button title="Add to Builder" onClick={() => addToBuilder(chord)}>＋ Builder</button>
        </div>
      </article>
    );
  }

  function renderLibrary() {
    return (
      <>
        <PageHeading eyebrow="Chord discovery" title="Chord Library" count={filteredChords.length} label="chords" />
        <section className="library-toolbar" aria-label="Chord filters">
          <div className="segmented">
            {(["In Scale", "Neighbor Keys"] as ChordView[]).map((item) => (
              <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
                {item}
              </button>
            ))}
          </div>
          <label className="search-field">
            <span>Search</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chords" />
          </label>
          <label>
            <span>Chord Family</span>
            <select value={family} onChange={(event) => setFamily(event.target.value)}>
              {["All Families", "Triads", "Sixth", "Seventh", "Extended", "Added Tone"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </section>

        {!chordGroups.length ? (
          <EmptyState title="No matching chords" body="Change the search or family filter." />
        ) : (
          <section className="degree-groups" aria-label="Chord results by scale degree">
            {chordGroups.map(({ degree, chords }) => {
              const expanded = expandedDegrees.includes(degree) || Boolean(query);
              const visible = expanded ? chords : chords.slice(0, 6);
              const roots = [...new Set(chords.map((chord) => chord.root))].join(" · ");
              return (
                <section className="degree-row" key={degree}>
                  <header>
                    <div><span>{degree}</span><small>{roots}</small></div>
                    <button
                      onClick={() => setExpandedDegrees((degrees) =>
                        degrees.includes(degree)
                          ? degrees.filter((item) => item !== degree)
                          : [...degrees, degree])}
                      disabled={Boolean(query) || chords.length <= 6}
                    >
                      {query ? `Matches · ${chords.length}` : chords.length <= 6 ? "All Shown" : expanded ? "Collapse" : `Show All · ${chords.length}`}
                    </button>
                  </header>
                  <div className={`degree-chord-grid ${expanded ? "expanded" : "collapsed"}`}>
                    {visible.map(renderChordCard)}
                  </div>
                </section>
              );
            })}
          </section>
        )}
      </>
    );
  }

  function renderChord() {
    if (!selectedChord) {
      return (
        <>
          <PageHeading eyebrow="Voicing workspace" title="Chord" />
          <EmptyState title="No chord selected" body="Double-click a chord in the Library." action="Open Library" onAction={() => setPage("Library")} />
        </>
      );
    }

    const favorite = stored.favorites.some((item) => item.chordId === selectedChord.id && item.name === "System Default");
    return (
      <>
        <PageHeading eyebrow={`${selectedChord.degree} · ${selectedChord.family}`} title={selectedChord.symbol} />
        <section className="chord-page-actions">
          <button onClick={() => toggleFavorite(selectedChord)}>{favorite ? "♥ Saved" : "♡ Save"}</button>
          <button onClick={() => addToBuilder(selectedChord)}>＋ Builder</button>
        </section>
        <section className="detail-panel chord-workspace">
          <div className="detail-columns">
            <div>
              <h3>System Default</h3>
              <p className="large-notes">{selectedChord.voicing.map((note) => midiNoteName(note, stored.preference)).join(" · ")}</p>
              <div className="button-row">
                <button className="primary-button" onClick={() => audition(selectedChord)}>Play Voicing</button>
                <button onClick={() => setSelectedNotes(selectedChord.voicing)}>Edit on Piano</button>
              </div>
            </div>
            <div>
              <h3>Root Note</h3>
              <div className="bass-options">
                {selectedChord.pitchClasses.map((pc, index) => (
                  <button
                    key={pc}
                    onClick={() => {
                      const notes = invertVoicing(selectedChord, pc);
                      setSelectedNotes(notes);
                      setActiveNotes(notes);
                      playNotes(notes);
                    }}
                  >
                    {selectedChord.notes[index]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3>Personal Voicings</h3>
              {userVoicings.length > 0 && (
                <div className="mini-list">
                  {userVoicings.map((voicing) => (
                    <button key={voicing.id} onClick={() => audition(selectedChord, voicing.notes)}>
                      <span>{voicing.name}</span>
                      <small>{voicing.notes.map((note) => midiNoteName(note, stored.preference)).join(" ")}</small>
                    </button>
                  ))}
                </div>
              )}
              <button className="primary-button" onClick={saveVoicing}>Save as New Voicing</button>
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderFavorites() {
    return (
      <>
        <PageHeading eyebrow="Saved voicings" title="Favorites" />
        {stored.favorites.length === 0 ? (
          <EmptyState title="No favorites yet" body="Save a chord from the Library." action="Browse Library" onAction={() => setPage("Library")} />
        ) : (
          <section className="record-list">
            {stored.favorites.map((favorite, index) => (
              <article key={favorite.id}>
                <span className="record-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="record-main">
                  <h2>{favorite.symbol}</h2>
                  <p>{favorite.name} · {favorite.notes.map((note) => midiNoteName(note, stored.preference)).join(" · ")}</p>
                </div>
                <button onClick={() => playNotes(favorite.notes)}>Play</button>
                <button onClick={() => updateStored({ builder: [...stored.builder, { ...favorite, id: crypto.randomUUID() }] })}>＋ Builder</button>
                <button onClick={() => updateStored({ favorites: stored.favorites.filter((item) => item.id !== favorite.id) })}>Remove</button>
              </article>
            ))}
            <button className="primary-button practice-favorites" onClick={() => {
              returnToPracticeSetup();
              setPracticeSource("favorites");
              setPage("Practice");
            }}>
              Practice Favorites
            </button>
          </section>
        )}
      </>
    );
  }

  function renderBuilder() {
    return (
      <>
        <PageHeading eyebrow="Compose with exact voicings" title="Progression Builder" count={stored.builder.length} label="bars" />
        <section className="transport">
          <button className="primary-button" disabled={!stored.builder.length} onClick={() => stored.builder.forEach((item, index) => window.setTimeout(() => playNotes(item.notes), index * (240000 / bpm)))}>
            Play All
          </button>
          <label>BPM <input type="number" min={40} max={240} value={bpm} onChange={(event) => setBpm(Math.max(40, Math.min(240, Number(event.target.value))))} /></label>
          <label className="check-label"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label>
          <button disabled={!stored.builder.length} onClick={saveProgression}>Save Progression</button>
          <button disabled={!stored.builder.length} onClick={() => exportMidi(stored.builder, bpm)}>Export MIDI</button>
          <button disabled={!stored.builder.length} onClick={() => window.confirm("Clear all Builder items?") && updateStored({ builder: [] })}>Clear All</button>
        </section>
        {stored.builder.length === 0 ? (
          <EmptyState title="Builder is empty" body="Add chords from Library or Favorites." action="Find Chords" onAction={() => setPage("Library")} />
        ) : (
          <section className="builder-timeline">
            {stored.builder.map((item, index) => (
              <article key={item.id}>
                <div className="drag-handle" title="Drag reorder">⠿</div>
                <span className="bar-number">Bar {index + 1}</span>
                <div>
                  <h2>{item.symbol}</h2>
                  <p>{item.name}</p>
                  <small>{item.notes.map((note) => midiNoteName(note, stored.preference)).join(" · ")}</small>
                </div>
                <button onClick={() => playNotes(item.notes)}>Play</button>
                <button onClick={() => {
                  const next = [...stored.builder];
                  next.splice(index + 1, 0, { ...item, id: crypto.randomUUID() });
                  updateStored({ builder: next });
                }}>Duplicate</button>
                <button onClick={() => updateStored({ builder: stored.builder.filter((entry) => entry.id !== item.id) })}>Remove</button>
              </article>
            ))}
          </section>
        )}
      </>
    );
  }

  function renderPractice() {
    if (practiceComplete) {
      const completedItems = practiceItems.length - practiceSkipped;
      return (
        <>
          <PageHeading eyebrow="Session complete" title="Well Played" count={practiceItems.length} label="chords" />
          <section className="practice-result">
            <span>Complete</span>
            <h2>{completedItems * 3} successful repetitions</h2>
            <div><strong>{practiceErrors}</strong><small>Errors</small></div>
            <div><strong>{completedItems}</strong><small>Completed</small></div>
            <div><strong>{practiceSkipped}</strong><small>Skipped</small></div>
            <div className="button-row">
              <button className="primary-button" onClick={() => startPractice()}>Practice Again</button>
              <button onClick={returnToPracticeSetup}>Change Setup</button>
            </div>
          </section>
        </>
      );
    }
    return (
      <>
        <PageHeading
          eyebrow="Practice"
          title="Practice Mode"
          count={practiceItems.length ? practiceIndex + 1 : undefined}
          label={practiceItems.length ? `of ${practiceItems.length}` : undefined}
        />
        {!practiceItems.length ? (
          <section className="practice-setup">
            <div>
              <p className="eyebrow">01 · Source</p>
              <h2>Choose material</h2>
              <div className="choice-grid">
                <button className={practiceSource === "scale" ? "selected" : ""} onClick={() => setPracticeSource("scale")}>
                  Current Scale<small>{stored.key} {stored.mode}</small>
                </button>
                <button className={practiceSource === "favorites" ? "selected" : ""} onClick={() => setPracticeSource("favorites")} disabled={!stored.favorites.length}>
                  Favorites<small>{stored.favorites.length} available</small>
                </button>
              </div>
              <label className="number-field">
                <span>Chords</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={practiceCount}
                  onChange={(event) => setPracticeCount(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                />
              </label>
            </div>
            <div>
              <p className="eyebrow">02 · Mode</p>
              <h2>Set the challenge</h2>
              <div className="choice-grid challenge-grid">
                {(["Chord Learning", "Exact Voicing", "Hear"] as PracticeMode[]).map((mode) => (
                  <button key={mode} className={practiceMode === mode ? "selected" : ""} onClick={() => setPracticeMode(mode)}>
                    {mode}
                    <small>{mode === "Chord Learning" ? "Pitch classes" : mode === "Exact Voicing" ? "Exact notes" : "Random voicing"}</small>
                  </button>
                ))}
              </div>
              {practiceMode === "Hear" && (
                <label className="number-field">
                  <span>Notes per Chord</span>
                  <input
                    type="number"
                    min={2}
                    max={8}
                    value={hearNoteCount}
                    onChange={(event) => setHearNoteCount(Math.max(2, Math.min(8, Number(event.target.value) || 2)))}
                  />
                </label>
              )}
              <label className="check-label"><input type="checkbox" checked={hints} onChange={(event) => setHints(event.target.checked)} /> Visual Hints</label>
            </div>
            <button
              className="primary-button start-practice"
              onClick={() => startPractice()}
              disabled={practiceSource === "favorites" && !stored.favorites.length}
            >
              Start Practice · {practiceCount} Chords
            </button>
          </section>
        ) : currentPracticeTarget ? (
          <section className="practice-stage">
            <div className="practice-stage-actions">
              <button onClick={returnToPracticeSetup}>← Back to Setup</button>
              <label className="check-label">
                <input type="checkbox" checked={hints} onChange={(event) => setHints(event.target.checked)} />
                Visual Hints
              </label>
            </div>
            <div className="practice-progress">
              <span>Item {practiceIndex + 1}/{practiceItems.length}</span>
              <div><i style={{ width: `${((practiceIndex + practiceSuccess / 3) / practiceItems.length) * 100}%` }} /></div>
              <span>Success {practiceSuccess}/3</span>
            </div>
            <p className="eyebrow">{practiceMode}</p>
            <h2>{practiceMode === "Hear" && !hints ? "Listen" : currentPracticeTarget.symbol}</h2>
            {hints && <p className="practice-target">{currentPracticeTarget.notes.map((note) => midiNoteName(note, stored.preference)).join(" · ")}</p>}
            <div className="practice-buttons">
              <button onClick={() => playNotes(currentPracticeTarget.notes)}>{practiceMode === "Hear" ? "Hear Again" : "Hear Target"}</button>
              {practiceMode === "Hear" && (
                <button onClick={() => saveVoicingFor(
                  currentPracticeTarget.chordId,
                  currentPracticeTarget.symbol,
                  [...new Set(currentPracticeTarget.notes.map((note) => note % 12))],
                  currentPracticeTarget.notes,
                )}>
                  Save as New Voicing
                </button>
              )}
              <button onClick={() => advancePractice(true)}>Skip</button>
            </div>
            <div className="feedback-line">
              <span>Errors {practiceErrors}</span><span>Skipped {practiceSkipped}</span>
            </div>
          </section>
        ) : null}
      </>
    );
  }

  function renderProgressions() {
    const templateGroup = stored.mode.includes("Minor") ? "Minor" : PROGRESSION_TEMPLATES[stored.mode] ? stored.mode : "Major";
    const templates = PROGRESSION_TEMPLATES[templateGroup] ?? PROGRESSION_TEMPLATES.Major;
    return (
      <>
        <PageHeading eyebrow="Harmonic movement" title="Progressions" count={templates.length + stored.progressions.length} label="available" />
        <section className="progression-section">
          <div className="section-label"><span>Templates</span><small>Read-only · {stored.key} {stored.mode}</small></div>
          <div className="progression-grid">
            {templates.map((numerals, index) => {
              const triads = buildChords(stored.key, stored.mode, stored.preference, "In Scale").filter((chord) => chord.family === "Triads");
              const items = numerals.map((numeral, itemIndex) => {
                const chord = triads[itemIndex % Math.max(1, triads.length)] ?? allChords[0];
                return chord ? snapshotFor(chord) : null;
              }).filter(Boolean) as Snapshot[];
              return (
                <article key={numerals.join("-")}>
                  <span>Template {String(index + 1).padStart(2, "0")}</span>
                  <h2>{numerals.join(" – ")}</h2>
                  <p>{items.map((item) => item.symbol).join(" · ")}</p>
                  <div className="button-row">
                    <button onClick={() => items.forEach((item, itemIndex) => window.setTimeout(() => playNotes(item.notes), itemIndex * 2000))}>Play</button>
                    <button onClick={() => { updateStored({ builder: items }); setPage("Builder"); }}>Load into Builder</button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="progression-section">
          <div className="section-label"><span>My Progressions</span><small>Saved from Builder</small></div>
          {stored.progressions.length === 0 ? (
            <p className="inline-empty">No saved progressions yet.</p>
          ) : (
            <div className="saved-progressions">
              {stored.progressions.map((progression) => (
                <article key={progression.id}>
                  <div><h2>{progression.name}</h2><p>{progression.items.map((item) => item.symbol).join(" · ")}</p></div>
                  <span>{progression.bpm} BPM</span>
                  <button onClick={() => { updateStored({ builder: progression.items.map((item) => ({ ...item, id: crypto.randomUUID() })) }); setPage("Builder"); }}>Open</button>
                  <button onClick={() => window.confirm(`Delete ${progression.name}?`) && updateStored({ progressions: stored.progressions.filter((item) => item.id !== progression.id) })}>Delete</button>
                </article>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  function renderSettings() {
    return (
      <>
        <PageHeading eyebrow="Instrument and data" title="Settings" count={1} label="local profile" />
        <section className="settings-list">
          <article>
            <div><h2>Accidental Preference</h2></div>
            <select value={stored.preference} onChange={(event) => updateStored({ preference: event.target.value as AccidentalPreference })}>
              <option value="contextual">Contextual spelling</option>
              <option value="sharps">Prefer sharps</option>
              <option value="flats">Prefer flats</option>
            </select>
          </article>
          <article>
            <div><h2>MIDI Input</h2></div>
            <span className="setting-status">{midiState}</span>
            <button onClick={connectMidi}>Connect MIDI</button>
          </article>
          <article>
            <div><h2>Export My Data</h2></div>
            <button onClick={exportMyData}>Export JSON</button>
          </article>
          <article>
            <div><h2>Import My Data</h2></div>
            <input ref={saveFileRef} type="file" accept="application/json" hidden onChange={(event) => event.target.files?.[0] && void importMyData(event.target.files[0])} />
            <button onClick={() => saveFileRef.current?.click()}>Import JSON</button>
          </article>
          <article>
            <div><h2>Account</h2><p>Signed in as {authUser?.username}. Your data is isolated on the local server.</p></div>
            <button onClick={() => void signOut()}>Sign Out</button>
          </article>
        </section>
      </>
    );
  }

  if (!authChecked) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">Chorda</p>
          <h1>Loading local session</h1>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return <LoginScreen canBootstrap={canBootstrap} onAuthenticated={finishAuthentication} />;
  }

  return (
    <div className={`app-shell ${stored.pianoCollapsed ? "piano-collapsed" : ""}`}>
      <div className="desktop-notice">
        <span>Chorda</span>
        <h1>Desktop viewport required</h1>
      </div>
      <header className="topbar">
        <button className="wordmark" onClick={() => setPage("Library")}>Chorda</button>
        <div className="global-controls">
          <label><span>Key</span><select value={stored.key} onChange={(event) => updateStored({ key: event.target.value })}>{ROOT_OPTIONS.map((root) => <option key={root}>{root}</option>)}</select></label>
          <label><span>Scale / Mode</span><select value={stored.mode} onChange={(event) => updateStored({ mode: event.target.value })}>{Object.keys(MODE_INTERVALS).map((mode) => <option key={mode}>{mode}</option>)}</select></label>
          <label><span>Chord View</span><select value={view} onChange={(event) => setView(event.target.value as ChordView)}><option>In Scale</option><option>Neighbor Keys</option></select></label>
        </div>
        <button className="midi-pill" onClick={connectMidi}><i /> MIDI · {midiState === "Not connected" ? "OFF" : "ON"}</button>
        <button className="user-menu" onClick={() => setPage("Settings")}>{authUser?.username.slice(0, 2).toUpperCase()} <span>{authUser?.username}</span></button>
      </header>

      <aside className="sidebar">
        <nav aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}>
              <span>{item.key}</span>{item.page}
              {item.page === "Builder" && stored.builder.length > 0 && <b>{stored.builder.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>Current context</p>
          <strong>{stored.key} {stored.mode}</strong>
          <span>{allChords.filter((chord) => chord.source === "In Scale").length} chords in scale</span>
        </div>
      </aside>

      <main>
        {page === "Library" && renderLibrary()}
        {page === "Chord" && renderChord()}
        {page === "Favorites" && renderFavorites()}
        {page === "Builder" && renderBuilder()}
        {page === "Practice" && renderPractice()}
        {page === "Progressions" && renderProgressions()}
        {page === "Settings" && renderSettings()}
      </main>

      <section className="piano-dock" aria-label="On-screen piano">
        <div className="piano-toolbar">
          <div><span>On-screen Piano</span><small>{selectedNotes.length ? selectedNotes.map((note) => midiNoteName(note, stored.preference)).join(" · ") : "Select notes or play a chord"}</small></div>
          <div className="legend"><span><i className="target" /> Target</span><span><i className="pressed" /> Selected</span><span><i className="active" /> Playing</span></div>
          <button onClick={() => setSelectedNotes([])}>Clear</button>
          <button onClick={() => selectedNotes.length && playNotes(selectedNotes)}>Play Selection</button>
          <button onClick={() => updateStored({ pianoCollapsed: !stored.pianoCollapsed })}>{stored.pianoCollapsed ? "Expand" : "Collapse"}</button>
        </div>
        {!stored.pianoCollapsed && (
          <div className="piano-scroll">
            <div className="piano">
              {Array.from({ length: 88 }, (_, index) => index + 21).map((note) => {
                const black = [1, 3, 6, 8, 10].includes(note % 12);
                const isTarget = page === "Practice" && hints && currentPracticeTarget?.notes.includes(note);
                return (
                  <button
                    key={note}
                    className={`${black ? "black" : "white"} ${selectedNotes.includes(note) ? "pressed" : ""} ${activeNotes.includes(note) ? "sounding" : ""} ${isTarget ? "target" : ""}`}
                    aria-label={midiNoteName(note, stored.preference)}
                    title={`${midiNoteName(note, stored.preference)} · MIDI ${note}`}
                    onClick={() => {
                      setSelectedNotes((notes) => notes.includes(note) ? notes.filter((value) => value !== note) : [...notes, note]);
                      playNotes([note], 0.7);
                    }}
                  >
                    {!black && note % 12 === 0 ? <span>{midiNoteName(note, stored.preference)}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="status-bar" role="status">
        <span>{status}</span>
        <span>Server sync · {hydrated ? "Ready" : "Loading"}</span>
      </div>
    </div>
  );
}

function LoginScreen({
  canBootstrap,
  onAuthenticated,
}: {
  canBootstrap: boolean;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(canBootstrap ? "/api/auth/bootstrap" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Sign in failed.");
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError("Cannot reach the local server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Chorda</p>
        <h1>{canBootstrap ? "Create the first local account" : "Sign in"}</h1>
        <p>
          {canBootstrap
            ? "This one-time setup is available only while no account exists. There is no public registration afterward."
            : "Use an account created on this local host."}
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>Username</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={40}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={canBootstrap ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={10}
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Please Wait" : canBootstrap ? "Create Account" : "Sign In"}
          </button>
        </form>
      </section>
    </main>
  );
}

function PageHeading({
  eyebrow,
  title,
  count,
  label,
}: {
  eyebrow: string;
  title: string;
  count?: number;
  label?: string;
}) {
  return (
    <section className="page-heading">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      {typeof count === "number" && label && (
        <div className="heading-stat"><span>{count}</span><small>{label}</small></div>
      )}
    </section>
  );
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <section className="empty-state">
      <span>○</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action && <button className="primary-button" onClick={onAction}>{action}</button>}
    </section>
  );
}
