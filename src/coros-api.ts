import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type {
  AuthData,
  CatalogExercise,
  ExerciseOverrides,
  ExercisePayload,
  RawExercise,
  Region,
  WorkoutPayload,
} from "./types.js";
import {
  REGION_URLS,
  MuscleCode,
  PartCode,
  EquipmentCode,
} from "./types.js";
import { findByName } from "./exercise-catalog.js";

const CONFIG_DIR = resolve(homedir(), ".config", "coros-workout-mcp");
const AUTH_FILE = resolve(CONFIG_DIR, "auth.json");
const DEFAULT_SOURCE_URL =
  "https://d31oxp44ddzkyk.cloudfront.net/source/source_default/0/2fbd46e17bc54bc5873415c9fa767bdc.jpg";

// --- Auth ---

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export function storeAuth(auth: AuthData): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(AUTH_FILE, JSON.stringify(auth), { mode: 0o600 });
}

export function loadAuth(): AuthData | null {
  try {
    return JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export async function login(
  email: string,
  password: string,
  region: Region = "eu"
): Promise<AuthData> {
  const apiUrl = REGION_URLS[region];
  const res = await fetch(`${apiUrl}/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      account: email,
      accountType: 2,
      pwd: md5(password),
    }),
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(`COROS login failed: ${data.message || data.result}`);
  }

  const auth: AuthData = {
    accessToken: data.data.accessToken,
    userId: data.data.userId,
    region,
    timestamp: Date.now(),
  };
  storeAuth(auth);
  return auth;
}

/** Get valid auth from stored file or env vars */
export async function getValidAuth(): Promise<AuthData | null> {
  // Try stored auth first
  const stored = loadAuth();
  if (stored) return stored;

  // Try env vars
  const email = process.env.COROS_EMAIL;
  const password = process.env.COROS_PASSWORD;
  const region = (process.env.COROS_REGION as Region) || "eu";
  if (email && password) {
    return login(email, password, region);
  }

  return null;
}

// --- API helpers ---

function apiHeaders(auth: AuthData): Record<string, string> {
  return {
    "Content-Type": "application/json",
    accesstoken: auth.accessToken,
    yfheader: JSON.stringify({ userId: auth.userId }),
  };
}

async function apiPost(auth: AuthData, path: string, body: unknown): Promise<unknown> {
  const apiUrl = REGION_URLS[auth.region];
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: apiHeaders(auth),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(`COROS API error (${path}): ${data.message || data.result}`);
  }
  return data;
}

async function apiGet(
  auth: AuthData,
  path: string,
  params: Record<string, string | number> = {}
): Promise<unknown> {
  const apiUrl = REGION_URLS[auth.region];
  const url = new URL(`${apiUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: apiHeaders(auth),
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(`COROS API error (${path}): ${data.message || data.result}`);
  }
  return data;
}

/** Fetch the full exercise catalog from COROS API */
export async function queryExerciseCatalog(
  auth: AuthData,
  sportType: number = 4
): Promise<RawExercise[]> {
  const result = (await apiGet(auth, "/training/exercise/query", {
    userId: auth.userId,
    sportType,
  })) as { data: RawExercise[] };
  return result.data;
}

/** Fetch i18n strings from the COROS static CDN (no auth needed) */
export async function fetchI18nStrings(): Promise<Record<string, string>> {
  const url = "https://static.coros.com/locale/coros-traininghub-v2/en-US.prod.js";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch i18n strings: ${res.status} ${res.statusText}`);
  }
  let text = await res.text();
  // Strip "window.en_US=" prefix and trailing semicolon
  text = text.replace(/^window\.en_US\s*=\s*/, "").replace(/;\s*$/, "");
  return JSON.parse(text);
}

/**
 * Transform raw exercises + i18n map into CatalogExercise[].
 * Name resolution order: i18n[codeName] → existingCatalog[codeName].name → codeName
 * The i18n file only covers ~100 of ~383 exercises, so the existing catalog
 * provides names for exercises that predate the i18n system.
 */
export function buildCatalogFromRaw(
  rawExercises: RawExercise[],
  i18n: Record<string, string>,
  existingCatalog: CatalogExercise[] = []
): { catalog: CatalogExercise[]; i18nMisses: string[] } {
  const i18nMisses: string[] = [];
  const catalog: CatalogExercise[] = [];

  // Build lookup from existing catalog by codeName for fallback
  const existingByCode = new Map<string, CatalogExercise>();
  for (const e of existingCatalog) {
    existingByCode.set(e.codeName, e);
  }

  for (const r of rawExercises) {
    // Resolve human-readable name:
    // 1. i18n (code name key, e.g. "T1300" → "Weighted Jump Squats")
    // 2. Existing catalog entry (for older exercises without i18n)
    // 3. Fall back to raw code name
    let humanName = i18n[r.name];
    if (!humanName) {
      const existing = existingByCode.get(r.name);
      if (existing) {
        humanName = existing.name;
      } else {
        humanName = r.name;
        i18nMisses.push(r.name);
      }
    }

    // Resolve description from i18n
    const desc = i18n[r.name + "_desc"] || "";

    // Build text fields from numeric codes
    const muscle = r.muscle || [];
    const muscleRelevance = r.muscleRelevance || [];
    const part = r.part || [];
    const equipment = r.equipment || [];
    const primaryMuscle = muscle[0];
    const secondaryMuscles = muscleRelevance.filter((m) => m !== primaryMuscle);
    const muscleText = primaryMuscle
      ? (MuscleCode as Record<number, string>)[primaryMuscle] || String(primaryMuscle)
      : "";
    const secondaryMuscleText = secondaryMuscles
      .map((m) => (MuscleCode as Record<number, string>)[m] || String(m))
      .join(",");
    const partText = part
      .map((p) => (PartCode as Record<number, string>)[p] || String(p))
      .join(",");
    const equipmentText = equipment
      .map((e) => (EquipmentCode as Record<number, string>)[e] || String(e))
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
      desc,
    });
  }

  // Sort alphabetically by name
  catalog.sort((a, b) => a.name.localeCompare(b.name));

  return { catalog, i18nMisses };
}

// --- Payload construction ---

export function buildExercisePayload(
  exercise: CatalogExercise,
  sortNo: number,
  overrides: Partial<ExerciseOverrides> = {}
): ExercisePayload {
  const sets = overrides.sets ?? exercise.sets;
  let targetType = exercise.targetType;
  let targetValue = exercise.targetValue;
  if (overrides.reps !== undefined) {
    targetType = 3;
    targetValue = overrides.reps;
  } else if (overrides.duration !== undefined) {
    targetType = 2;
    targetValue = overrides.duration;
  }

  const restValue = overrides.restSeconds ?? exercise.restValue;

  let intensityType = exercise.intensityType;
  let intensityValue = exercise.intensityValue;
  if (overrides.weightGrams !== undefined) {
    intensityType = 1;
    intensityValue = overrides.weightGrams;
  } else if (overrides.weightKg !== undefined) {
    intensityType = 1;
    intensityValue = overrides.weightKg * 1000;
  }

  // Build text fields from codes
  const primaryMuscle = exercise.muscle[0];
  const secondaryMuscles = (exercise.muscleRelevance || []).filter(
    (m) => m !== primaryMuscle
  );
  const muscleText =
    exercise.muscleText ||
    (primaryMuscle
      ? (MuscleCode as Record<number, string>)[primaryMuscle] || ""
      : "");
  const secondaryMuscleText =
    exercise.secondaryMuscleText ||
    secondaryMuscles
      .map((m) => (MuscleCode as Record<number, string>)[m] || "")
      .filter(Boolean)
      .join(",");
  const partText =
    exercise.partText ||
    exercise.part
      .map((p) => (PartCode as Record<number, string>)[p] || "")
      .filter(Boolean)
      .join(",");
  const equipmentText =
    exercise.equipmentText ||
    exercise.equipment
      .map((e) => (EquipmentCode as Record<number, string>)[e] || "")
      .filter(Boolean)
      .join(",");

  return {
    access: 0,
    animationId: exercise.animationId ?? 0,
    coverUrlArrStr: exercise.coverUrlArrStr,
    createTimestamp: exercise.createTimestamp,
    defaultOrder: 0,
    equipment: exercise.equipment,
    exerciseType: exercise.exerciseType,
    id: sortNo, // sequential 1-based index used in API
    intensityCustom: 0,
    intensityType,
    intensityValue,
    isDefaultAdd: 0,
    isGroup: false,
    isIntensityPercent: false,
    muscle: exercise.muscle,
    muscleRelevance: exercise.muscleRelevance || [],
    name: exercise.codeName,
    overview: exercise.overview,
    part: exercise.part,
    restType: 1,
    restValue,
    sets,
    sortNo,
    sourceUrl: exercise.sourceUrl,
    sportType: 4,
    status: 1,
    targetType,
    targetValue,
    thumbnailUrl: exercise.thumbnailUrl,
    userId: 0,
    videoInfos: exercise.videoInfos,
    videoUrl: exercise.videoUrl,
    videoUrlArrStr: exercise.videoUrlArrStr,
    nameText: exercise.name,
    desc: exercise.desc,
    descText: exercise.desc,
    partText,
    muscleText,
    secondaryMuscleText,
    equipmentText,
    groupId: "",
    originId: exercise.id,
    targetDisplayUnit: 0,
    hrType: 0,
    intensityValueExtend: 0,
    intensityMultiplier: 0,
    intensityPercent: 0,
    intensityPercentExtend: 0,
    intensityDisplayUnit: "6",
  };
}

export function buildWorkoutPayload(
  name: string,
  overview: string,
  exercisePayloads: ExercisePayload[]
): WorkoutPayload {
  return {
    access: 1,
    authorId: "0",
    createTimestamp: 0,
    distance: 0,
    duration: 0,
    essence: 0,
    estimatedType: 0,
    estimatedValue: 0,
    exerciseNum: 0,
    exercises: exercisePayloads,
    headPic: "",
    id: "0",
    idInPlan: "0",
    name,
    nickname: "",
    originEssence: 0,
    overview,
    pbVersion: 2,
    planIdIndex: 0,
    poolLength: 2500,
    profile: "",
    referExercise: { intensityType: 1, hrType: 0, valueType: 1 },
    sex: 0,
    shareUrl: "",
    simple: false,
    sourceUrl: DEFAULT_SOURCE_URL,
    sportType: 4,
    star: 0,
    subType: 65535,
    targetType: 0,
    targetValue: 0,
    thirdPartyId: 0,
    totalSets: 0,
    trainingLoad: 0,
    type: 0,
    unit: 0,
    userId: "0",
    version: 0,
    videoCoverUrl: "",
    videoUrl: "",
    fastIntensityTypeName: "weight",
    poolLengthId: 1,
    poolLengthUnit: 2,
    sourceId: "425868133463670784",
  };
}

/** Resolve exercise overrides to catalog entries and build payloads */
export function resolveExercises(
  exercises: ExerciseOverrides[]
): ExercisePayload[] {
  return exercises.map((override, index) => {
    const catalog = findByName(override.name);
    if (!catalog) {
      throw new Error(`Exercise not found in catalog: "${override.name}"`);
    }
    return buildExercisePayload(catalog, index + 1, override);
  });
}

// --- Workout API ---

export interface CalculateResult {
  duration: number;
  totalSets: number;
  trainingLoad: number;
}

export async function calculateWorkout(
  auth: AuthData,
  name: string,
  overview: string,
  exercisePayloads: ExercisePayload[]
): Promise<CalculateResult> {
  const payload = buildWorkoutPayload(name, overview, exercisePayloads);
  const result = (await apiPost(auth, "/training/program/calculate", payload)) as {
    data: { duration: number; totalSets: number; trainingLoad: number };
  };
  return {
    duration: result.data.duration,
    totalSets: result.data.totalSets,
    trainingLoad: result.data.trainingLoad,
  };
}

export async function addWorkout(
  auth: AuthData,
  name: string,
  overview: string,
  exercisePayloads: ExercisePayload[],
  calculated: CalculateResult
): Promise<unknown> {
  const payload = buildWorkoutPayload(name, overview, exercisePayloads);
  // Apply calculated values
  payload.duration = calculated.duration;
  payload.totalSets = calculated.totalSets;
  payload.distance = "0"; // String in add (number in calculate)
  payload.sets = calculated.totalSets;
  payload.pitch = 0;
  return apiPost(auth, "/training/program/add", payload);
}

export interface QueryOptions {
  name?: string;
  sportType?: number;
  startNo?: number;
  limitSize?: number;
}

export async function queryWorkouts(
  auth: AuthData,
  options: QueryOptions = {}
): Promise<unknown> {
  const body = {
    name: options.name || "",
    supportRestExercise: 1,
    startNo: options.startNo ?? 0,
    limitSize: options.limitSize ?? 10,
    sportType: options.sportType ?? 0,
  };
  return apiPost(auth, "/training/program/query", body);
}

// --- Activities (completed workouts recorded by the watch) ---

export interface ActivitySummary {
  labelId: string;
  date: number;
  name: string;
  sportType: number;
  mode: number;
  subMode: number;
  startTime: number;
  endTime: number;
  totalTime: number;
  workoutTime: number;
  distance: number;
  calorie: number;
  avgHr: number;
  trainingLoad: number;
  device: string;
}

export interface ActivityQueryOptions {
  pageNumber?: number;
  size?: number;
  startDate?: number;
  endDate?: number;
}

/** Per-set/exercise item inside a strength activity's lapList. */
export interface ActivityLapItem {
  exerciseIndex: number;
  exerciseNameKey: string; // e.g. "T1065" or "S3618" (rest)
  exerciseType: number;
  reps: number;
  sets: number;
  intensityType: number;
  // intensityValue: workout-template default weight in grams. NOT the actual
  // weight lifted on a given set — for that, use `weight` on per-set items.
  intensityValue: number;
  // Per-set: actual weight lifted in grams. On rollup items (mode 16/17),
  // this is total volume (Σ kg×reps × 1000), not per-set.
  weight: number;
  // mode 14 = working set, 15 = rest between sets, 16 = exercise rollup,
  // 17 = rest-period rollup. lapType 1 also marks rollups.
  mode: number;
  lapType: number;
  actualValue: number; // varies by exerciseType: reps for rep sets, ms for rest/duration
  totalLength: number; // duration in ms for time-based items
  time: number;
  avgHr: number;
  maxHr: number;
  minHr: number;
  calories: number; // kcal × 1000 (matches list endpoint convention)
  startTimestamp: number;
  endTimestamp: number;
  targetSets: number;
  targetType: number;
  targetValue: number;
}

export interface ActivityDetail {
  summary: Record<string, unknown>;
  lapList: Array<{
    type: number;
    lapDistance: number;
    lapItemList: ActivityLapItem[];
  }>;
  muscleList: Array<{
    muscleId: number;
    muscleKey: string;
    sets: number;
    reps: number;
    duration: number;
    level: number;
    muscleType: number;
  }>;
  [k: string]: unknown;
}

/**
 * Fetch the full details of a single recorded activity, including per-exercise
 * sets, reps, weights and rest periods. The COROS web app calls this with
 * POST + empty body and the parameters in the query string.
 */
export async function queryActivityDetail(
  auth: AuthData,
  labelId: string,
  sportType: number,
  screenW = 565,
  screenH = 982
): Promise<ActivityDetail> {
  const apiUrl = REGION_URLS[auth.region];
  const url = new URL(`${apiUrl}/activity/detail/query`);
  url.searchParams.set("screenW", String(screenW));
  url.searchParams.set("screenH", String(screenH));
  url.searchParams.set("labelId", labelId);
  url.searchParams.set("sportType", String(sportType));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      accesstoken: auth.accessToken,
      yfheader: JSON.stringify({ userId: auth.userId }),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": "0",
    },
  });
  const data = await res.json();
  if (data.result !== "0000") {
    throw new Error(
      `COROS API error (/activity/detail/query): ${data.message || data.result}`
    );
  }
  return data.data as ActivityDetail;
}

export async function queryActivities(
  auth: AuthData,
  options: ActivityQueryOptions = {}
): Promise<{ count: number; dataList: ActivitySummary[] }> {
  // startDate/endDate are passed through but the COROS endpoint appears to
  // ignore them, so we also filter client-side after the response.
  const params: Record<string, string | number> = {
    pageNumber: options.pageNumber ?? 1,
    size: options.size ?? 20,
  };
  if (options.startDate !== undefined) params.startDate = options.startDate;
  if (options.endDate !== undefined) params.endDate = options.endDate;
  const result = (await apiGet(auth, "/activity/query", params)) as {
    data: { count: number; dataList?: ActivitySummary[] };
  };
  let dataList = result.data.dataList ?? [];
  if (options.startDate !== undefined) {
    const s = options.startDate;
    dataList = dataList.filter((a) => a.date >= s);
  }
  if (options.endDate !== undefined) {
    const e = options.endDate;
    dataList = dataList.filter((a) => a.date <= e);
  }
  return {
    count: result.data.count,
    dataList,
  };
}
