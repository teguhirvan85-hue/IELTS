# Writing lessons and drills for IELTS Coach

The learner is an Indonesian adult preparing for IELTS (current band unknown, probably
5.5–6.5), studying 20–60 minutes a day and taking practice tests on engnovate.com.
Lessons teach the strategy for one question type; each lesson ends with interactive
drills that are marked automatically.

**The reference is `lessons/tfng.md` + `drills/tfng-1.json`.** Match their depth, tone,
structure and quality. Read both before writing anything.

## Hard rules

1. **Everything is original.** Never copy or closely paraphrase Cambridge IELTS, official
   IELTS, or any published test material. Write new passages, scripts and questions.
2. **No invented facts about real, named organisations or people.** Use generic subjects
   ("a large national railway", "researchers at one university in Canada") or clearly
   fictional names. General knowledge that is well established is fine.
3. **Lesson text is Indonesian** (clear, natural, precise, friendly but not slangy; use
   "kamu"). IELTS terms, passages, scripts, questions and options are **English**.
   Explanations (`explain`) are Indonesian and quote the English words they rely on.
4. **Validate.** From the project root run `node scripts/check-content.js` until it reports
   0 errors for your files. ("audio not generated yet" warnings are expected for listening.)
5. Only create the files you are assigned. Do not edit `lib/`, `public/`, `server.js`, other
   content files, and do not generate audio.

## Lesson file: `lessons/<id>.md`

```
---
id: <id, same as file name>
title: <IELTS name of the question type>
skill: reading | listening
types: <comma-separated type ids this lesson covers, exactly as assigned>
summary: <one Indonesian sentence, max ~110 characters>
order: <number, as assigned>
---
## Apa yang diuji
...
```

Sections (use `##`; at least these, in this order, 450–800 words in total):

- **Apa yang diuji**: what the task looks like and what skill it tests.
- One section on the core decision or idea of this type (like "FALSE atau NOT GIVEN?").
- **Jebakan yang sering muncul**: the traps, with at least one `::: trap <title>` box.
- **Langkah mengerjakan**: numbered steps, concrete and in exam order.
- At least one `::: example <title>` box with a short original worked example.
- Optional `::: tip <title>` box.
- **Waktu**: a short timing note.

Markdown subset only: `##`/`###` headings, paragraphs, `-` and `1.` lists, `| tables |`
(with a `| --- |` separator row), `> quote`, `::: tip|trap|example Title` … `:::` boxes,
`**bold**`, `*italic*`. Nothing else renders (no images, no HTML, no nested lists).

## Drill file: `drills/<id>.json`

Common fields:

| field | meaning |
| --- | --- |
| `id` | same as file name, e.g. `headings-1` |
| `lesson` | the lesson id |
| `skill` | `reading` or `listening` (same as the lesson) |
| `title` | short English title of the passage/recording |
| `minutes` | realistic time in minutes |
| `instruction` | the IELTS-style instruction, exactly as the real test words it |
| `input` | `choice`, `multi` or `text` (see below) |
| `questions` | 5–8 points in total, numbered consecutively from 1 |
| `variant` | optional short Indonesian label shown with the drill, e.g. "Gaya General Training · Section 1" |

Every question has `n`, `answer`, `explain` (Indonesian, 1–3 sentences, say *why*: the
paraphrase pair or the trap) and `evidence`: an **exact, character-for-character quote from
one single paragraph (reading) or one script line (listening)** that proves the answer. It
is highlighted after marking. Use `null` only when nothing in the text applies (typically
NOT GIVEN). Use straight apostrophes `'` everywhere, in the text and in the quote.

Spread the answers: no option should be the answer to most questions, and matching tasks
need distractors (options that are never used).

### Reading passage

```json
"passage": {
  "title": "The Return of the Night Train",
  "paragraphs": [ { "label": "A", "text": "…" }, { "label": "B", "text": "…" } ]
}
```

250–450 words, IELTS Academic register (band 6–7 vocabulary, some longer sentences),
4–7 paragraphs. Give paragraphs a `label` (A, B, C…) only when the task refers to them
(headings, matching information); otherwise omit `label`.

### `input: "choice"`, one shared option list

T/F/NG style, where the option is its own label:

```json
"options": [ { "key": "YES", "text": "YES" }, { "key": "NO", "text": "NO" }, { "key": "NOT GIVEN", "text": "NOT GIVEN" } ]
```

Lettered or numbered lists (headings, people, sentence endings, map letters) are printed
once above the questions and answered by key:

