# Writing content for IELTS Coach

Two learners use this app: one takes **IELTS General Training** (works in IT), one takes
**IELTS Academic** (works in healthcare). Both are Indonesian and aim for band 7.0 in every skill.
Guides are written in Indonesian (natural, precise, "kamu"); task prompts, example
sentences and model answers are in English.

The Writing lab shows a task prompt, the learner writes an answer, and Claude marks it
against the IELTS public band descriptors. Your job is the prompt bank and the guides.

## Hard rules

1. **Everything is original.** Never copy or closely paraphrase Cambridge IELTS, official
   IELTS, or any published task. Invent new situations, statements and data.
2. **Charts use invented data about generic subjects**: "Country A/B/C", "a city in
   Europe", "one university", "four age groups". Never present invented numbers as real
   facts about a real, named country, company or organisation.
3. Prompts must match the real test's wording and format exactly (see below).
4. Validate: from the project root run `node scripts/check-content.js` until 0 errors.
5. Only create the files you are assigned. Do not edit code, other content, or restart
   anything.

## Prompt files: `writing/<file>.json`

Each file is a JSON array of prompt objects. Common fields:

| field | meaning |
| --- | --- |
| `id` | unique, e.g. `gt1-03`, `ac1-02`, `t2-07` (use your file's prefix) |
| `task` | `1` or `2` |
| `module` | `general` or `academic` for Task 1; `both` for Task 2 |
| `kind` | see each task below |
| `title` | short English title for the list, e.g. "Complaint about a delayed delivery" |
| `topic` | one or two English words: work, health, technology, environment, education, housing, travel, society… |

### General Training Task 1 (letters) — `module: "general"`

`kind`: `formal`, `semi-formal` or `informal` (mix them; about a third each).

```json
{
  "id": "gt1-01", "task": 1, "module": "general", "kind": "formal", "topic": "housing",
  "title": "Problems with a rented flat",
  "situation": "You recently moved into a rented flat, but several things in it do not work properly.",
  "recipient": "the letting agent",
  "bullets": ["describe the problems", "explain how they are affecting you", "say what you would like the agent to do"],
  "opening": "Dear Sir or Madam,"
}
```

The app prints it as the real test does: the situation, "Write a letter to <recipient>.
In your letter", the three bullets, "Write at least 150 words. You do NOT need to write
any addresses. Begin your letter as follows:" and the opening. Exactly three bullets.
Openings: formal "Dear Sir or Madam,"; semi-formal "Dear Mr/Ms <Surname>," (invent a
surname); informal "Dear <First name>,".

### Academic Task 1 (charts) — `module: "academic"`

`kind`: `line`, `bar`, `pie` or `table`.

```json
{
  "id": "ac1-01", "task": 1, "module": "academic", "kind": "line", "topic": "transport",
  "title": "Commuting by bicycle in three cities",
  "prompt": "The graph below shows the percentage of workers who cycled to work in three cities between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
  "chart": {
    "title": "Workers cycling to work, 2000–2020",
    "unit": "%",
    "categories": ["2000", "2005", "2010", "2015", "2020"],
    "series": [
      { "name": "City A", "values": [4, 6, 9, 13, 18] },
      { "name": "City B", "values": [12, 11, 10, 10, 9] },
      { "name": "City C", "values": [2, 2, 3, 5, 8] }
    ]
  }
}
```

- `line`: `categories` are the time points (x-axis); 1–4 `series`, one value per category.
- `bar`: `categories` are the groups on the x-axis; 1–4 `series` (grouped bars).
- `pie`: `categories` are the slice labels; each `series` is one pie (usually two pies,
  named by year or group); values in each pie add up to 100 and `unit` is `%`.
- `table`: `categories` are the row labels; each `series` is one column.
- Data must have a clear story an examiner would expect in an overview (a trend, a
  crossover, a biggest/smallest, a contrast) plus a few details worth comparing.
- 3–8 categories. Round, realistic numbers. The prompt sentence must describe exactly
  what the chart shows (subject, unit, place, time).

### Task 2 (essays) — `module: "both"`

`kind`: `opinion` (to what extent do you agree or disagree), `discussion` (discuss both
views and give your own opinion), `problem` (causes/problems and solutions),
`advantages` (do the advantages outweigh the disadvantages), `two-part` (two direct
questions).

```json
{
  "id": "t2-01", "task": 2, "module": "both", "kind": "opinion", "topic": "work",
  "title": "Working from home",
  "prompt": "Some people believe that employees who work from home are more productive than those who work in an office. To what extent do you agree or disagree?"
}
```

The app adds "Give reasons for your answer and include any relevant examples from your
own knowledge or experience. Write at least 250 words." Write the statement and question
only, in the real test's style. Discussion prompts end with "Discuss both these views and
give your own opinion."; the other kinds end with a question.

## Guide files: `writing/guide-<name>.md`

Plain Markdown with the same subset as lessons (no front matter): `##`/`###` headings,
paragraphs, `-`/`1.` lists, `| tables |` with a `| --- |` row, `> quote`,
`::: tip|trap|example Title` … `:::` boxes, `**bold**`, `*italic*`. 600–1000 words.

Each guide covers, in this order:

- **Apa yang dinilai**: the four criteria for this task, in plain Indonesian, and what
  separates band 6 from band 7 for each (paraphrase the public band descriptors; do not
  copy them).
- **Struktur**: a paragraph-by-paragraph plan with what goes in each.
- **Bahasa yang berguna**: short English phrase banks for this task, grouped by purpose.
- **Jebakan**: the common mistakes that keep candidates at band 6 (at least one
  `::: trap` box).
- **Contoh**: one short original model (a full letter for GT Task 1; an overview plus one
  detail paragraph for Academic Task 1; an introduction plus one body paragraph for Task 2)
  in a `::: example` box, with a one-line Indonesian note on why it works.
- **Waktu**: how to split the minutes (plan, write, check).
