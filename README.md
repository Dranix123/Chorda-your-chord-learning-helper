# Harmonic Practice

Desktop-first chord, piano voicing, progression, and deliberate-practice workspace.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:1211`. On the first run, create the first local account in the one-time setup screen. Later visits require that username and password; the product no longer enters through a default user.

The local development database is a project-local D1/SQLite database managed by Miniflare. Accounts, sessions, favorites, voicings, Builder state, progressions, preferences, and imports are stored on the local server, not in browser storage.

## Verify

```bash
npm test
npm run lint
```

Tests cover server rendering, removal of starter artifacts, required style tokens, diatonic chord generation, default voicings, accidental-aware search, inversion, and both practice matching modes.

## Product features

- Complete In Scale results plus clearly labeled Neighbor Keys discoveries
- Learning-order results that show basic chords across every scale degree first
- Continue-loading for large chord result sets
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

## Local data and identity

The first account can only be created from localhost or the configured `chords.vulpolirant.com` host, and only while the user table is empty. Passwords are stored as salted PBKDF2-SHA-256 hashes, and login uses an HttpOnly, SameSite session cookie. Every data read and write derives identity on the server; the client does not submit a `userId`.

The checked-in migrations are `drizzle/0000_user_states.sql` and `drizzle/0001_local_auth.sql`.

Cloudflare Tunnel is intentionally not configured by this repository. Configure it later against the local application when needed.
