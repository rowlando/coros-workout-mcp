# How We Built v1 of coros-workout-mcp

A blow-by-blow account of building an MCP server for COROS strength workouts through human-AI pairing. This covers the initial release only — from first API capture to published project with YouTube walkthrough, about 2.5 weeks in total, with the core implementation happening in a single intense day.

## Phase 1: Reverse Engineering the COROS API (~Jan 27, 2026)

The project started with opening Chrome DevTools on the COROS Training Hub web app (`trainingeu.coros.com`) and capturing network traffic. The earliest artifacts are dated **January 27**:

- **[`strength-exercises.json`](https://gist.github.com/rowlando/bf6000802f97b6990306ddd9e53c5eab)** (1.3 MB) — We captured the full response from the COROS exercise query endpoint. This is the raw API catalog: ~383 strength exercises, each with numeric IDs for muscles, body parts, equipment, animation references, thumbnail/video URLs, and default sets/reps. Crucially, the exercise names were **opaque codes** like `T1004`, `T1002`, `T1061` — not human-readable.

- **[`en-US.prod.js`](https://gist.github.com/rowlando/8cbd9767338ceb6aa0661c6f21697b82)** (605 KB) — We extracted the i18n localization bundle from the COROS web app's JavaScript. This was the Rosetta Stone: it mapped those internal codes (`T1004`) to readable names (`Push-ups`). Found by inspecting the web app's loaded scripts in DevTools.

- **[`exercises-clean.json`](research/exercises-clean.json)** — We wrote a Python script ([`extract-exercises.py`](research/extract-exercises.py)) to merge the raw exercise data with the i18n strings. This script decoded the numeric enum values (muscle `2` = "Chest", equipment `1` = "Bodyweight", part `5` = "Legs/Hips") and produced a clean JSON with human names, body parts, muscles, equipment, and media URLs. This was an early Claude Code pairing session — the script has the hallmarks of us working together: clean enum dictionaries, the i18n parsing regex to strip `window.en_US=` prefix, and CSV output for easy browsing.

## Phase 2: Capturing the Workout Creation Flow (~Feb 2, 2026)

About a week later, we went back to Chrome DevTools and **created a test workout manually** in the COROS Training Hub, capturing every API call:

- **[`create-workout-request-all.txt`](research/create-workout-request-all.txt)** (28 KB) — Three captured `curl` commands showing the complete workout creation flow:
  1. `POST /training/program/calculate` — Sends the full workout payload (exercises with ~40 fields each) and gets back calculated metrics (duration, totalSets, trainingLoad)
  2. `POST /training/program/add` — Sends the same payload enriched with calculated values to actually save the workout
  3. `POST /training/program/query` — Lists existing workouts

This was the critical research artifact. The captured payloads revealed the exact shape of the exercise objects the API expected — every field from `animationId` to `intensityDisplayUnit`. We chose a simple 3-exercise test workout (Push-ups, Pull-ups, Squats) which made it easy to see the pattern.

Key discoveries from the captures:
- Auth uses an `accesstoken` header plus a `yfheader` JSON containing the `userId`
- The exercise payload is deeply nested with ~40 fields per exercise, including media URLs, muscle relevance arrays, and multiple text fields
- The API uses a calculate-then-add two-step pattern
- Workout `sportType: 4` = Strength Training
- Weight is stored in **grams** internally (`intensityValue`)
- EU and US have separate API hosts

## Phase 3: Planning the MCP Server (~Feb 11, 2026)

With the research complete, we sat down together to plan the implementation. Key design decisions we made:

1. **TypeScript MCP server** using `@modelcontextprotocol/sdk` with STDIO transport — the standard approach for Claude Desktop and Claude Code compatibility.

2. **Bundled exercise catalog** rather than hitting the API every time — the ~383 exercises rarely change, so we shipped `data/exercises.json` with the server and added an `update_exercises` tool for refreshing it.

3. **Name-based exercise lookup** — Users say "Push-ups" not exercise ID 1. The server handles all the name-to-catalog-to-payload resolution internally. This was a deliberate UX choice: Claude can search the catalog by name/muscle/equipment, design a workout using its fitness knowledge, and the MCP server handles the gnarly 40-field API payloads.

4. **Two data sources merged** — The `prepare-catalog.ts` script joins the raw API data (with all the numeric IDs and media URLs needed for payloads) with the i18n-derived human names (matched by thumbnail URL, since that was the only reliable common key).

5. **Prior art research** — We referenced the [Garmin Workouts MCP](https://github.com/charlesfrisbee/garmin-workouts-mcp) as inspiration, the [coros-connect](https://github.com/jmn8718/coros-connect) library that confirmed the login API pattern, and an existing read-only COROS MCP server. This context helped validate our approach.

6. **Env var auth** — To avoid users typing credentials in conversation, we supported `COROS_EMAIL`/`COROS_PASSWORD`/`COROS_REGION` environment variables alongside interactive login.

7. **4-file architecture** — Clean separation: `types.ts` (all interfaces/enums), `coros-api.ts` (API client + payload construction), `exercise-catalog.ts` (search engine), `index.ts` (MCP tool registration).

## Phase 4: Implementation (~Feb 12, 2026 morning)

The initial commit landed the **entire working server in one shot** — 13 files, 28,585 lines (mostly the bundled exercise catalog JSON). This was a single intensive Claude Code session where we built:

- The data preparation pipeline (`scripts/prepare-catalog.ts`)
- All 4 source files implementing the 5-tool MCP server
- 27 unit tests covering exercise catalog search and API payload construction
- README with setup instructions

The implementation had to solve several tricky problems:
- **Payload fidelity**: Each exercise in the API payload needs ~40 fields copied exactly from the catalog (animation IDs, media URLs, muscle relevance arrays) plus user overrides merged on top
- **Enum resolution**: Translating between numeric codes and human-readable text for muscles, body parts, and equipment — needed both directions
- **The calculate-then-add flow**: First POST to `/calculate` to get metrics, then POST to `/add` with enriched payload

## Phase 5: UAT and Bug Fix (~Feb 12, 2026 morning/afternoon)

We immediately tested the MCP server by adding it to Claude Code and running through the full flow. UAT findings:

> "All the tools work except for `list_workouts`."

The bug: the code expected `data.list` but the COROS API returns `data` as a direct array. The fix landed 46 minutes after the initial commit. We also addressed that `duration` is 0 for strength workouts, using `estimatedTime` as fallback.

## Phase 6: Claude Desktop Integration (~Feb 12 afternoon)

When we tried using it with Claude Desktop (the GUI app), we hit the classic problem: **Claude Desktop doesn't inherit shell PATH**, so Node.js installed via version managers (mise, nvm, fnm, volta) can't be found, causing `fetch is not defined` errors. We added troubleshooting docs with common node binary paths.

## Phase 7: Open-Sourcing (~Feb 12 afternoon)

Same day, we added:
- MIT License
- Unofficial project disclaimer to the README

Quick commits to prepare the project for sharing.

## Phase 8: Dynamic Catalog Updates (~Feb 13)

A day later, we added the `update_exercises` tool — a significant enhancement. Instead of only using the bundled static catalog, this tool:
1. Fetches the latest exercises from `POST /training/exercise/query`
2. Fetches fresh i18n strings from the COROS CDN
3. Rebuilds `data/exercises.json` on disk
4. Reloads the in-memory cache
5. Reports added/removed exercises and any i18n translation misses

This was motivated by the discovery that only ~100 of the 383 exercises had i18n coverage. The tool uses a fallback chain: i18n name -> existing catalog name -> raw code name.

## Phase 9: Documentation and YouTube (~Feb 13-14)

- YouTube walkthrough link added to README — we recorded a demo video
- `CLAUDE.md` added — making the project self-documenting for future Claude Code sessions

---

## The Pairing Dynamic

The project was a textbook example of human-AI pairing where each party played to their strengths:

- **Human** did the reverse engineering: DevTools network captures, extracting the i18n JS bundle, manually creating test workouts to capture payloads, UAT testing against the real API, recording the YouTube demo
- **Claude Code** handled the implementation heavy lifting: writing the TypeScript server, constructing the complex 40-field API payloads, building the search engine, writing tests, and iterating on bugs found during testing
- **Design decisions were collaborative**: the plan shows shared reasoning about architecture choices, referencing prior art (Garmin MCP, coros-connect) and community demand

The whole project went from first API capture (Jan 27) to published with YouTube walkthrough (Feb 13) — about 2.5 weeks, with the core implementation happening in a single intense day (Feb 12).
