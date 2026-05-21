#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync } from "node:fs";
import {
  login,
  getValidAuth,
  loadAuth,
  resolveExercises,
  calculateWorkout,
  addWorkout,
  queryWorkouts,
  queryActivities,
  queryActivityDetail,
  queryExerciseCatalog,
  fetchI18nStrings,
  buildCatalogFromRaw,
} from "./coros-api.js";
import type { ActivityLapItem } from "./coros-api.js";
import {
  searchExercises,
  findByName,
  findByCodeName,
  getAllExercises,
  reloadCatalog,
  getCatalogPath,
} from "./exercise-catalog.js";
import type { Region } from "./types.js";

const server = new McpServer({
  name: "coros-workout",
  version: "1.0.0",
});

// --- Tool: authenticate_coros ---
server.tool(
  "authenticate_coros",
  "Log in to COROS Training Hub. Stores auth token for subsequent calls. Also checks COROS_EMAIL/COROS_PASSWORD env vars for auto-login. WARNING: Logging in via API invalidates the web app session.",
  {
    email: z.string().email().optional().describe("COROS account email (optional if env vars set)"),
    password: z.string().optional().describe("COROS account password (optional if env vars set)"),
    region: z.enum(["us", "eu"]).default("eu").describe("API region: 'us' or 'eu'"),
  },
  async ({ email, password, region }) => {
    try {
      // Use provided credentials or fall back to env vars
      const loginEmail = email || process.env.COROS_EMAIL;
      const loginPassword = password || process.env.COROS_PASSWORD;
      const loginRegion = (region || process.env.COROS_REGION || "eu") as Region;

      if (!loginEmail || !loginPassword) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No credentials provided. Set COROS_EMAIL and COROS_PASSWORD environment variables, or provide email and password parameters.",
            },
          ],
        };
      }

      const auth = await login(loginEmail, loginPassword, loginRegion);
      return {
        content: [
          {
            type: "text" as const,
            text: `Authenticated successfully. User ID: ${auth.userId}, Region: ${auth.region}. Token stored at ~/.coros-workout-mcp/auth.json`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: check_coros_auth ---
server.tool(
  "check_coros_auth",
  "Check if COROS authentication is available (from stored token or env vars).",
  {},
  async () => {
    const auth = await getValidAuth();
    if (auth) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Authenticated. User ID: ${auth.userId}, Region: ${auth.region}`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: "Not authenticated. Use authenticate_coros tool or set COROS_EMAIL/COROS_PASSWORD env vars.",
        },
      ],
    };
  }
);

// --- Tool: search_exercises ---
server.tool(
  "search_exercises",
  "Search the COROS exercise catalog (~383 strength exercises). Filter by name, muscle group, body part, and/or equipment. Returns exercise names, muscles, equipment, and default sets/reps.",
  {
    query: z.string().optional().describe("Search by exercise name (partial match, e.g. 'bench press')"),
    muscle: z.string().optional().describe("Filter by muscle group (e.g. 'chest', 'biceps', 'glutes', 'quadriceps')"),
    bodyPart: z.string().optional().describe("Filter by body part (e.g. 'legs', 'arms', 'core', 'chest', 'back', 'shoulders')"),
    equipment: z.string().optional().describe("Filter by equipment (e.g. 'bodyweight', 'dumbbells', 'barbells', 'kettlebell', 'bands')"),
    limit: z.number().int().min(1).max(50).default(20).describe("Max results to return"),
  },
  async ({ query, muscle, bodyPart, equipment, limit }) => {
    const results = searchExercises({ query, muscle, bodyPart, equipment });
    const limited = results.slice(0, limit);

    if (limited.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No exercises found matching your search criteria.",
          },
        ],
      };
    }

    const formatted = limited.map((e) => {
      const lines = [
        `**${e.name}**`,
        `  Muscles: ${e.muscleText}${e.secondaryMuscleText ? ` (secondary: ${e.secondaryMuscleText})` : ""}`,
        `  Body parts: ${e.partText}`,
        `  Equipment: ${e.equipmentText}`,
        `  Defaults: ${e.sets} sets x ${e.targetValue} ${e.targetType === 3 ? "reps" : "seconds"}, ${e.restValue}s rest`,
      ];
      return lines.join("\n");
    });

    const header = `Found ${results.length} exercises${results.length > limit ? ` (showing first ${limit})` : ""}:\n`;
    return {
      content: [
        {
          type: "text" as const,
          text: header + formatted.join("\n\n"),
        },
      ],
    };
  }
);

// --- Tool: create_workout ---
const ExerciseInputSchema = z.object({
  name: z.string().describe("Exercise name (must match catalog exactly, e.g. 'Push-ups', 'Squats')"),
  sets: z.number().int().min(1).optional().describe("Number of sets (defaults to catalog value)"),
  reps: z.number().int().min(1).optional().describe("Reps per set (defaults to catalog value)"),
  duration: z.number().int().min(1).optional().describe("Duration in seconds per set (alternative to reps)"),
  restSeconds: z.number().int().min(0).optional().describe("Rest between sets in seconds (defaults to catalog value)"),
  weightKg: z.number().min(0).optional().describe("Weight in kg (e.g. 20 for 20kg)"),
});

server.tool(
  "create_workout",
  "Create a strength workout on COROS Training Hub. Resolves exercise names from the catalog, builds the full API payload, calculates metrics, and saves the workout. The workout will sync to the user's COROS watch.",
  {
    name: z.string().describe("Workout name (e.g. 'Upper Body Push')"),
    overview: z.string().default("").describe("Workout description"),
    exercises: z.array(ExerciseInputSchema).min(1).describe("Array of exercises with optional overrides"),
  },
  async ({ name, overview, exercises }) => {
    try {
      const auth = await getValidAuth();
      if (!auth) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Use authenticate_coros first.",
            },
          ],
          isError: true,
        };
      }

      // Validate all exercise names first
      const missing: string[] = [];
      for (const ex of exercises) {
        if (!findByName(ex.name)) {
          missing.push(ex.name);
        }
      }
      if (missing.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Exercises not found in catalog: ${missing.map((n) => `"${n}"`).join(", ")}. Use search_exercises to find the correct names.`,
            },
          ],
          isError: true,
        };
      }

      // Build payloads
      const exercisePayloads = resolveExercises(exercises);

      // Calculate metrics
      const calculated = await calculateWorkout(
        auth,
        name,
        overview,
        exercisePayloads
      );

      // Create the workout
      await addWorkout(auth, name, overview, exercisePayloads, calculated);

      const totalSets = exercises.reduce(
        (sum, ex) => sum + (ex.sets ?? findByName(ex.name)!.sets),
        0
      );
      const exerciseSummary = exercises
        .map((ex) => {
          const catalog = findByName(ex.name)!;
          const sets = ex.sets ?? catalog.sets;
          const target = ex.reps ?? ex.duration ?? catalog.targetValue;
          const unit = (ex.reps || (!ex.duration && catalog.targetType === 3)) ? "reps" : "s";
          const weight = ex.weightKg ? ` @ ${ex.weightKg}kg` : "";
          return `  ${ex.name}: ${sets}x${target}${unit}${weight}`;
        })
        .join("\n");

      const durationMin = Math.round(calculated.duration / 60);

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Workout "${name}" created successfully!`,
              `Duration: ~${durationMin} min | Sets: ${calculated.totalSets} | Training load: ${calculated.trainingLoad}`,
              ``,
              `Exercises:`,
              exerciseSummary,
              ``,
              `The workout will sync to your COROS watch.`,
            ].join("\n"),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to create workout: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: update_exercises ---
server.tool(
  "update_exercises",
  "Fetch the latest exercise catalog from COROS APIs and rebuild the local catalog. Requires authentication. Fetches exercises from the COROS API and i18n strings for human-readable names.",
  {
    sportType: z
      .number()
      .int()
      .default(4)
      .describe("Sport type to fetch exercises for (default 4 = strength)"),
  },
  async ({ sportType }) => {
    try {
      const auth = await getValidAuth();
      if (!auth) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Use authenticate_coros first.",
            },
          ],
          isError: true,
        };
      }

      // Get current catalog for comparison and as fallback for names
      let oldExercises: ReturnType<typeof getAllExercises> = [];
      let oldNames: Set<string>;
      try {
        oldExercises = getAllExercises();
        oldNames = new Set(oldExercises.map((e) => e.name));
      } catch {
        oldNames = new Set();
      }

      // Fetch exercises and i18n in parallel
      const [rawExercises, i18n] = await Promise.all([
        queryExerciseCatalog(auth, sportType),
        fetchI18nStrings(),
      ]);

      // Build catalog (pass existing catalog for name fallback)
      const { catalog, i18nMisses } = buildCatalogFromRaw(
        rawExercises,
        i18n,
        oldExercises
      );

      // Compare with old catalog
      const newNames = new Set(catalog.map((e) => e.name));
      const added = [...newNames].filter((n) => !oldNames.has(n));
      const removed = [...oldNames].filter((n) => !newNames.has(n));

      // Write to disk
      const catalogPath = getCatalogPath();
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));

      // Reload in-memory cache
      reloadCatalog();

      // Build summary
      const lines = [
        `Exercise catalog updated successfully.`,
        `Total exercises: ${catalog.length}`,
      ];
      if (added.length > 0) {
        lines.push(`New exercises (${added.length}): ${added.join(", ")}`);
      }
      if (removed.length > 0) {
        lines.push(
          `Removed exercises (${removed.length}): ${removed.join(", ")}`
        );
      }
      if (added.length === 0 && removed.length === 0) {
        lines.push("No changes in exercise list.");
      }
      if (i18nMisses.length > 0) {
        lines.push(
          `i18n misses (${i18nMisses.length}): ${i18nMisses.slice(0, 10).join(", ")}${i18nMisses.length > 10 ? "..." : ""}`
        );
      }
      lines.push(`Catalog written to: ${catalogPath}`);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to update exercises: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: list_workouts ---
server.tool(
  "list_workouts",
  "List workouts from COROS Training Hub.",
  {
    name: z.string().default("").describe("Filter by workout name (optional)"),
    sportType: z.number().int().default(0).describe("Filter by sport type (0=all, 4=strength)"),
    limit: z.number().int().min(1).max(50).default(10).describe("Number of workouts to return"),
  },
  async ({ name, sportType, limit }) => {
    try {
      const auth = await getValidAuth();
      if (!auth) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Use authenticate_coros first.",
            },
          ],
          isError: true,
        };
      }

      const result = (await queryWorkouts(auth, {
        name,
        sportType,
        limitSize: limit,
      })) as { data: Array<{ name: string; overview: string; sportType: number; duration: number; totalSets: number; exerciseNum: number; estimatedTime: number }> };

      const workouts = result.data || [];
      if (workouts.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No workouts found.",
            },
          ],
        };
      }

      const formatted = workouts
        .map((w) => {
          const durationMin = Math.round((w.estimatedTime || w.duration || 0) / 60);
          return `- **${w.name}** (${durationMin} min, ${w.totalSets || 0} sets, ${w.exerciseNum || 0} exercises)${w.overview ? `\n  ${w.overview}` : ""}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${workouts.length} workout(s):\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to list workouts: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: list_activities ---
const SPORT_TYPE_NAMES: Record<number, string> = {
  100: "Run",
  101: "Indoor Run",
  102: "Trail Run",
  200: "Cycling",
  201: "Indoor Cycling",
  300: "Pool Swim",
  301: "Open Water Swim",
  400: "Multi-Sport",
  401: "Triathlon",
  402: "Strength",
  403: "Cardio",
  404: "GPS Cardio",
  500: "Hike",
  600: "Ski",
  700: "Indoor Walk",
  701: "Indoor Rower",
};

function formatActivityDate(yyyymmdd: number): string {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

server.tool(
  "list_activities",
  "List actual completed activities recorded by the COROS watch (runs, swims, strength sessions, etc.). Use startDate/endDate (YYYYMMDD integers) to filter by date range.",
  {
    startDate: z
      .number()
      .int()
      .optional()
      .describe("Start date as YYYYMMDD integer (e.g. 20260518)"),
    endDate: z
      .number()
      .int()
      .optional()
      .describe("End date as YYYYMMDD integer (e.g. 20260524)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of activities to return"),
    pageNumber: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Page number for pagination"),
  },
  async ({ startDate, endDate, limit, pageNumber }) => {
    try {
      const auth = await getValidAuth();
      if (!auth) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Use authenticate_coros first.",
            },
          ],
          isError: true,
        };
      }

      const { count, dataList } = await queryActivities(auth, {
        pageNumber,
        size: limit,
        startDate,
        endDate,
      });

      if (dataList.length === 0) {
        return {
          content: [
            { type: "text" as const, text: "No activities found." },
          ],
        };
      }

      const formatted = dataList
        .map((a) => {
          const sport =
            SPORT_TYPE_NAMES[a.sportType] ?? `sport ${a.sportType}`;
          const parts = [
            `- **${a.name}** (${formatActivityDate(a.date)}, ${sport})`,
            `  ${formatDuration(a.totalTime)}`,
          ];
          if (a.distance > 0) {
            parts[1] += `, ${(a.distance / 1000).toFixed(2)} km`;
          }
          if (a.calorie > 0) {
            parts[1] += `, ${Math.round(a.calorie / 1000)} kcal`;
          }
          if (a.avgHr > 0) parts[1] += `, avgHR ${a.avgHr}`;
          if (a.trainingLoad > 0) parts[1] += `, TL ${a.trainingLoad}`;
          return parts.join("\n");
        })
        .join("\n");

      const header = `Found ${dataList.length} activit${dataList.length === 1 ? "y" : "ies"} (total available: ${count}):\n\n`;
      return {
        content: [{ type: "text" as const, text: header + formatted }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to list activities: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: get_activity_detail ---
// Group consecutive lapItems sharing the same exerciseNameKey (and skip rest items).
//
// Each exercise group contains:
//   - Per-set entries (mode 14) with the actual weight in `weight` (grams)
//     — these may differ across sets (warmups, ramping, etc.).
//   - Optional rest entries (mode 15) interleaved with sets.
//   - A rollup entry (mode 16, lapType 1) with `sets`, `reps` totals.
//     Its `weight` field is total volume (Σ kg×reps × 1000), not per-set.
//     Its `intensityValue` is the workout-template default, NOT the lifted weight.
//   - A rest-rollup entry (mode 17, exerciseNameKey starting "S").
function summarizeStrengthActivity(lapItems: ActivityLapItem[]): string {
  const byIndex = new Map<number, ActivityLapItem[]>();
  for (const item of lapItems) {
    if (!byIndex.has(item.exerciseIndex)) byIndex.set(item.exerciseIndex, []);
    byIndex.get(item.exerciseIndex)!.push(item);
  }

  const lines: string[] = [];
  const sortedIndexes = [...byIndex.keys()].sort((a, b) => a - b);
  for (const idx of sortedIndexes) {
    const group = byIndex.get(idx)!;
    const nonRest = group.filter((it) => !it.exerciseNameKey.startsWith("S"));
    const rollup = nonRest.find((it) => it.mode === 16) ?? nonRest[nonRest.length - 1];
    if (!rollup) continue;

    const workingSets = nonRest.filter((it) => it.mode === 14);
    const setCount = rollup.sets || workingSets.length;
    const repCount = rollup.reps;
    const repsPerSet = setCount > 0 && repCount > 0
      ? Math.round(repCount / setCount)
      : repCount;

    // Build weight string from per-set `weight` (grams). Group consecutive
    // identical values: "60kg×3" or "40/80/100kg" when sets ramp.
    const weightsKg = workingSets
      .map((s) => s.weight / 1000)
      .filter((w) => w > 0);
    let weightStr = "";
    if (weightsKg.length > 0) {
      const allSame = weightsKg.every((w) => w === weightsKg[0]);
      weightStr = allSame
        ? ` @ ${weightsKg[0]}kg`
        : ` @ ${weightsKg.map((w) => `${w}kg`).join("/")}`;
    }

    const catalog = findByCodeName(rollup.exerciseNameKey);
    const name = catalog?.name ?? rollup.exerciseNameKey;
    const detail = setCount > 0 && repCount > 0
      ? `${setCount}×${repsPerSet} (${repCount} reps total)`
      : repCount > 0
        ? `${repCount} reps`
        : `${(rollup.totalLength / 1000).toFixed(0)}s`;
    lines.push(`  ${idx}. ${name} — ${detail}${weightStr}`);
  }
  return lines.join("\n");
}

server.tool(
  "get_activity_detail",
  "Get per-exercise breakdown for a recorded strength activity (sets, reps, weight). Pass the labelId from list_activities; sportType also from list_activities (typically 402 for Strength).",
  {
    labelId: z
      .string()
      .describe("Activity labelId from list_activities (e.g. '477574221250199560')"),
    sportType: z
      .number()
      .int()
      .default(402)
      .describe("Sport type from list_activities (402 = Strength)"),
  },
  async ({ labelId, sportType }) => {
    try {
      const auth = await getValidAuth();
      if (!auth) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Not authenticated. Use authenticate_coros first.",
            },
          ],
          isError: true,
        };
      }

      const detail = await queryActivityDetail(auth, labelId, sportType);
      const lapItems = detail.lapList?.[0]?.lapItemList ?? [];
      if (lapItems.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No exercise data found for this activity.",
            },
          ],
        };
      }

      const summary = (detail.summary ?? {}) as Record<string, number>;
      const totalSets = summary.sets ?? 0;
      const totalReps = summary.totalReps ?? 0;
      // detail endpoint reports totalTime in centiseconds (1/100s),
      // unlike the list endpoint which uses seconds.
      const durationSec = Math.round((summary.totalTime ?? 0) / 100);
      const calories = summary.calories ?? 0; // kcal × 1000
      const avgHr = summary.avgHr ?? 0;
      const trainingLoad = summary.trainingLoad ?? 0;

      const exerciseSummary = summarizeStrengthActivity(lapItems);

      const header = [
        `Activity ${labelId}:`,
        `  Duration: ${formatDuration(durationSec)}, ${Math.round(calories / 1000)} kcal, avgHR ${avgHr}, TL ${trainingLoad}`,
        `  Total: ${totalSets} sets, ${totalReps} reps`,
        ``,
        `Exercises:`,
      ].join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: header + "\n" + exerciseSummary,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Failed to get activity detail: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
