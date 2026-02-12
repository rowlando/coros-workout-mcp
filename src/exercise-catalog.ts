import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogExercise } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let catalog: CatalogExercise[] | null = null;

function loadCatalog(): CatalogExercise[] {
  if (catalog) return catalog;
  // Try dist/data first (built), then data/ (dev)
  const paths = [
    resolve(__dirname, "..", "data", "exercises.json"),
    resolve(__dirname, "..", "..", "data", "exercises.json"),
  ];
  for (const p of paths) {
    try {
      catalog = JSON.parse(readFileSync(p, "utf-8"));
      return catalog!;
    } catch {
      // try next
    }
  }
  throw new Error("Could not load exercise catalog (data/exercises.json)");
}

export function getAllExercises(): CatalogExercise[] {
  return loadCatalog();
}

/** Find exercise by exact name (case-insensitive) */
export function findByName(name: string): CatalogExercise | undefined {
  const lower = name.toLowerCase().trim();
  return loadCatalog().find((e) => e.name.toLowerCase() === lower);
}

/** Find exercise by internal code name (e.g. "T1004") */
export function findByCodeName(codeName: string): CatalogExercise | undefined {
  const lower = codeName.toLowerCase().trim();
  return loadCatalog().find((e) => e.codeName.toLowerCase() === lower);
}

/** Find exercise by ID */
export function findById(id: string): CatalogExercise | undefined {
  return loadCatalog().find((e) => e.id === id);
}

/** Fuzzy name search — matches if all search terms appear in the exercise name */
export function searchByName(query: string): CatalogExercise[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (terms.length === 0) return [];

  return loadCatalog().filter((e) => {
    const name = e.name.toLowerCase();
    return terms.every((term) => name.includes(term));
  });
}

export interface SearchFilters {
  query?: string;
  muscle?: string;
  bodyPart?: string;
  equipment?: string;
}

/** Search exercises by name, muscle, body part, and/or equipment */
export function searchExercises(filters: SearchFilters): CatalogExercise[] {
  let results = loadCatalog();

  if (filters.query) {
    const terms = filters.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);
    if (terms.length > 0) {
      results = results.filter((e) => {
        const name = e.name.toLowerCase();
        return terms.every((term) => name.includes(term));
      });
    }
  }

  if (filters.muscle) {
    const muscle = filters.muscle.toLowerCase();
    results = results.filter((e) => {
      const primary = e.muscleText.toLowerCase();
      const secondary = e.secondaryMuscleText.toLowerCase();
      return primary.includes(muscle) || secondary.includes(muscle);
    });
  }

  if (filters.bodyPart) {
    const part = filters.bodyPart.toLowerCase();
    results = results.filter((e) => e.partText.toLowerCase().includes(part));
  }

  if (filters.equipment) {
    const equip = filters.equipment.toLowerCase();
    results = results.filter((e) =>
      e.equipmentText.toLowerCase().includes(equip)
    );
  }

  return results;
}
