# Speaking question bank for IELTS Coach

Two Indonesian learners use this app (one works in IT, one in healthcare). Both aim for
band 7.0. Speaking is the same for Academic and
General Training. Questions are English; there is no Indonesian text in these files.

## Rules

1. **Original wording.** Use the usual IELTS topic areas, but write every question and cue
   card yourself; never copy published or "recent exam" lists.
2. Natural examiner English, exactly in the style of the real test.
3. Validate from the project root: `node scripts/check-content.js` must report 0 errors.
4. Only create the files you are assigned.

## `speaking/part1.json` — array of topic sets

```json
{ "id": "p1-01", "topic": "Work or studies", "questions": ["Do you work or are you a student?", "…"] }
```

- 4–5 short, personal questions per topic, moving from simple to slightly more reflective.
- The first set must be "Work or studies"; include "Hometown" and "Home" sets too.

## `speaking/part2.json` — array of cue cards, each with its Part 3 discussion

```json
{
  "id": "p2-01",
  "topic": "skills",
  "cue": "Describe a skill you learned as an adult.",
  "bullets": ["what the skill is", "when and how you learned it", "how long it took you to learn it"],
  "last": "and explain how this skill has been useful to you.",
  "part3": ["What skills do you think young people should learn at school?", "…"]
}
```

- `cue` starts with "Describe". Exactly three `bullets`, then `last` starting with "and explain"
  or "and say".
- `part3`: 4–6 abstract discussion questions linked to the cue card's theme (society,
  comparison, past vs future, causes and effects), each ending with "?".
