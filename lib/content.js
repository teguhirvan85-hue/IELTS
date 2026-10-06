// Lessons (content/lessons/<id>.md, with a small front-matter header) and drills
// (content/drills/<id>.json). Read from disk on every request, so edited content shows
// up without restarting the service.
import fs from "node:fs";
import path from "node:path";
import { countQuestions } from "../public/shared.js";


export function parseLesson(src, name = "lesson") {
  const m = src.replace(/\r/g, "").match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`${name}: front matter (--- … ---) is missing`);
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  meta.types = (meta.types || "").split(",").map((s) => s.trim()).filter(Boolean);
  meta.order = Number(meta.order) || 99;
  return { meta, body: src.replace(/\r/g, "").slice(m[0].length) };
}

export function createContent(dir) {
  const files = (sub, ext) => {
    try {
      return fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith(ext)).sort();
    } catch {
      return [];
    }
  };
  const read = (sub, f) => fs.readFileSync(path.join(dir, sub, f), "utf8");

  function lessons() {
    return files("lessons", ".md").map((f) => parseLesson(read("lessons", f), f));
  }
  function drills() {
    return files("drills", ".json").map((f) => JSON.parse(read("drills", f)));
  }

  return {
    dir,
    lessons,
    drills,
    // Lesson list for the Materi page: metadata plus a short entry per drill.
    summary() {
      const all = drills();
      return lessons()
        .map(({ meta }) => ({
          ...meta,
          drills: all.filter((d) => d.lesson === meta.id).map((d) => ({ id: d.id, title: d.title, minutes: d.minutes, count: countQuestions(d) })),
        }))
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    },
    lesson(id) {
      const found = lessons().find((l) => l.meta.id === id);
      if (!found) return null;
      return { ...found, drills: drills().filter((d) => d.lesson === id) };
    },
    drill(id) {
      return drills().find((d) => d.id === id) || null;
    },
    // Ready-made flashcard decks (content/decks/<id>.json).
    decks() {
      return files("decks", ".json").map((f) => JSON.parse(read("decks", f)));
    },
  };
}
