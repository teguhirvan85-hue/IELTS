import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseTest, normalizeUrl } from "../lib/engnovate.js";

// The fixtures are trimmed engnovate test pages. They contain published test material, so
// they stay on this Mac and are not in the repository; these tests skip without them.
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), "utf8");
const hasFixtures = fs.existsSync(new URL("./fixtures/reading-academic.html", import.meta.url));
const ftest = hasFixtures ? test : test.skip;
const layout = (t) => t.groups.map((g) => `${g.part}:${g.from}-${g.to}:${g.type}`);

ftest("Academic Reading layout", () => {
  const t = parseTest(fixture("reading-academic"), "https://engnovate.com/ielts-reading-tests/cambridge-ielts-20-academic-reading-test-1/");
  assert.equal(t.title, "Cambridge IELTS 20 Academic Reading Test 1");
  assert.equal(t.skill, "reading");
  assert.equal(t.module, "academic");
  assert.deepEqual(layout(t), ["1:1-6:tfng", "1:7-13:notes", "2:14-18:matching_info", "2:19-23:matching_features", "2:24-26:summary", "3:27-30:mcq", "3:31-35:endings", "3:36-40:ynng"]);
  assert.equal(t.groups[0].prompts[2], "Adult kakapo produce chicks every year.");
  assert.match(t.groups[1].prompts[7], /___/);
});

ftest("Academic Reading with multi-answer questions", () => {
  const t = parseTest(fixture("reading-academic-2"), "https://engnovate.com/ielts-reading-tests/x/");
  assert.deepEqual(layout(t), ["1:1-7:notes", "1:8-13:tfng", "2:14-18:matching_info", "2:19-22:sentence", "2:23-24:mcq_multi", "2:25-26:mcq_multi", "3:27-32:summary", "3:33-37:ynng", "3:38-40:mcq"]);
  assert.match(t.groups[4].prompts[24], /^Which TWO facts/);
});

ftest("General Training Reading", () => {
  const t = parseTest(fixture("reading-general"), "https://engnovate.com/ielts-reading-tests/x/");
  assert.equal(t.module, "general");
  assert.equal(t.groups.at(-1).from, 40);
  assert.equal(t.groups.reduce((n, g) => n + g.to - g.from + 1, 0), 40);
});

ftest("Listening has four parts", () => {
  const t = parseTest(fixture("listening"), "https://engnovate.com/ielts-listening-tests/cambridge-ielts-20-academic-listening-test-1/");
  assert.equal(t.skill, "listening");
  assert.deepEqual([...new Set(t.groups.map((g) => g.part))], [1, 2, 3, 4]);
  assert.equal(t.groups.reduce((n, g) => n + g.to - g.from + 1, 0), 40);
  assert.ok(!t.groups[0].instruction.includes("Listen From Here"));
});

test("only engnovate links are accepted", () => {
  assert.equal(normalizeUrl("http://www.engnovate.com/ielts-reading-tests/a/?utm_source=x#top"), "https://engnovate.com/ielts-reading-tests/a/");
  assert.throws(() => normalizeUrl("https://evil.example/ielts-reading-tests/a/"), /engnovate/);
  assert.throws(() => normalizeUrl("file:///etc/passwd"), /engnovate/);
  assert.throws(() => normalizeUrl("not a url"), /tidak valid/);
});
