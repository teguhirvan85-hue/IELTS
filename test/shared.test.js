import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyInstruction, rawToBand, roundBand, scoreAttempt, typeStats, parseNumberList, formatNumberList, daysUntil } from "../public/shared.js";

test("question types from instruction text", () => {
  const cases = {
    "Do the following statements agree with the information given in Reading Passage 1? write TRUE if the statement agrees": "tfng",
    "Do the following statements agree with the claims of the writer? write YES if the statement agrees with the claims": "ynng",
    "Choose the correct heading for each paragraph from the list of headings below.": "headings",
    "Complete each sentence with the correct ending, A-G, below.": "endings",
    "Label the map below. Write the correct letter, A-H, next to Questions 11-15.": "map",
    "Label the diagram below. Choose ONE WORD ONLY from the passage.": "diagram",
    "Choose TWO letters, A-E.": "mcq_multi",
    "Complete the flow-chart below.": "flowchart",
    "Complete the table below. Write ONE WORD AND/OR A NUMBER for each answer.": "table",
    "Complete the form below.": "form",
    "Complete the notes below.": "notes",
    "Complete the summary using the list of phrases, A-K, below.": "summary",
    "Complete the sentences below.": "sentence",
    "Reading Passage 2 has seven paragraphs, A–G. Which section contains the following information?": "matching_info",
    "Look at the six reviews of campsites, A–F. For which campsite are the following statements true?": "matching_info",
    "Look at the following statements and the list of people below. Match each statement with the correct person, A, B or C.": "matching_features",
    "What does the speaker say about each place? Choose FIVE answers from the box and write the correct letter, A-G, next to Questions 15-20.": "matching_features",
    "Answer the questions below. Choose NO MORE THAN THREE WORDS from the passage.": "short",
    "Choose the correct letter, A, B, C or D.": "mcq",
    "Something unexpected": "other",
  };
  for (const [text, type] of Object.entries(cases)) assert.equal(classifyInstruction(text), type, text);
});

test("raw score to band", () => {
  assert.equal(rawToBand("listening", null, 40), 9);
  assert.equal(rawToBand("listening", null, 30), 7);
  assert.equal(rawToBand("listening", null, 29), 6.5);
  assert.equal(rawToBand("listening", null, 23), 6);
  assert.equal(rawToBand("reading", "academic", 30), 7);
  assert.equal(rawToBand("reading", "academic", 26), 6);
  assert.equal(rawToBand("reading", "academic", 15), 5);
  assert.equal(rawToBand("reading", "general", 34), 7);
  assert.equal(rawToBand("reading", "general", 30), 6);
  assert.equal(rawToBand("reading", "general", 23), 5);
  assert.equal(rawToBand("reading", "academic", 0), 0);
});

test("overall rounding: .25 and .75 round up", () => {
  assert.equal(roundBand(6.125), 6);
  assert.equal(roundBand(6.25), 6.5);
  assert.equal(roundBand(6.75), 7);
  assert.equal(roundBand(6.625), 6.5);
});

const reading = (wrong, skippedParts = []) => ({
  id: "a1",
  skill: "reading",
  module: "academic",
  skippedParts,
  groups: [
    { from: 1, to: 13, part: 1, type: "tfng", wrong: wrong.filter((n) => n <= 13) },
    { from: 14, to: 26, part: 2, type: "headings", wrong: wrong.filter((n) => n >= 14 && n <= 26) },
    { from: 27, to: 40, part: 3, type: "mcq", wrong: wrong.filter((n) => n >= 27) },
  ],
});

test("full test gets a real band", () => {
  const s = scoreAttempt(reading([1, 2, 14, 15, 16, 30, 31, 32, 33, 34]));
  assert.deepEqual({ correct: s.correct, total: s.total, full: s.full, band: s.band, estimate: s.estimate }, { correct: 30, total: 40, full: true, band: 7, estimate: false });
});

test("skipped parts are not counted and give an estimate", () => {
  const s = scoreAttempt(reading([1, 2, 3, 14], [2, 3]));
  assert.equal(s.total, 13);
  assert.equal(s.correct, 10);
  assert.equal(s.full, false);
  assert.equal(s.estimate, true);
  assert.equal(s.band, rawToBand("reading", "academic", Math.round((10 / 13) * 40)));
});

test("writing and speaking use the entered band", () => {
  assert.equal(scoreAttempt({ skill: "writing", band: 6.5 }).band, 6.5);
  assert.equal(scoreAttempt({ skill: "speaking", band: null }).band, null);
});

test("type stats sort by points lost", () => {
  const stats = typeStats([reading([14, 15, 16, 17, 1]), { ...reading([18]), id: "a2" }], "reading");
  assert.equal(stats[0].type, "headings");
  assert.equal(stats[0].lost, 5);
  assert.equal(stats[0].total, 26);
  assert.equal(stats[0].tests, 2);
  assert.equal(stats.find((s) => s.type === "mcq").lost, 0);
});

test("number lists", () => {
  assert.deepEqual(parseNumberList("3, 5, 12-14 41 0 x 7–6"), [3, 5, 6, 7, 12, 13, 14]);
  assert.equal(formatNumberList([14, 3, 12, 13, 5, 6]), "3, 5, 6, 12-14");
});

test("days until exam", () => {
  assert.equal(daysUntil("2026-12-06", new Date(2026, 9, 6, 22, 30)), 61);
  assert.equal(daysUntil(null), null);
});
