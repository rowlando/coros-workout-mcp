import { describe, it, expect } from "vitest";
import {
  formatActivity,
  formatActivityDate,
  formatDuration,
} from "../activity-format.js";
import type { ActivitySummary } from "../coros-api.js";

const strength: ActivitySummary = {
  labelId: "477574221250199560",
  date: 20260316,
  name: "Upper Body",
  sportType: 402,
  mode: 0,
  subMode: 0,
  startTime: 0,
  endTime: 0,
  totalTime: 3420,
  workoutTime: 0,
  distance: 0,
  calorie: 312000,
  avgHr: 118,
  trainingLoad: 45,
  device: "",
};

describe("formatActivity", () => {
  it("includes the labelId and sportType that get_activity_detail needs", () => {
    expect(formatActivity(strength)).toContain(
      "labelId: 477574221250199560, sportType: 402"
    );
  });

  it("formats a strength session", () => {
    expect(formatActivity(strength)).toBe(
      [
        "- **Upper Body** (2026-03-16, Strength)",
        "  57m 0s, 312 kcal, avgHR 118, TL 45",
        "  labelId: 477574221250199560, sportType: 402",
      ].join("\n")
    );
  });

  it("includes distance and omits zero metrics", () => {
    const run = {
      ...strength,
      sportType: 100,
      distance: 10230,
      calorie: 0,
      avgHr: 0,
      trainingLoad: 0,
    };
    expect(formatActivity(run).split("\n")[1]).toBe("  57m 0s, 10.23 km");
  });

  it("falls back to the numeric code for unknown sport types", () => {
    expect(formatActivity({ ...strength, sportType: 999 })).toContain(
      "(2026-03-16, sport 999)"
    );
  });
});

describe("formatActivityDate", () => {
  it("converts YYYYMMDD to ISO format", () => {
    expect(formatActivityDate(20260316)).toBe("2026-03-16");
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45s"],
    [125, "2m 5s"],
    [3420, "57m 0s"],
    [5400, "1h 30m"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});
