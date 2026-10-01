import type { ActivityLapItem, ActivitySummary } from "./coros-api.js";
import { findByCodeName } from "./exercise-catalog.js";

// Activity sport types from /activity/query. These are a different numbering
// from the Training Hub `sportType` used for workout plans (4 = Strength).
export const SPORT_TYPE_NAMES: Record<number, string> = {
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

export function formatActivityDate(yyyymmdd: number): string {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * One list_activities entry. Includes labelId and sportType because
 * get_activity_detail needs both.
 */
export function formatActivity(a: ActivitySummary): string {
  const sport = SPORT_TYPE_NAMES[a.sportType] ?? `sport ${a.sportType}`;
  const metrics = [formatDuration(a.totalTime)];
  if (a.distance > 0) metrics.push(`${(a.distance / 1000).toFixed(2)} km`);
  if (a.calorie > 0) metrics.push(`${Math.round(a.calorie / 1000)} kcal`);
  if (a.avgHr > 0) metrics.push(`avgHR ${a.avgHr}`);
  if (a.trainingLoad > 0) metrics.push(`TL ${a.trainingLoad}`);
  return [
    `- **${a.name}** (${formatActivityDate(a.date)}, ${sport})`,
    `  ${metrics.join(", ")}`,
    `  labelId: ${a.labelId}, sportType: ${a.sportType}`,
  ].join("\n");
}

// --- Strength activity detail ---
//
// lapItemList rows for one exercise share an exerciseIndex and, in order, are:
//   mode 14  a working set: reps, weight (grams), time (centiseconds)
//   mode 15  rest after the preceding set: actualValue (centiseconds)
//   mode 16  exercise total (lapType 1): reps = total reps, weight = volume (grams)
//   mode 17  rest total, keyed by a generic "S…" rest exerciseNameKey
// Every row repeats the planned targetSets/targetType/targetValue.

const TARGET_DURATION = 2;
const TARGET_REPS = 3;

function formatSeconds(centiseconds: number): string {
  const s = centiseconds / 100;
  return s >= 60 ? formatDuration(Math.round(s)) : `${s.toFixed(1)}s`;
}

function formatKg(grams: number): string {
  return `${Number((grams / 1000).toFixed(2))}kg`;
}

function formatSet(set: ActivityLapItem, n: number, rest?: ActivityLapItem): string {
  const isDuration = set.targetType === TARGET_DURATION && set.reps === 0;
  let line = isDuration
    ? `Set ${n}: ${formatSeconds(set.time)}`
    : `Set ${n}: ${set.reps} reps`;
  if (set.weight > 0) line += ` @ ${formatKg(set.weight)}`;
  if (!isDuration) line += ` in ${formatSeconds(set.time)}`;
  if (rest) line += `, then ${formatSeconds(rest.actualValue)} rest`;
  return line;
}

function formatTarget(item: ActivityLapItem): string {
  if (item.targetSets <= 0 || item.targetValue <= 0) return "";
  if (item.targetType === TARGET_REPS) {
    return ` (target ${item.targetSets}×${item.targetValue} reps)`;
  }
  if (item.targetType === TARGET_DURATION) {
    return ` (target ${item.targetSets}×${item.targetValue}s)`;
  }
  return "";
}

/** Set-by-set breakdown of a strength activity's lapItemList. */
export function formatStrengthExercises(lapItems: ActivityLapItem[]): string {
  const byIndex = new Map<number, ActivityLapItem[]>();
  for (const item of lapItems) {
    if (item.exerciseNameKey.startsWith("S")) continue; // rest totals
    const group = byIndex.get(item.exerciseIndex) ?? [];
    group.push(item);
    byIndex.set(item.exerciseIndex, group);
  }

  const blocks: string[] = [];
  for (const idx of [...byIndex.keys()].sort((a, b) => a - b)) {
    const group = byIndex.get(idx)!;
    const sets: Array<{ set: ActivityLapItem; rest?: ActivityLapItem }> = [];
    for (const item of group) {
      if (item.mode === 14) sets.push({ set: item });
      else if (item.mode === 15 && sets.length > 0) sets[sets.length - 1].rest = item;
    }
    const total = group.find((it) => it.mode === 16);

    const key = group[0].exerciseNameKey;
    const name = findByCodeName(key)?.name ?? key;
    const lines = [`${idx}. ${name}${formatTarget(group[0])}`];
    sets.forEach(({ set, rest }, i) => lines.push(`   ${formatSet(set, i + 1, rest)}`));

    const totalReps = total?.reps ?? sets.reduce((sum, { set }) => sum + set.reps, 0);
    const totals = [`${sets.length} set${sets.length === 1 ? "" : "s"}`];
    if (totalReps > 0) totals.push(`${totalReps} reps`);
    if (total && total.weight > 0) totals.push(`${formatKg(total.weight)} volume`);
    lines.push(`   Total: ${totals.join(", ")}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}
