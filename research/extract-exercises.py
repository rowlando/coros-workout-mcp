#!/usr/bin/env python3
"""Extract COROS strength exercises into clean JSON and CSV."""

import csv
import json
import re

BODY_PARTS = {
    0: "Whole Body",
    1: "Shoulders",
    2: "Chest",
    3: "Back",
    4: "Core",
    5: "Legs/Hips",
    6: "Arms",
}

EQUIPMENT = {
    1: "Bodyweight",
    2: "Dumbbells",
    3: "Barbells",
    4: "Barbell Plates",
    5: "Cable/Pulley",
    6: "Gym Equipment",
    7: "Exercise Ball",
    8: "Bosu Ball",
    9: "Bands",
    10: "Medicine Ball",
    11: "Kettlebell",
    12: "Hangboard",
    13: "Indoor Rower",
    16: "Ropes",
}

MUSCLES = {
    1: "Deltoids",
    2: "Chest",
    3: "Biceps",
    4: "Triceps",
    5: "Forearms",
    6: "Abs",
    7: "Glutes",
    8: "Quadriceps",
    9: "Adductor",
    10: "Abductor",
    11: "Trapezius",
    12: "Latissimus Dorsi",
    13: "Erector Spinae",
    14: "Posterior Thigh",
    15: "Calves",
}


def load_i18n(path):
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    # Strip "window.en_US=" prefix and trailing semicolons
    text = re.sub(r"^window\.\w+=", "", text.strip()).rstrip(";")
    return json.loads(text)


def main():
    i18n = load_i18n("en-US.prod.js")

    with open("strength-exercises.json", "r", encoding="utf-8") as f:
        raw = json.load(f)

    exercises = raw["data"]
    print(f"Total exercises: {len(exercises)}")

    results = []
    for ex in exercises:
        name_code = ex["name"]
        name = i18n.get(name_code, name_code)

        covers = ex.get("coverUrlArrStr", "")
        thumbnail = covers.split(",")[0] if covers else ""
        video = ex.get("videoUrl", "")

        results.append(
            {
                "name": name,
                "body_parts": [
                    BODY_PARTS.get(p, f"Unknown({p})") for p in ex.get("part", [])
                ],
                "muscles": [
                    MUSCLES.get(m, f"Unknown({m})") for m in ex.get("muscle", [])
                ],
                "equipment": [
                    EQUIPMENT.get(e, f"Unknown({e})") for e in ex.get("equipment", [])
                ],
                "thumbnail": thumbnail,
                "video": video,
            }
        )

    results.sort(key=lambda r: r["name"])

    with open("exercises-clean.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    with open("exercises.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Name", "Body Parts", "Muscles", "Equipment"])
        for r in results:
            writer.writerow(
                [
                    r["name"],
                    "; ".join(r["body_parts"]),
                    "; ".join(r["muscles"]),
                    "; ".join(r["equipment"]),
                ]
            )

    print(f"Wrote {len(results)} exercises to exercises-clean.json and exercises.csv")


if __name__ == "__main__":
    main()
