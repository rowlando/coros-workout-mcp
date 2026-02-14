# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

MCP server that lets Claude design strength workouts and push them to a COROS watch via the reverse-engineered COROS Training Hub API. This is an unofficial project — the API is undocumented and may change without notice.

## Build & Test

```bash
npm install && npm run build   # TypeScript → dist/
npm test                       # vitest (unit tests only, no API calls)
npm run test:watch             # vitest watch mode
```

Build output goes to `dist/` via `tsc`. The server entry point is `dist/src/index.ts` (compiled to `dist/src/index.js`).

To run a single test file: `npx vitest run src/__tests__/exercise-catalog.test.ts`

## Architecture

**4 source files, clear separation:**

- `index.ts` — MCP server setup. Registers 6 tools (`authenticate_coros`, `check_coros_auth`, `search_exercises`, `create_workout`, `update_exercises`, `list_workouts`) using `@modelcontextprotocol/sdk`. STDIO transport only.
- `coros-api.ts` — COROS API client + payload construction. Handles auth (MD5 password hashing, token storage at `~/.config/coros-workout-mcp/auth.json`), and the workout creation flow: `resolveExercises()` → `calculateWorkout()` (POST `/training/program/calculate`) → `addWorkout()` (POST `/training/program/add`). Also contains `buildCatalogFromRaw()` for the `update_exercises` tool.
- `exercise-catalog.ts` — In-memory exercise search engine. Loads `data/exercises.json` lazily, provides `findByName()` (exact, case-insensitive), `searchExercises()` (fuzzy name + muscle/bodyPart/equipment filters). The catalog is the single source of truth for exercise names used in `create_workout`.
- `types.ts` — All interfaces and enum maps. Numeric code → human-readable name mappings for muscles, body parts, equipment. Key types: `CatalogExercise` (bundled catalog), `ExercisePayload` (API payload), `ExerciseOverrides` (user input), `RawExercise` (API response).

**Data flow for workout creation:**
User provides exercise names + overrides → `findByName()` validates against catalog → `buildExercisePayload()` merges catalog defaults with overrides → `buildWorkoutPayload()` wraps exercises → POST to `/calculate` for metrics → POST to `/add` to save.

## Key Conventions

- All exercises use numeric IDs internally (muscle, part, equipment, targetType, intensityType). The enum maps in `types.ts` handle code↔name translation.
- `targetType`: 2=duration (seconds), 3=reps. `intensityType`: 0=none, 1=weight (in grams internally, kg in user-facing API).
- Exercise names in `create_workout` must match `data/exercises.json` exactly (case-insensitive). The `search_exercises` tool helps users find correct names.
- API auth requires `accesstoken` header + `yfheader` JSON with `userId`. Logging in via API invalidates the COROS web app session.
- Base URLs: `teameuapi.coros.com` (EU), `teamapi.coros.com` (US). Region defaults to `eu`.
- `sportType: 4` = Strength Training throughout the codebase.

## Exercise Catalog

`data/exercises.json` contains ~383 exercises bundled with the server. The `update_exercises` tool refreshes it from the COROS API + i18n CDN strings. Name resolution order: i18n → existing catalog fallback → raw code name (e.g. "T1004"). Only ~100 exercises have i18n coverage.

## Reference Material

The parent repo (`../`) contains research files useful for debugging API issues: captured curl commands (`create-workout-request-all.txt`), raw API responses (`strength-exercises.json`), and extracted i18n strings (`en-US.prod.js`).
