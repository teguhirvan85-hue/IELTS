import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeDrill, normalizeAnswer, wordCount, lessonFor, countQuestions } from "../public/shared.js";
import { renderMarkdown } from "../public/md.js";
import { parseLesson } from "../lib/content.js";
import { cleanDrillAnswers } from "../lib/validate.js";

const choice = {
  input: "choice",
  options: [{ key: "TRUE", text: "TRUE" }, { key: "FALSE", text: "FALSE" }, { key: "NOT GIVEN", text: "NOT GIVEN" }],
  questions: [
    { n: 1, answer: "TRUE" },
    { n: 2, answer: "NOT GIVEN" },
    { n: [3, 4], answer: ["B", "D"], choices: [] },
  ],
};

test("choice and choose-TWO marking", () => {
  const r = gradeDrill(choice, { 1: "TRUE", 2: "FALSE", "3-4": ["D", "A"] });
  assert.equal(r.correct, 2);
  assert.equal(r.total, 4);
  assert.deepEqual(r.results["3-4"], { points: 1, max: 2, ok: false, overLimit: false });
  assert.equal(countQuestions(choice), 4);
});

test("gap-fill marking: case, spacing, variants and the word limit", () => {
  const drill = { input: "text", wordLimit: 2, questions: [{ n: 1, answer: "night trains", accept: ["trains"] }, { n: 2, answer: "1998" }, { n: 3, answer: "colour" }] };
  assert.equal(gradeDrill(drill, { 1: "  Night   Trains. ", 2: "1998", 3: "color" }).correct, 2);
  assert.equal(gradeDrill(drill, { 1: "trains" }).results["1"].ok, true);
  const over = gradeDrill(drill, { 1: "the night trains" }).results["1"];
  assert.equal(over.ok, false);
  assert.equal(over.overLimit, true);
});

test("numbers are free under AND/OR A NUMBER", () => {
  const drill = { input: "text", wordLimit: 2, instruction: "Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.", questions: [{ n: 1, answer: "3 large boxes" }, { n: 2, answer: "£25" }] };
  const r = gradeDrill(drill, { 1: "3 large boxes", 2: "£25" });
  assert.equal(r.correct, 2);
  const strict = { ...drill, instruction: "Write NO MORE THAN TWO WORDS for each answer." };
  assert.equal(gradeDrill(strict, { 1: "3 large boxes" }).results["1"].overLimit, true);
});

test("answer helpers", () => {
  assert.equal(normalizeAnswer("  It’s  DONE! "), "it's done");
  assert.equal(wordCount("low-cost airlines"), 2);
  assert.equal(wordCount(""), 0);
});

test("question types map to lessons", () => {
  assert.equal(lessonFor("reading", "tfng"), "tfng");
  assert.equal(lessonFor("reading", "summary"), "completion");
  assert.equal(lessonFor("listening", "form"), "l-completion");
  assert.equal(lessonFor("listening", "map"), "l-map");
  assert.equal(lessonFor("reading", "map"), null);
});

test("markdown subset escapes HTML and renders blocks", () => {
  const html = renderMarkdown(`## Judul\n\nTeks **tebal** dan *miring* <script>x</script>\n\n- satu\n- dua\n\n::: trap Awas\nIsi kotak\n:::\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n:::`);
  assert.match(html, /<h2>Judul<\/h2>/);
  assert.match(html, /<strong>tebal<\/strong> dan <em>miring<\/em> &lt;script&gt;/);
  assert.match(html, /<ul><li>satu<\/li><li>dua<\/li><\/ul>/);
  assert.match(html, /<div class="box box-trap"><p class="box-title">Awas<\/p><p>Isi kotak<\/p><\/div>/);
  assert.match(html, /<th>A<\/th><th>B<\/th>.*<td>1<\/td><td>2<\/td>/s);
  assert.doesNotMatch(html, /<script>/);
});

test("lesson front matter", () => {
  const { meta, body } = parseLesson("---\nid: x\ntitle: X\nskill: reading\ntypes: tfng, ynng\norder: 3\n---\n## A\n");
  assert.deepEqual(meta.types, ["tfng", "ynng"]);
  assert.equal(meta.order, 3);
  assert.equal(body, "## A\n");
});

test("drill answers from the browser are cleaned", () => {
  const out = cleanDrillAnswers(choice, { answers: { 1: "TRUE", 2: "", "3-4": ["B", 7, "D"], 99: "x" } });
  assert.deepEqual(out, { 1: "TRUE", "3-4": ["B", "D"] });
  assert.throws(() => cleanDrillAnswers(choice, { answers: { 1: 5 } }), /tidak valid/);
});
