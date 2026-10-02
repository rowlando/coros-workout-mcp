import { describe, it, expect } from "vitest";
import { parseCalculateResult } from "../coros-api.js";

describe("parseCalculateResult", () => {
  it("reads the plan-prefixed fields the endpoint returns", () => {
    const result = parseCalculateResult({
      planDuration: 1356,
      planSets: 11,
      planTrainingLoad: 42,
    });
    expect(result).toEqual({ duration: 1356, totalSets: 11, trainingLoad: 42 });
  });

  it("falls back to the unprefixed names", () => {
    const result = parseCalculateResult({ duration: 600, totalSets: 5, trainingLoad: 7 });
    expect(result).toEqual({ duration: 600, totalSets: 5, trainingLoad: 7 });
  });

  it("prefers the prefixed name when both are present", () => {
    expect(parseCalculateResult({ planDuration: 1356, duration: 1 }).duration).toBe(1356);
  });

  // planTrainingLoad is 0 on a strength workout, which is a real value.
  it("keeps a zero instead of falling through to the fallback", () => {
    expect(parseCalculateResult({ planTrainingLoad: 0, trainingLoad: 99 }).trainingLoad).toBe(0);
  });

  it("returns zeroes rather than NaN when fields are missing or not numbers", () => {
    expect(parseCalculateResult({ planDuration: "1356" })).toEqual({
      duration: 0,
      totalSets: 0,
      trainingLoad: 0,
    });
    expect(parseCalculateResult(null)).toEqual({ duration: 0, totalSets: 0, trainingLoad: 0 });
  });
});
