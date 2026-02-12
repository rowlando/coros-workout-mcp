import { describe, it, expect } from "vitest";
import {
  getAllExercises,
  findByName,
  findByCodeName,
  findById,
  searchByName,
  searchExercises,
} from "../exercise-catalog.js";

describe("exercise-catalog", () => {
  describe("getAllExercises", () => {
    it("loads the catalog with 383 exercises", () => {
      const all = getAllExercises();
      expect(all.length).toBe(383);
    });

    it("each exercise has required fields", () => {
      const all = getAllExercises();
      for (const e of all) {
        expect(e.id).toBeTruthy();
        expect(e.name).toBeTruthy();
        expect(e.codeName).toBeTruthy();
        expect(typeof e.targetType).toBe("number");
        expect(typeof e.sets).toBe("number");
      }
    });
  });

  describe("findByName", () => {
    it("finds Push-ups case-insensitively", () => {
      const ex = findByName("push-ups");
      expect(ex).toBeDefined();
      expect(ex!.name).toBe("Push-ups");
      expect(ex!.codeName).toBe("T1004");
    });

    it("finds Squats", () => {
      const ex = findByName("Squats");
      expect(ex).toBeDefined();
      expect(ex!.name).toBe("Squats");
    });

    it("returns undefined for non-existent exercise", () => {
      expect(findByName("Nonexistent Exercise")).toBeUndefined();
    });
  });

  describe("findByCodeName", () => {
    it("finds T1004 (Push-ups)", () => {
      const ex = findByCodeName("T1004");
      expect(ex).toBeDefined();
      expect(ex!.name).toBe("Push-ups");
    });
  });

  describe("findById", () => {
    it("finds exercise by ID", () => {
      const pushups = findByName("Push-ups")!;
      const found = findById(pushups.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Push-ups");
    });
  });

  describe("searchByName", () => {
    it("finds exercises matching partial name", () => {
      const results = searchByName("push");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((e) => e.name === "Push-ups")).toBe(true);
    });

    it("finds exercises matching multiple terms", () => {
      const results = searchByName("bench press");
      expect(results.length).toBeGreaterThan(0);
      for (const e of results) {
        expect(e.name.toLowerCase()).toContain("bench");
        expect(e.name.toLowerCase()).toContain("press");
      }
    });

    it("returns empty for no match", () => {
      expect(searchByName("xyznonexistent")).toHaveLength(0);
    });
  });

  describe("searchExercises", () => {
    it("filters by muscle", () => {
      const results = searchExercises({ muscle: "chest" });
      expect(results.length).toBeGreaterThan(0);
      for (const e of results) {
        const allMuscles = (e.muscleText + "," + e.secondaryMuscleText).toLowerCase();
        expect(allMuscles).toContain("chest");
      }
    });

    it("filters by equipment", () => {
      const results = searchExercises({ equipment: "bodyweight" });
      expect(results.length).toBeGreaterThan(0);
      for (const e of results) {
        expect(e.equipmentText.toLowerCase()).toContain("bodyweight");
      }
    });

    it("filters by body part", () => {
      const results = searchExercises({ bodyPart: "legs" });
      expect(results.length).toBeGreaterThan(0);
      for (const e of results) {
        expect(e.partText.toLowerCase()).toContain("legs");
      }
    });

    it("combines name query with muscle filter", () => {
      const results = searchExercises({ query: "press", muscle: "chest" });
      expect(results.length).toBeGreaterThan(0);
      for (const e of results) {
        expect(e.name.toLowerCase()).toContain("press");
        const allMuscles = (e.muscleText + "," + e.secondaryMuscleText).toLowerCase();
        expect(allMuscles).toContain("chest");
      }
    });

    it("returns all exercises when no filters given", () => {
      const results = searchExercises({});
      expect(results.length).toBe(383);
    });
  });
});
