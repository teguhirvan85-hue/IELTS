import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule, newSrs, reviewQueue, reasonsFor, addDays, REASONS } from "../public/shared.js";
import { buildJournal, pruneMistakes } from "../lib/journal.js";
import { cleanMistake, cleanCard, cleanGrade } from "../lib/validate.js";

const T = "2026-10-06";

test("intervals grow 1 → 3 → 8 → 20 days when remembered", () => {
  let s = newSrs();
  const seen = [];
  for (let k = 0; k < 4; k++) {
    s = schedule(s, 2, T);
    seen.push(s.interval);
  }
  assert.deepEqual(seen, [1, 3, 8, 20]);
  assert.equal(s.due, addDays(T, 20));
});

test("forgetting brings the card back today and counts a lapse", () => {
  let s = schedule(schedule(newSrs(), 2, T), 2, T);
  s = schedule(s, 0, T);
  assert.equal(s.due, T);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.ok(s.ease < 2.5);
  assert.equal(schedule(newSrs(), 0, T).lapses, 0); // a brand-new card can't lapse
});

test("easy jumps further than good, hard less", () => {
  const base = schedule(schedule(newSrs(), 2, T), 2, T);
  const [hard, good, easy] = [1, 2, 3].map((g) => schedule(base, g, T).interval);
  assert.ok(hard < good && good < easy);
});

test("review queue: due cards first, new cards capped per day", () => {
  const card = (id, srs) => ({ id, srs: { ...newSrs(), ...srs } });
  const cards = [
    card("late", { lastReviewed: "2026-10-01", due: "2026-10-03", reps: 2, introducedOn: "2026-10-01" }),
    card("future", { lastReviewed: T, due: "2026-10-09", reps: 1, introducedOn: T }),
    ...Array.from({ length: 20 }, (_, i) => card(`new${i}`, {})),
  ];
  const q = reviewQueue(cards, T, 15);
  assert.equal(q[0].id, "late");
  assert.ok(!q.some((c) => c.id === "future"));
  // "future" was introduced today, so only 14 more new cards fit under the limit of 15
  assert.equal(q.filter((c) => c.id.startsWith("new")).length, 14);
});

test("reasons fit the question type", () => {
  assert.ok(reasonsFor("reading", "tfng").includes("fng"));
  assert.ok(!reasonsFor("reading", "mcq").includes("fng"));
  assert.ok(!reasonsFor("reading", "tfng").includes("spelling"));
  assert.ok(reasonsFor("listening", "form").includes("spelling"));
  assert.ok(reasonsFor("listening", "form").includes("lost_audio"));
  assert.ok(!reasonsFor("reading", "notes").includes("lost_audio"));
  for (const r of Object.keys(REASONS)) assert.ok(REASONS[r].label);
});

const db = () => ({
  attempts: [
    { id: "aaaaaaaaaaaa", skill: "reading", date: "2026-10-05", createdAt: "1", title: "R", url: "u1", skippedParts: [3],
      groups: [{ from: 1, to: 6, part: 1, type: "tfng", wrong: [2, 5] }, { from: 27, to: 30, part: 3, type: "mcq", wrong: [28] }] },
    { id: "bbbbbbbbbbbb", skill: "writing", date: "2026-10-06", createdAt: "2", title: "W", band: 6 },
  ],
  tests: { u1: { groups: [{ from: 1, to: 6, prompts: { 2: "Adult kakapo produce chicks every year." } }] } },
  mistakes: { "aaaaaaaaaaaa:2": { reason: "fng" }, "aaaaaaaaaaaa:9": { reason: "vocab" } },
});

test("journal lists wrong answers of counted parts, with prompts and reasons", () => {
  const d0 = db();
  const items = buildJournal(d0, d0.tests);
  assert.deepEqual(items.map((i) => i.key), ["aaaaaaaaaaaa:2", "aaaaaaaaaaaa:5"]); // part 3 skipped, writing ignored
  assert.equal(items[0].prompt, "Adult kakapo produce chicks every year.");
  assert.equal(items[0].reason, "fng");
  assert.equal(items[1].reason, null);
});

test("reasons for questions no longer wrong are pruned", () => {
  const d = db();
  pruneMistakes(d, d.tests);
  assert.deepEqual(Object.keys(d.mistakes), ["aaaaaaaaaaaa:2"]);
});

test("journal and card input is checked", () => {
  assert.deepEqual(cleanMistake({ reason: "vocab", mine: " x ", note: "n" }), { reason: "vocab", mine: "x", correct: "", note: "n" });
  assert.throws(() => cleanMistake({ reason: "bad" }), /Alasan/);
  assert.deepEqual(cleanCard({ front: " decline ", back: "fall", source: { kind: "evil" } }).source, { kind: "manual", ref: "" });
  assert.throws(() => cleanCard({ front: "", back: "x" }), /depan/);
  assert.equal(cleanGrade({ grade: "3" }), 3);
  assert.throws(() => cleanGrade({ grade: 5 }), /0–3/);
});

test("a version-1 database becomes the first profile, with a backup", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createStore } = await import("../lib/store.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ielts-store-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({ settings: { examDate: "2026-12-06" }, attempts: [{ id: "x" }], tests: { u: {} } }));
  const store = createStore(dir);
  const p1 = store.profile();
  assert.equal(p1.name, "Saya");
  assert.equal(p1.settings.examDate, "2026-12-06");
  assert.deepEqual(p1.drillAttempts, []);
  assert.deepEqual(p1.cards, []);
  assert.deepEqual(Object.keys(store.db.tests), ["u"]);
  assert.ok(fs.existsSync(path.join(dir, "db.v1-backup.json")));
  const p2 = store.addProfile("Istri");
  assert.equal(store.profile(p2.id).name, "Istri");
  assert.equal(store.profile("nope").id, "p1");
  fs.rmSync(dir, { recursive: true });
});
