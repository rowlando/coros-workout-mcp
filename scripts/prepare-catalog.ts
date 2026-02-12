/**
 * Merges strength-exercises.json (raw API data) with exercises-clean.json (human names)
 * to produce data/exercises.json — the bundled catalog used by the MCP server.
 *
 * Matching strategy:
 * 1. By thumbnailUrl → clean thumbnail (matches 373 of 383)
 * 2. By raw exercise name → clean name (matches 6 newer exercises with no thumbnail)
 * 3. By overview sid → clean name for 4 special entries (Warm Up, Training, Cool Down, Rest)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PARENT = resolve(ROOT, "..");

interface RawExercise {
  access: number;
  animationId: number;
  coverUrlArrStr: string;
  createTimestamp: number;
  defaultOrder: number;
  equipment: number[];
  exerciseType: number;
  id: string;
  intensityCustom: number;
  intensityType: number;
  intensityValue: number;
  isDefaultAdd: number;
  isGroup: boolean;
  isIntensityPercent: boolean;
  muscle: number[];
  muscleRelevance: number[];
  name: string;
  overview: string;
  part: number[];
  restType: number;
  restValue: number;
  sets: number;
  sortNo: number;
  sourceUrl: string;
  sportType: number;
  status: number;
  targetType: number;
  targetValue: number;
  thumbnailUrl?: string;
  userId: number;
  videoInfos: { coverUrl: string; videoUrl: string }[];
  videoUrl: string;
  videoUrlArrStr: string;
}

interface CleanExercise {
  name: string;
  body_parts: string[];
  muscles: string[];
  equipment: string[];
  thumbnail: string;
  video: string;
}

// Map overview sids to human names for the 4 special entries
const SID_NAME_MAP: Record<string, string> = {
  sid_strength_warm_up: "Warm Up",
  sid_strength_training: "Training",
  sid_strength_cool_down: "Cool Down",
  sid_strength_rest: "Rest",
};

const MuscleCode: Record<number, string> = {
  1: "Deltoids",
  2: "Chest",
  3: "Latissimus Dorsi",
  4: "Triceps",
  5: "Abs",
  6: "Lower Back",
  7: "Glutes",
  8: "Quadriceps",
  9: "Obliques",
  10: "Trapezius",
  11: "Forearms",
  12: "Biceps",
  13: "Calves",
  14: "Posterior Thigh",
  15: "Hip Flexors",
};

const PartCode: Record<number, string> = {
  0: "Whole Body",
  2: "Chest",
  3: "Back",
  4: "Shoulders",
  5: "Legs/Hips",
  6: "Arms",
  7: "Core",
};

const EquipmentCode: Record<number, string> = {
  1: "Bodyweight",
  2: "Dumbbells",
  3: "Barbells",
  4: "Bands",
  5: "Bosu Ball",
  6: "Gym Equipment",
  7: "Exercise Ball",
  8: "Foam Roller",
  9: "Medicine Ball",
  10: "Bench",
  11: "Kettlebell",
};

function main() {
  const rawData = JSON.parse(
    readFileSync(resolve(PARENT, "strength-exercises.json"), "utf-8")
  );
  const raw: RawExercise[] = rawData.data;

  const clean: CleanExercise[] = JSON.parse(
    readFileSync(resolve(PARENT, "exercises-clean.json"), "utf-8")
  );

  // Build lookup maps from clean data
  const cleanByThumb = new Map<string, CleanExercise>();
  const cleanByName = new Map<string, CleanExercise>();
  for (const c of clean) {
    if (c.thumbnail) {
      cleanByThumb.set(c.thumbnail, c);
    }
    cleanByName.set(c.name.trim().toLowerCase(), c);
  }

  const catalog = [];
  let matched = 0;
  let unmatched = 0;

  for (const r of raw) {
    let humanName: string | undefined;

    // Strategy 1: match by thumbnail
    if (r.thumbnailUrl && cleanByThumb.has(r.thumbnailUrl)) {
      humanName = cleanByThumb.get(r.thumbnailUrl)!.name;
    }

    // Strategy 2: match by name (for newer exercises)
    if (!humanName) {
      const cleanMatch = cleanByName.get(r.name.trim().toLowerCase());
      if (cleanMatch) {
        humanName = cleanMatch.name;
      }
    }

    // Strategy 3: match by overview sid (for special entries)
    if (!humanName && SID_NAME_MAP[r.overview]) {
      humanName = SID_NAME_MAP[r.overview];
    }

    if (!humanName) {
      console.warn(`No match for: id=${r.id}, name=${r.name}, overview=${r.overview}`);
      unmatched++;
      continue;
    }

    matched++;

    // Build muscle/part/equipment text from codes (some fields may be missing)
    const muscle = r.muscle || [];
    const muscleRelevance = r.muscleRelevance || [];
    const part = r.part || [];
    const equipment = r.equipment || [];
    const primaryMuscle = muscle[0];
    const secondaryMuscles = muscleRelevance.filter((m) => m !== primaryMuscle);
    const muscleText = primaryMuscle ? MuscleCode[primaryMuscle] || String(primaryMuscle) : "";
    const secondaryMuscleText = secondaryMuscles
      .map((m) => MuscleCode[m] || String(m))
      .join(",");
    const partText = part.map((p) => PartCode[p] || String(p)).join(",");
    const equipmentText = equipment
      .map((e) => EquipmentCode[e] || String(e))
      .join(",");

    catalog.push({
      id: r.id,
      name: humanName.trim(),
      codeName: r.name,
      overview: r.overview,
      animationId: r.animationId,
      muscle,
      muscleRelevance,
      part,
      equipment,
      exerciseType: r.exerciseType,
      targetType: r.targetType,
      targetValue: r.targetValue,
      intensityType: r.intensityType,
      intensityValue: r.intensityValue,
      restType: r.restType,
      restValue: r.restValue,
      sets: r.sets,
      sortNo: r.sortNo,
      sportType: r.sportType,
      status: r.status,
      createTimestamp: r.createTimestamp,
      thumbnailUrl: r.thumbnailUrl || "",
      sourceUrl: r.sourceUrl,
      videoUrl: r.videoUrl,
      coverUrlArrStr: r.coverUrlArrStr,
      videoUrlArrStr: r.videoUrlArrStr,
      videoInfos: r.videoInfos,
      muscleText,
      secondaryMuscleText,
      partText,
      equipmentText,
      desc: "",
    });
  }

  // Sort by name for easy browsing
  catalog.sort((a, b) => a.name.localeCompare(b.name));

  mkdirSync(resolve(ROOT, "data"), { recursive: true });
  writeFileSync(
    resolve(ROOT, "data", "exercises.json"),
    JSON.stringify(catalog, null, 2)
  );

  console.log(`Catalog written: ${matched} exercises (${unmatched} unmatched)`);
}

main();
