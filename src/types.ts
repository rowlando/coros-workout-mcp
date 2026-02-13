// Enum maps derived from COROS API payloads and i18n strings

export const MuscleCode = {
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
} as const;

export const PartCode = {
  0: "Whole Body",
  2: "Chest",
  3: "Back",
  4: "Shoulders",
  5: "Legs/Hips",
  6: "Arms",
  7: "Core",
} as const;

export const EquipmentCode = {
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
} as const;

export const TargetTypeCode = {
  1: "time",
  2: "duration",
  3: "reps",
} as const;

export const IntensityTypeCode = {
  0: "none",
  1: "weight",
} as const;

// Reverse maps: name -> code
export const MuscleNameToCode: Record<string, number> = {};
for (const [code, name] of Object.entries(MuscleCode)) {
  MuscleNameToCode[name.toLowerCase()] = Number(code);
}

export const PartNameToCode: Record<string, number> = {};
for (const [code, name] of Object.entries(PartCode)) {
  PartNameToCode[name.toLowerCase()] = Number(code);
}

export const EquipmentNameToCode: Record<string, number> = {};
for (const [code, name] of Object.entries(EquipmentCode)) {
  EquipmentNameToCode[name.toLowerCase()] = Number(code);
}

// Exercise as stored in the bundled catalog (merged from raw + clean)
export interface CatalogExercise {
  id: string;
  name: string; // Human-readable name (from clean data)
  codeName: string; // Internal code e.g. "T1004"
  overview: string; // i18n key e.g. "sid_strength_push_ups"
  animationId: number;
  muscle: number[];
  muscleRelevance: number[];
  part: number[];
  equipment: number[];
  exerciseType: number;
  targetType: number;
  targetValue: number;
  intensityType: number;
  intensityValue: number;
  restType: number;
  restValue: number;
  sets: number;
  sortNo: number;
  sportType: number;
  status: number;
  createTimestamp: number;
  thumbnailUrl: string;
  sourceUrl: string;
  videoUrl: string;
  coverUrlArrStr: string;
  videoUrlArrStr: string;
  videoInfos: VideoInfo[];
  // Human-readable text fields
  muscleText: string;
  secondaryMuscleText: string;
  partText: string;
  equipmentText: string;
  desc: string;
}

export interface VideoInfo {
  coverUrl: string;
  videoUrl: string;
}

// What the user provides per exercise when creating a workout
export interface ExerciseOverrides {
  name: string; // Exercise name to look up in catalog
  sets?: number;
  reps?: number; // Sets targetType=3, targetValue=reps
  duration?: number; // Sets targetType=2, targetValue=duration (seconds)
  restSeconds?: number; // Rest between sets
  weightGrams?: number; // Sets intensityType=1, intensityValue=weightGrams
  weightKg?: number; // Convenience: converted to grams
}

// Full exercise payload as sent to the COROS API
export interface ExercisePayload {
  access: number;
  animationId: number;
  coverUrlArrStr: string;
  createTimestamp: number;
  defaultOrder: number;
  equipment: number[];
  exerciseType: number;
  id: number;
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
  thumbnailUrl: string;
  userId: number;
  videoInfos: VideoInfo[];
  videoUrl: string;
  videoUrlArrStr: string;
  nameText: string;
  desc: string;
  descText: string;
  partText: string;
  muscleText: string;
  secondaryMuscleText: string;
  equipmentText: string;
  groupId: string;
  originId: string;
  targetDisplayUnit: number;
  hrType: number;
  intensityValueExtend: number;
  intensityMultiplier: number;
  intensityPercent: number;
  intensityPercentExtend: number;
  intensityDisplayUnit: string;
}

// Workout payload sent to calculate and add endpoints
export interface WorkoutPayload {
  access: number;
  authorId: string;
  createTimestamp: number;
  distance: number | string;
  duration: number;
  essence: number;
  estimatedType: number;
  estimatedValue: number;
  exerciseNum: number;
  exercises: ExercisePayload[];
  headPic: string;
  id: string;
  idInPlan: string;
  name: string;
  nickname: string;
  originEssence: number;
  overview: string;
  pbVersion: number;
  planIdIndex: number;
  poolLength: number;
  profile: string;
  referExercise: { intensityType: number; hrType: number; valueType: number };
  sex: number;
  shareUrl: string;
  simple: boolean;
  sourceUrl: string;
  sportType: number;
  star: number;
  subType: number;
  targetType: number;
  targetValue: number;
  thirdPartyId: number;
  totalSets: number;
  trainingLoad: number;
  type: number;
  unit: number;
  userId: string;
  version: number;
  videoCoverUrl: string;
  videoUrl: string;
  fastIntensityTypeName: string;
  poolLengthId: number;
  poolLengthUnit: number;
  sourceId: string;
  sets?: number;
  pitch?: number;
}

// Raw exercise as returned by the COROS /training/exercise/query API
export interface RawExercise {
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
  videoInfos: VideoInfo[];
  videoUrl: string;
  videoUrlArrStr: string;
}

// Auth token stored on disk
export interface AuthData {
  accessToken: string;
  userId: string;
  region: "us" | "eu";
  timestamp: number;
}

export const REGION_URLS = {
  us: "https://teamapi.coros.com",
  eu: "https://teameuapi.coros.com",
} as const;

export type Region = keyof typeof REGION_URLS;
