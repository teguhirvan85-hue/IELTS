import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAttempt, cleanSettings } from "../lib/validate.js";

const base = { skill: "reading", module: "academic", title: "T", date: "2026-10-06", groups: [{ from: 1, to: 13, part: 1, type: "tfng", wrong: [3, 3, 99] }] };

test("wrong numbers are deduped and kept inside their group", () => {
  assert.deepEqual(cleanAttempt(base).groups[0].wrong, [3]);
});

test("overlapping groups are rejected", () => {
  assert.throws(() => cleanAttempt({ ...base, groups: [...base.groups, { from: 13, to: 20, type: "mcq" }] }), /dua grup/);
});

test("unknown question type falls back to other", () => {
  assert.equal(cleanAttempt({ ...base, groups: [{ from: 1, to: 2, type: "<script>" }] }).groups[0].type, "other");
});

test("skipping every part is rejected", () => {
  assert.throws(() => cleanAttempt({ ...base, skippedParts: [1] }), /dilewati/);
});

test("writing keeps band and criteria in half steps", () => {
  const a = cleanAttempt({ skill: "writing", date: "2026-10-06", band: 6.5, criteria: { ta: 6, cc: "7", lr: null, gra: 6.5, extra: 9 } });
  assert.equal(a.band, 6.5);
  assert.deepEqual(a.criteria, { ta: 6, cc: 7, lr: null, gra: 6.5 });
  assert.throws(() => cleanAttempt({ skill: "writing", date: "2026-10-06", band: 6.3 }), /0.5/);
});

test("non-engnovate links and bad dates are rejected", () => {
  assert.throws(() => cleanAttempt({ ...base, url: "https://example.com/" }), /engnovate/);
  assert.throws(() => cleanAttempt({ ...base, date: "06/10/2026" }), /Tanggal/);
});

test("settings", () => {
  assert.deepEqual(cleanSettings({ examDate: "2026-12-06", targetBand: 6.5, module: null }), { examDate: "2026-12-06", targetBand: 6.5, module: null });
  assert.throws(() => cleanSettings({ module: "kids" }), /Modul/);
});
