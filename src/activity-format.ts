import type { ActivitySummary } from "./coros-api.js";

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
