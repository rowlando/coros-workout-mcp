import { describe, it, expect } from "vitest";
import {
  buildExercisePayload,
  buildWorkoutPayload,
  resolveExercises,
} from "../coros-api.js";
import { findByName } from "../exercise-catalog.js";

describe("coros-api payload construction", () => {
  describe("buildExercisePayload", () => {
    it("builds payload from Push-ups catalog entry with defaults", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1);

      expect(payload.nameText).toBe("Push-ups");
      expect(payload.name).toBe("T1004");
      expect(payload.originId).toBe(pushups.id);
      expect(payload.sortNo).toBe(1);
      expect(payload.id).toBe(1);
      expect(payload.sportType).toBe(4);
      expect(payload.targetType).toBe(3); // reps
      expect(payload.targetValue).toBe(15); // default reps
      expect(payload.sets).toBe(4); // default sets from catalog
      expect(payload.restValue).toBe(30); // default rest
      expect(payload.intensityType).toBe(1);
      expect(payload.intensityValue).toBe(0);
      expect(payload.isGroup).toBe(false);
      expect(payload.groupId).toBe("");
      expect(payload.intensityDisplayUnit).toBe("6");
    });

    it("applies reps override", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1, { reps: 20 });

      expect(payload.targetType).toBe(3);
      expect(payload.targetValue).toBe(20);
    });

    it("applies sets override", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1, { sets: 5 });

      expect(payload.sets).toBe(5);
    });

    it("applies weight override in grams", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1, {
        weightGrams: 10000,
      });

      expect(payload.intensityType).toBe(1);
      expect(payload.intensityValue).toBe(10000);
    });

    it("applies weight override in kg (converts to grams)", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1, { weightKg: 20 });

      expect(payload.intensityType).toBe(1);
      expect(payload.intensityValue).toBe(20000);
    });

    it("applies rest override", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1, { restSeconds: 60 });

      expect(payload.restType).toBe(1);
      expect(payload.restValue).toBe(60);
    });

    it("applies duration override (changes targetType to 2)", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1, { duration: 45 });

      expect(payload.targetType).toBe(2);
      expect(payload.targetValue).toBe(45);
    });

    it("includes media URLs from catalog", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1);

      expect(payload.thumbnailUrl).toBeTruthy();
      expect(payload.videoInfos.length).toBeGreaterThan(0);
      expect(payload.coverUrlArrStr).toBeTruthy();
    });

    it("includes text fields", () => {
      const pushups = findByName("Push-ups")!;
      const payload = buildExercisePayload(pushups, 1);

      expect(payload.muscleText).toBe("Chest");
      expect(payload.partText).toContain("Chest");
      expect(payload.equipmentText).toBe("Bodyweight");
    });
  });

  describe("buildWorkoutPayload", () => {
    it("builds a workout with correct defaults", () => {
      const pushups = findByName("Push-ups")!;
      const exercise = buildExercisePayload(pushups, 1);

      const workout = buildWorkoutPayload(
        "Test Workout",
        "A test",
        [exercise]
      );

      expect(workout.name).toBe("Test Workout");
      expect(workout.overview).toBe("A test");
      expect(workout.sportType).toBe(4);
      expect(workout.exercises).toHaveLength(1);
      expect(workout.pbVersion).toBe(2);
      expect(workout.access).toBe(1);
      expect(workout.id).toBe("0");
      expect(workout.duration).toBe(0);
      expect(workout.totalSets).toBe(0);
    });
  });

  describe("resolveExercises", () => {
    it("resolves exercise names to payloads", () => {
      const payloads = resolveExercises([
        { name: "Push-ups", sets: 3, reps: 15 },
        { name: "Squats", sets: 3, reps: 10 },
      ]);

      expect(payloads).toHaveLength(2);
      expect(payloads[0].nameText).toBe("Push-ups");
      expect(payloads[0].sortNo).toBe(1);
      expect(payloads[0].sets).toBe(3);
      expect(payloads[0].targetValue).toBe(15);

      expect(payloads[1].nameText).toBe("Squats");
      expect(payloads[1].sortNo).toBe(2);
      expect(payloads[1].sets).toBe(3);
      expect(payloads[1].targetValue).toBe(10);
    });

    it("throws for unknown exercise name", () => {
      expect(() =>
        resolveExercises([{ name: "Nonexistent Exercise" }])
      ).toThrow('Exercise not found in catalog: "Nonexistent Exercise"');
    });
  });
});
