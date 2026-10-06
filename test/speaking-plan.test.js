import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadBank, buildSpeakingPrompt, cleanSpeakingFeedback, answerStats } from "../lib/speaking.js";
import { cleanSpeaking, cleanPlanSnapshot, cleanSettings } from "../lib/validate.js";
import { buildPlan, planPhase, planStreak, weekPlan, weakestSkill } from "../public/shared.js";

const dir = fileURLToPath(new URL("../content", import.meta.url));

test("speaking bank has Part 1 topics and cue cards with Part 3", () => {
  const { part1, part2 } = loadBank(dir);
  assert.ok(part1.length >= 10);
  assert.equal(part1[0].topic, "Work or studies");
  assert.ok(part2.length >= 10);
  assert.ok(part2.every((c) => c.bullets.length === 3 && c.part3.length >= 4));
});

const session = {
  mode: "part2",
  answers: [
    { part: 2, question: "Describe a skill…", transcript: "um I learned to cook when I moved to Jakarta for work and it was really hard at first", seconds: 60 },
    { part: 3, question: "Why do people learn skills?", transcript: "", seconds: 0 },
  ],
};

test("the examiner prompt carries timing and speaking rate", () => {
  const p = buildSpeakingPrompt(session, { targetBand: 7 });
  assert.match(p, /target band: 7\.0/);
  assert.match(p, /Speaking time: 60 s · 19 words · 19 words per minute/);
  assert.match(p, /<<<TRANSCRIPT\n\nTRANSCRIPT>>>/); // an unanswered question stays visible as empty
  assert.deepEqual(answerStats({ transcript: "a b c", seconds: 2 }), { words: 3, wpm: null });
});

test("speaking feedback: three criteria in order, band without pronunciation", () => {
  const raw = {
    criteria: [{ key: "lr", band: 6, comment: "l" }, { key: "fc", band: 5, comment: "f" }, { key: "gra", band: 6, comment: "g" }],
    summary: "s", strengths: [], nextSteps: [], pronunciation: ["th"], vocabulary: [{ phrase: "pick up a skill", meaning: "belajar" }],
    betterAnswers: [{ question: "q", answer: "a" }],
    improvements: [{ criterion: "gra", quote: "it was really hard", fix: "it was really difficult", why: "w" }],
  };
  const f = cleanSpeakingFeedback(raw, session);
  assert.deepEqual(f.criteria.map((c) => c.key), ["fc", "lr", "gra"]);
  assert.equal(f.band, 5.5);
  assert.equal(f.improvements[0].found, true);
});

test("speaking input is checked", () => {
  assert.throws(() => cleanSpeaking({ mode: "part9", answers: [] }), /Jenis/);
  assert.throws(() => cleanSpeaking({ mode: "part1", answers: [{ part: 1, question: "q", transcript: "too short", seconds: 3 }] }), /pendek/);
  const ok = cleanSpeaking({ mode: "part1", answers: [{ part: 1, question: "q?", transcript: "I work as a nurse in a small clinic near my home", seconds: "21.6" }] });
  assert.equal(ok.answers[0].seconds, 22);
});

const base = { settings: { examDate: "2026-12-06", targetBand: 7, minutesPerDay: 45, module: "general" }, latest: { listening: 6, reading: 6, writing: 6, speaking: 6 }, cardsTotal: 30 };
const logged = [
  { id: "a", skill: "listening", date: "2026-10-01", groups: [{ from: 1, to: 10, part: 1, type: "form", wrong: [1, 2, 3, 4] }] },
  { id: "b", skill: "reading", module: "academic", date: "2026-10-02", groups: [{ from: 1, to: 13, part: 1, type: "tfng", wrong: [1, 2, 3, 4, 5] }] },
];

test("phases follow the days left", () => {
  assert.equal(planPhase(60), "foundation");
  assert.equal(planPhase(20), "practice");
  assert.equal(planPhase(5), "mock");
  assert.equal(planPhase(0), "exam");
  assert.equal(planPhase(-1), "done");
  assert.equal(planPhase(null), "foundation");
});

test("no scores yet: the diagnostic comes first and the day stays within budget", () => {
  const p = buildPlan({ ...base, today: "2026-10-07", attempts: [] });
  assert.equal(p.tasks[0].id, "diagnostic:listening");
  assert.ok(p.tasks.reduce((n, t) => n + t.minutes, 0) <= 50);
});

test("foundation days teach the weakest question type of the day's skill", () => {
  const p = buildPlan({ ...base, today: "2026-10-12", attempts: logged, cardsDue: 9, journalOpen: 2 }); // a Monday: Listening
  assert.equal(p.focus, "listening");
  assert.deepEqual(p.tasks.slice(0, 3).map((t) => t.id), ["cards", "journal", "lesson:l-completion"]);
});

test("practice and mock phases use engnovate; Saturdays in the last weeks are full simulations", () => {
  const practice = buildPlan({ ...base, today: "2026-11-17", attempts: logged }); // Tuesday: Reading
  assert.ok(practice.tasks.some((t) => t.id === "engnovate:reading" && t.external));
  const sat = buildPlan({ ...base, today: "2026-11-28", attempts: logged });
  assert.equal(sat.focus, "mock");
  assert.ok(sat.tasks.some((t) => t.id === "mock"));
  const exam = buildPlan({ ...base, today: "2026-12-06", attempts: logged, cardsDue: 4 });
  assert.deepEqual(exam.tasks.map((t) => t.id), ["cards"]);
});

test("weakest skill, week strip and streak", () => {
  assert.equal(weakestSkill({ listening: 7, reading: 6, writing: 6.5, speaking: 7 }, 7), "reading");
  assert.equal(weakestSkill({ listening: 7, reading: 6 }, 7), "writing"); // no score yet counts as weakest
  const week = weekPlan("2026-10-07", {}, 7);
  assert.equal(week[0].label, "Sen");
  assert.equal(week[0].date, "2026-10-05");
  assert.equal(planStreak({ "2026-10-06": { done: ["x"] }, "2026-10-05": { done: ["y"] }, "2026-10-03": { done: ["z"] } }, "2026-10-07"), 2);
});

test("plan input is checked", () => {
  assert.throws(() => cleanPlanSnapshot({ date: "2026-10-07", tasks: [{ id: "x", title: "t", minutes: 5, href: "https://evil.example/" }] }), /Link/);
  const ok = cleanPlanSnapshot({ date: "2026-10-07", tasks: [{ id: "engnovate:reading", title: "t", minutes: 20, href: "https://engnovate.com/ielts-reading-tests/", external: true }] });
  assert.equal(ok.tasks[0].external, true);
  assert.equal(cleanSettings({ minutesPerDay: "60" }).minutesPerDay, 60);
  assert.throws(() => cleanSettings({ minutesPerDay: 5 }), /Menit/);
});