```json
"optionsTitle": "List of Headings",
"options": [ { "key": "i", "text": "Why early attempts failed" }, … ],
"questions": [ { "n": 1, "prompt": "Paragraph B", "answer": "iv", … } ]
```

For "Which paragraph contains…" tasks use plain letters as options
(`{ "key": "A", "text": "A" }`) so they show as buttons.

### `input: "choice"`, multiple choice per question

Each question carries its own `choices`; no drill-level `options`:

```json
{ "n": 3, "prompt": "What does the writer say about…?", "choices": [ { "key": "A", "text": "…" }, { "key": "B", "text": "…" }, { "key": "C", "text": "…" }, { "key": "D", "text": "…" } ], "answer": "C", … }
```

### Choose TWO

One question object covers two numbers. Allowed inside a `choice` drill or in a `multi` drill:

```json
{ "n": [5, 6], "prompt": "Which TWO benefits does the writer mention?", "choices": [ A–E ], "answer": ["B", "E"], "evidence": "…", "explain": "…" }
```

### `input: "text"`, gap-fill

```json
"input": "text",
"wordLimit": 2,
"instruction": "Complete the notes below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
"context": {
  "kind": "notes",
  "title": "Night trains",
  "lines": ["# Reasons for decline", "- competition from [[1]]", "- high cost of maintaining [[2]]"]
},
"questions": [ { "n": 1, "answer": "low-cost airlines", "accept": ["airlines"], "evidence": "…", "explain": "…" } ]
```

- `context.kind`: `notes`, `form`, `summary` (lines are paragraphs), `flow` (each line is a
  box, arrows are drawn between them) or `table` (use `rows`: first row is the header).
- In `lines`: `# ` makes a sub-heading, `- ` a bullet, anything else a plain line.
- Every question number appears exactly once as `[[n]]` in the context. For sentence
  completion without a context, put `[[n]]` inside each question's `prompt` instead.
- Answers come word-for-word from the passage or script and fit `wordLimit`. Put real
  alternatives in `accept` (spelling variants such as colour/color, "15"/"fifteen", a
  shorter correct form). The gap must be grammatical with the answer.
- The instruction states the limit in IELTS wording ("ONE WORD ONLY", "NO MORE THAN TWO
  WORDS AND/OR A NUMBER", "ONE WORD AND/OR A NUMBER").

### Listening

No `passage`. Instead:

```json
"script": [
  { "speaker": "Narrator", "voice": "Daniel", "text": "You will hear a woman phoning a sports centre. First, you have some time to look at questions 1 to 6." },
  { "speaker": "Narrator", "voice": "Daniel", "text": "Now listen carefully and answer questions 1 to 6." },
  { "speaker": "Receptionist", "voice": "Karen", "text": "Good morning, Riverside Sports Centre, how can I help?" }
]
```

- Voices (macOS text-to-speech): `Daniel` (British male), `Karen` (Australian female),
  `Moira` (Irish female), `Samantha` (American female), `Rishi` (Indian male), `Tara`
  (Indian female). The narrator is `Daniel` unless Daniel is also a speaker, then `Moira`.
  Two speakers in a conversation must use different voices.
- 300–500 spoken words (2–3.5 minutes). Keep each line under ~300 characters.
- Natural spoken English with real IELTS distractors: a speaker first gives one detail and
  then corrects it, an option is mentioned but rejected, numbers and names are spelled out.
  Write spelled letters as `"B, R, O, W, N, E"` so the voice reads them one by one.
- Questions follow the order of the recording.
- `evidence` quotes one script line exactly.
- Map or plan tasks: draw `img/<drill-id>.svg` (viewBox about 640×420; simple shapes, light
  fills, dark #1C1B19 strokes and text, sans-serif text at least 13px; label the known
  places by name, mark the unknown places with letters A–H; include an entrance or a
  compass "N"). Set `"image": "<drill-id>.svg"` and `"imageAlt"` (English description), and
  use the letters as shared `options` (`{ "key": "A", "text": "A" }`).

## General Training reading texts

GT Reading uses everyday and workplace texts instead of one long academic passage:
Section 1 has several short texts (adverts, notices, timetables, product descriptions),
Section 2 has workplace texts (staff policies, job adverts, training information), and
Section 3 is one longer general-interest text. When a drill is in GT style, set
`"variant": "Gaya General Training · Section 1"` (or 2/3), write the text in that genre
(several short texts each get a paragraph `label` A–F with a heading-like first line inside
the text), and keep the same question-type rules.
