import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildPrompt, cleanFeedback, loadPrompts, FEEDBACK_SCHEMA } from "../lib/writing.js";
import { cleanEssay } from "../lib/validate.js";
import { promptText, essayWords, taskBand } from "../public/shared.js";

const dir = fileURLToPath(new URL("../content", import.meta.url));

test("prompt bank covers GT letters, Academic charts and Task 2", () => {
  const prompts = loadPrompts(dir);
  const count = (f) => prompts.filter(f).length;
  assert.ok(count((p) => p.task === 1 && p.module === "general") >= 6);
  assert.ok(count((p) => p.task === 1 && p.module === "academic") >= 6);
  assert.ok(count((p) => p.task === 2) >= 10);
});

test("letter prompts read like the real test", () => {
  const letter = loadPrompts(dir).find((p) => p.module === "general");
  const text = promptText(letter);
  assert.match(text, /Write a letter to .+\. In your letter/);
  assert.equal((text.match(/^• /gm) || []).length, 3);
  assert.match(text, /You do NOT need to write any addresses\./);
});

test("chart prompts carry their data as text for the examiner", () => {
  const chart = loadPrompts(dir).find((p) => p.module === "academic");
  const text = promptText(chart);
  assert.match(text, /Chart data:/);
  assert.ok(text.includes(chart.chart.categories[0]));
});

test("the examiner prompt states the target, length and the response", () => {
  const essay = { task: 2, module: "general", prompt: { module: "both", prompt: "Some people think X. To what extent do you agree or disagree?" }, text: "word ".repeat(120).trim(), minutes: 35 };
  const p = buildPrompt(essay, { targetBand: 7 });
  assert.match(p, /target band: 7\.0/);
  assert.match(p, /This response has 120 words/);
  assert.match(p, /<<<RESPONSE\n(word ){10}/);
});

test("feedback is put in fixed criterion order with a task band", () => {
  const essay = { task: 1, text: "I am writing to complain about the delay." };
  const raw = {
    criteria: [{ key: "gra", band: 6, comment: "g" }, { key: "task", band: 7, comment: "t" }, { key: "lr", band: 6, comment: "l" }, { key: "cc", band: 7, comment: "c" }],
    summary: "s", strengths: ["a"], nextSteps: ["n"], modelParagraph: "m",
    improvements: [{ criterion: "lr", quote: "not in essay", fix: "x", why: "y" }, { criterion: "task", quote: "complain about the delay", fix: "x", why: "y" }],
  };
  const f = cleanFeedback(raw, essay);
  assert.deepEqual(f.criteria.map((c) => c.key), ["task", "cc", "lr", "gra"]);
  assert.equal(f.criteria[0].name, "Task Achievement");
  assert.equal(f.band, 6.5);
  assert.equal(f.improvements[0].found, true); // quotes found in the essay come first
  assert.throws(() => cleanFeedback({ ...raw, criteria: raw.criteria.slice(1) }, essay), /tidak lengkap/);
  assert.ok(FEEDBACK_SCHEMA.required.includes("criteria"));
});

test("essay input is checked", () => {
  assert.throws(() => cleanEssay({ task: 3, text: "x".repeat(50), promptId: "t2-01" }), /Task/);
  assert.throws(() => cleanEssay({ task: 2, text: "too short", promptId: "t2-01" }), /pendek/);
  assert.throws(() => cleanEssay({ task: 2, text: "x ".repeat(40) }), /soal/);
  const e = cleanEssay({ task: "1", module: "academic", text: "word ".repeat(30), custom: "My own prompt", minutes: "18" });
  assert.deepEqual([e.task, e.module, e.promptId, e.custom, e.minutes], [1, "academic", null, "My own prompt", 18]);
});

test("word count and task band", () => {
  assert.equal(essayWords(" A well-known  issue,\nreally. "), 4);
  assert.equal(taskBand([{ band: 6 }, { band: 6 }, { band: 6 }, { band: 7 }]), 6);
  assert.equal(taskBand([{ band: 7 }, { band: 7 }, { band: 7 }, { band: 6 }]), 6.5);
});

test("letters print the salutation only when formal, as on the real paper", async () => {
  const { letterOpening, promptText } = await import("../public/shared.js");
  const base = { module: "general", situation: "s", recipient: "r", bullets: ["a", "b", "c"] };
  assert.equal(letterOpening({ ...base, kind: "formal", opening: "Dear Sir or Madam," }), "Dear Sir or Madam,");
  assert.equal(letterOpening({ ...base, kind: "informal", opening: "Dear Alex," }), "Dear ……………,");
  assert.match(promptText({ ...base, kind: "semi-formal", opening: "Dear Ms Whitfield," }), /Begin your letter as follows:\nDear ……………,$/);
});
