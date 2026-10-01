import { describe, it, expect } from "vitest";
import { formatStrengthExercises } from "../activity-format.js";
import type { ActivityLapItem } from "../coros-api.js";
import { findByCodeName } from "../exercise-catalog.js";

type Row = Partial<ActivityLapItem> &
  Pick<ActivityLapItem, "exerciseIndex" | "exerciseNameKey" | "mode">;

function row(r: Row): ActivityLapItem {
  return {
    exerciseType: 0,
    reps: 0,
    sets: 0,
    intensityType: 1,
    intensityValue: 0,
    weight: 0,
    lapType: 0,
    actualValue: 0,
    totalLength: 0,
    time: 0,
    avgHr: 0,
    maxHr: 0,
    minHr: 0,
    calories: 0,
    startTimestamp: 0,
    endTimestamp: 0,
    targetSets: 4,
    targetType: 3,
    targetValue: 5,
    ...r,
  };
}

// Real lapItemList from a recorded session (2026-10-01): 18, 3 and 0 reps at
// 15 kg, against a 4×5 plan. The PR's original summary reported "3×7".
const recordedSession: ActivityLapItem[] = [
  row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 14, reps: 18, weight: 15000, time: 416, totalLength: 416 }),
  row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 15, weight: 15000, time: 1022, actualValue: 1022, totalLength: 1438 }),
  row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 14, reps: 3, weight: 15000, time: 241, totalLength: 1679 }),
  row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 15, weight: 15000, time: 588, actualValue: 588, totalLength: 2267 }),
  row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 14, reps: 0, weight: 15000, time: 763, totalLength: 3030 }),
  row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 16, lapType: 1, sets: 3, reps: 21, weight: 315000, time: 1420, actualValue: 21, totalLength: 4450 }),
  row({ exerciseIndex: 1, exerciseNameKey: "S3618", mode: 17, lapType: 1, sets: 2, weight: 315000, time: 1610, actualValue: 1611, totalLength: 6060 }),
];

describe("formatStrengthExercises", () => {
  it("lists each recorded set with its own reps, weight, time and rest", () => {
    const name = findByCodeName("T1041")!.name;
    expect(formatStrengthExercises(recordedSession)).toBe(
      [
        `1. ${name} (target 4×5 reps)`,
        "   Set 1: 18 reps @ 15kg in 4.2s, then 10.2s rest",
        "   Set 2: 3 reps @ 15kg in 2.4s, then 5.9s rest",
        "   Set 3: 0 reps @ 15kg in 7.6s",
        "   Total: 3 sets, 21 reps, 315kg volume",
      ].join("\n")
    );
  });

  it("shows ramped weights per set", () => {
    const out = formatStrengthExercises([
      row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 14, reps: 5, weight: 40000, time: 500 }),
      row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 14, reps: 5, weight: 60000, time: 500 }),
      row({ exerciseIndex: 1, exerciseNameKey: "T1041", mode: 14, reps: 3, weight: 82500, time: 500 }),
    ]);
    expect(out).toContain("Set 1: 5 reps @ 40kg");
    expect(out).toContain("Set 2: 5 reps @ 60kg");
    expect(out).toContain("Set 3: 3 reps @ 82.5kg");
  });

  it("omits weight for bodyweight sets", () => {
    const out = formatStrengthExercises([
      row({ exerciseIndex: 1, exerciseNameKey: "T1004", mode: 14, reps: 15, time: 2000 }),
      row({ exerciseIndex: 1, exerciseNameKey: "T1004", mode: 16, lapType: 1, sets: 1, reps: 15 }),
    ]);
    expect(out).toContain("Set 1: 15 reps in 20.0s");
    expect(out).toContain("Total: 1 set, 15 reps");
    expect(out).not.toContain("kg");
  });

  it("shows duration-based sets by time and target", () => {
    const out = formatStrengthExercises([
      row({ exerciseIndex: 1, exerciseNameKey: "T1004", mode: 14, targetType: 2, targetSets: 3, targetValue: 45, time: 4510 }),
      row({ exerciseIndex: 1, exerciseNameKey: "T1004", mode: 15, targetType: 2, actualValue: 9000 }),
      row({ exerciseIndex: 1, exerciseNameKey: "T1004", mode: 14, targetType: 2, targetSets: 3, targetValue: 45, time: 7500 }),
    ]);
    expect(out).toContain("(target 3×45s)");
    expect(out).toContain("Set 1: 45.1s, then 1m 30s rest");
    expect(out).toContain("Set 2: 1m 15s");
  });

  it("orders exercises by index and separates them", () => {
    const out = formatStrengthExercises([
      row({ exerciseIndex: 2, exerciseNameKey: "T1287", mode: 14, reps: 3, weight: 5000, time: 300 }),
      row({ exerciseIndex: 1, exerciseNameKey: "T1067", mode: 14, reps: 6, weight: 15000, time: 300 }),
    ]);
    const [first, second] = out.split("\n\n");
    expect(first).toMatch(/^1\. /);
    expect(second).toMatch(/^2\. /);
  });

  it("falls back to the raw key for exercises missing from the catalog", () => {
    const out = formatStrengthExercises([
      row({ exerciseIndex: 1, exerciseNameKey: "T9999", mode: 14, reps: 5, time: 300 }),
    ]);
    expect(out).toMatch(/^1\. T9999 /);
  });

  it("returns an empty string when there are only rest rows", () => {
    expect(
      formatStrengthExercises([
        row({ exerciseIndex: 1, exerciseNameKey: "S3618", mode: 17, lapType: 1 }),
      ])
    ).toBe("");
  });
});
