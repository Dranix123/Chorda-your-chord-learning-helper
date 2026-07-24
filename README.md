# Harmonic Practice

Desktop-first chord, piano voicing, progression, and deliberate-practice workspace.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The local development database is a project-local D1/SQLite database managed by Miniflare. Saved favorites, voicings, Builder state, progressions, preferences, and imports are stored on the server, not in browser storage.

## Verify

```bash
npm test
npm run lint
```

Tests cover server rendering, removal of starter artifacts, required style tokens, diatonic chord generation, default voicings, accidental-aware search, inversion, and both practice matching modes.

## Product features

- Library views for In Scale, Neighbor Keys, and All Chords
- 12 roots and all V1 scale/mode formulas
- Triad, sixth, seventh, extended, and added-tone chord families
- Caslon-based dark/light editorial visual system
- Exact 88-key on-screen piano and Web MIDI input
- System and personal voicings with validation and bass-note inversions
- Server-synced Favorites and Progression Builder
- Standard MIDI file export at PPQ 480, 4/4, one chord per bar
- Chord Learning and Exact Voicing practice modes
- Progression templates and personal progressions
- Versioned JSON data export/import

## Data and identity

In a private Sites deployment, the authenticated workspace email is the server-side user key. Local development uses the isolated `local-demo` user. Every read and write derives identity on the server; the client does not submit a `userId`.

The checked-in migration is `drizzle/0000_user_states.sql`. The deployed application uses the logical `DB` binding declared in `.openai/hosting.json`.
