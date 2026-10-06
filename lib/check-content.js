// Consistency checks for lessons and drills: every answer must be backed by the passage
// or transcript, gap-fill answers must fit the word limit, numbering must be clean.
// Run with `node scripts/check-content.js`; test/content.test.js runs it too.
import fs from "node:fs";
import path from "node:path";
import { QTYPES, lessonFor, limitWords, normalizeAnswer, questionKey } from "../public/shared.js";
import { createContent } from "./content.js";

export const VOICES = ["Daniel", "Karen", "Moira", "Samantha", "Rishi", "Tara"];
const INPUTS = new Set(["choice", "text", "multi"]);

function sourceText(d) {
  if (d.skill === "listening") return (d.script || []).map((l) => l.text || "");
  return (d.passage?.paragraphs || []).map((p) => p.text || "");
}

function containsWord(haystack, needle) {
  const esc = normalizeAnswer(needle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(haystack.toLowerCase().replace(/[‘’]/g, "'"));
}

export function checkContent(dir) {
  const errors = [];
  const warnings = [];
  const content = createContent(dir);
  let lessons = [];
  let drills = [];
  try {
    lessons = content.lessons();
    drills = content.drills();
  } catch (err) {
    return { errors: [err.message], warnings, lessons: 0, drills: 0 };
  }
  const lessonIds = new Map(lessons.map((l) => [l.meta.id, l.meta]));

  const lessonFiles = fs.readdirSync(path.join(dir, "lessons")).filter((f) => f.endsWith(".md"));
  lessons.forEach(({ meta, body }, i) => {
    const at = `lesson ${lessonFiles[i]}`;
    if (meta.id !== lessonFiles[i].replace(/\.md$/, "")) errors.push(`${at}: id "${meta.id}" must match the file name`);
    for (const f of ["title", "skill", "summary"]) if (!meta[f]) errors.push(`${at}: ${f} is missing`);
    if (!["reading", "listening"].includes(meta.skill)) errors.push(`${at}: skill must be reading or listening`);
    if (!meta.types.length) errors.push(`${at}: types is empty`);
    for (const t of meta.types) {
      if (!(t in QTYPES)) errors.push(`${at}: unknown type "${t}"`);
      else if (lessonFor(meta.skill, t) !== meta.id) errors.push(`${at}: type "${t}" maps to lesson "${lessonFor(meta.skill, t)}" in shared.js, not "${meta.id}"`);
    }
    if ((body.match(/^## /gm) || []).length < 3) errors.push(`${at}: needs at least three ## sections`);
    if (!drills.some((d) => d.lesson === meta.id)) warnings.push(`${at}: has no drill yet`);
  });

  const drillFiles = fs.readdirSync(path.join(dir, "drills")).filter((f) => f.endsWith(".json"));
  drills.forEach((d, i) => {
    const at = `drill ${drillFiles[i]}`;
    const err = (m) => errors.push(`${at}: ${m}`);
    if (d.id !== drillFiles[i].replace(/\.json$/, "")) err(`id "${d.id}" must match the file name`);
    const lesson = lessonIds.get(d.lesson);
    if (!lesson) err(`lesson "${d.lesson}" does not exist`);
    else if (lesson.skill !== d.skill) err(`skill "${d.skill}" differs from its lesson (${lesson.skill})`);
    if (!d.title) err("title is missing");
    if (!(Number(d.minutes) > 0)) err("minutes must be a positive number");
    if (!d.instruction) err("instruction is missing");
    if (d.variant != null && (typeof d.variant !== "string" || d.variant.length > 60)) err("variant must be a short text (max 60 characters)");
    if (!INPUTS.has(d.input)) err(`input must be choice, text or multi`);
    if (!Array.isArray(d.questions) || d.questions.length < 3) return err("needs at least three questions");

    const texts = sourceText(d);
    const full = texts.join("\n");
    if (d.skill === "reading") {
      if (!d.passage?.title || !Array.isArray(d.passage?.paragraphs) || !d.passage.paragraphs.length) err("reading drills need passage.title and passage.paragraphs");
    } else {
      if (!Array.isArray(d.script) || !d.script.length) err("listening drills need a script");
      for (const l of d.script || []) {
        if (!VOICES.includes(l.voice)) err(`voice "${l.voice}" is not one of ${VOICES.join(", ")}`);
        if (!l.text) err("every script line needs text");
      }
      if (!fs.existsSync(path.join(dir, "audio", `${d.id}.m4a`))) warnings.push(`${at}: audio not generated yet (npm run audio)`);
    }
    if (d.image && !fs.existsSync(path.join(dir, "img", d.image))) err(`image ${d.image} not found in content/img`);

    const nums = d.questions.flatMap((q) => (Array.isArray(q.n) ? q.n : [q.n]));
    if (new Set(nums).size !== nums.length) err("question numbers repeat");
    nums.forEach((n, k) => {
      if (!Number.isInteger(n) || (k > 0 && n !== nums[k - 1] + 1)) err(`question numbers must be consecutive integers (got ${nums.join(", ")})`);
    });

    const contextText = [...(d.context?.lines || []), ...(d.context?.rows || []).flat()].join("\n");
    for (const q of d.questions) {
      const key = questionKey(q);
      const qa = `${at} Q${key}`;
      if (!q.explain) errors.push(`${qa}: explain is missing`);
      const keys = (q.choices || d.options || []).map((o) => o.key);
      if (Array.isArray(q.answer)) {
        if (d.input === "text") errors.push(`${qa}: an answer list needs input "choice" or "multi"`);
        if (!Array.isArray(q.n) || q.n.length !== q.answer.length) errors.push(`${qa}: n and answer must list the same number of items`);
        for (const a of q.answer) if (!keys.includes(a)) errors.push(`${qa}: answer ${a} is not an option`);
      } else if ((q.input || d.input) === "text") {
        if (!d.wordLimit) errors.push(`${qa}: text drills need wordLimit`);
        for (const a of [q.answer, ...(q.accept || [])]) {
          if (limitWords(d, a) > d.wordLimit) errors.push(`${qa}: "${a}" is longer than the ${d.wordLimit}-word limit`);
        }
        if (![q.answer, ...(q.accept || [])].some((a) => containsWord(full, a))) errors.push(`${qa}: answer "${q.answer}" does not appear in the ${d.skill === "reading" ? "passage" : "script"}`);
        const marker = `[[${q.n}]]`;
        const where = `${contextText}\n${q.prompt || ""}`;
        const count = where.split(marker).length - 1;
        if (count !== 1) errors.push(`${qa}: gap marker ${marker} must appear exactly once in context or prompt (found ${count})`);
      } else {
        if (!keys.length) errors.push(`${qa}: no options (drill.options or question.choices)`);
        if (!keys.includes(q.answer)) errors.push(`${qa}: answer "${q.answer}" is not an option`);
        if (!q.prompt && !d.context) errors.push(`${qa}: prompt is missing`);
      }
      if (q.evidence != null && !texts.some((t) => t.includes(q.evidence))) errors.push(`${qa}: evidence is not an exact quote from one ${d.skill === "reading" ? "paragraph" : "script line"}: "${q.evidence}"`);
      if (q.evidence == null && q.answer !== "NOT GIVEN") warnings.push(`${qa}: no evidence quote to highlight`);
    }
  });
  checkWriting(dir, errors);
  checkSpeaking(dir, errors);
  return { errors, warnings, lessons: lessons.length, drills: drills.length };
}

const ACADEMIC_TAIL = "Summarise the information by selecting and reporting the main features, and make comparisons where relevant.";
const KINDS = {
  general: ["formal", "semi-formal", "informal"],
  academic: ["line", "bar", "pie", "table"],
  both: ["opinion", "discussion", "problem", "advantages", "two-part"],
};

// Writing prompt bank (content/writing/*.json) and guides (content/writing/guide-*.md).
export function checkWriting(dir, errors) {
  const wdir = path.join(dir, "writing");
  if (!fs.existsSync(wdir)) return;
  const ids = new Set();
  for (const f of fs.readdirSync(wdir).filter((x) => x.endsWith(".json")).sort()) {
    let list;
    try {
      list = JSON.parse(fs.readFileSync(path.join(wdir, f), "utf8"));
    } catch (err) {
      errors.push(`writing ${f}: invalid JSON (${err.message})`);
      continue;
    }
    if (!Array.isArray(list)) {
      errors.push(`writing ${f}: must be a JSON array`);
      continue;
    }
    for (const w of list) {
      const at = `writing ${f} ${w.id || "(no id)"}`;
      const err = (m) => errors.push(`${at}: ${m}`);
      if (!w.id || ids.has(w.id)) err("id missing or repeated");
      ids.add(w.id);
      if (w.task !== 1 && w.task !== 2) err("task must be 1 or 2");
      if (w.task === 1 && !["general", "academic"].includes(w.module)) err("task 1 module must be general or academic");
      if (w.task === 2 && w.module !== "both") err('task 2 module must be "both"');
      if (!KINDS[w.module]?.includes(w.kind)) err(`kind "${w.kind}" is not valid for module ${w.module}`);
      if (!w.title || !w.topic) err("title and topic are required");
      if (w.module === "general") {
        if (!w.situation || !w.recipient) err("letters need situation and recipient");
        if (!Array.isArray(w.bullets) || w.bullets.length !== 3) err("letters need exactly three bullets");
        if (!/^Dear .+,$/.test(w.opening || "")) err('opening must look like "Dear …,"');
      }
      if (w.module === "academic") {
        if (!w.prompt?.endsWith(ACADEMIC_TAIL)) err(`prompt must end with "${ACADEMIC_TAIL}"`);
        const c = w.chart;
        if (!c || !c.title || !Array.isArray(c.categories) || !Array.isArray(c.series)) {
          err("chart needs title, categories and series");
          continue;
        }
        if (c.categories.length < 3 || c.categories.length > 8) err("chart needs 3–8 categories");
        if (c.series.length < 1 || c.series.length > 4) err("chart needs 1–4 series");
        for (const s of c.series) {
          if (!s.name || !Array.isArray(s.values) || s.values.length !== c.categories.length) err(`series "${s.name}" needs one value per category`);
          else if (!s.values.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) err(`series "${s.name}" has a value that is not a number ≥ 0`);
          else if (w.kind === "pie") {
            const sum = s.values.reduce((a, b) => a + b, 0);
            if (Math.abs(sum - 100) > 1) err(`pie "${s.name}" adds up to ${sum}, not 100`);
          }
        }
        if (w.kind === "pie" && c.unit !== "%") err('pie charts need unit "%"');
      }
      // Real Task 2 prompts end with a question, except discussion tasks, which end with
      // "Discuss both these views and give your own opinion."
      if (w.task === 2 && w.kind === "discussion" && !/Discuss both these views and give your own opinion\.$/.test(w.prompt || "")) err('discussion prompts end with "Discuss both these views and give your own opinion."');
      if (w.task === 2 && w.kind !== "discussion" && !/\?\s*$/.test(w.prompt || "")) err("task 2 prompt must end with a question");
    }
  }
  for (const f of fs.readdirSync(wdir).filter((x) => /^guide-.*\.md$/.test(x))) {
    const body = fs.readFileSync(path.join(wdir, f), "utf8");
    if ((body.match(/^## /gm) || []).length < 4) errors.push(`writing ${f}: needs at least four ## sections`);
  }
}

// Speaking question bank: content/speaking/part1.json and part2.json.
export function checkSpeaking(dir, errors) {
  const sdir = path.join(dir, "speaking");
  const read = (f) => {
    const file = path.join(sdir, f);
    if (!fs.existsSync(file)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(data)) throw new Error("must be a JSON array");
      return data;
    } catch (err) {
      errors.push(`speaking ${f}: ${err.message}`);
      return null;
    }
  };
  const ids = new Set();
  const question = (q) => typeof q === "string" && /\?$/.test(q.trim());
  for (const s of read("part1.json") || []) {
    const at = `speaking part1 ${s.id || "(no id)"}`;
    if (!/^p1-\d+$/.test(s.id || "") || ids.has(s.id)) errors.push(`${at}: id must be p1-NN and unique`);
    ids.add(s.id);
    if (!s.topic) errors.push(`${at}: topic is missing`);
    if (!Array.isArray(s.questions) || s.questions.length < 4 || s.questions.length > 6) errors.push(`${at}: needs 4–6 questions`);
    else if (!s.questions.every(question)) errors.push(`${at}: every question must end with "?"`);
  }
  for (const c of read("part2.json") || []) {
    const at = `speaking part2 ${c.id || "(no id)"}`;
    if (!/^p2-\d+$/.test(c.id || "") || ids.has(c.id)) errors.push(`${at}: id must be p2-NN and unique`);
    ids.add(c.id);
    if (!/^Describe /.test(c.cue || "")) errors.push(`${at}: cue must start with "Describe"`);
    if (!Array.isArray(c.bullets) || c.bullets.length !== 3) errors.push(`${at}: needs exactly three bullets`);
    if (!/^and (explain|say) /.test(c.last || "")) errors.push(`${at}: last must start with "and explain" or "and say"`);
    if (!Array.isArray(c.part3) || c.part3.length < 4 || c.part3.length > 6 || !c.part3.every(question)) errors.push(`${at}: part3 needs 4–6 questions ending with "?"`);
  }
}
