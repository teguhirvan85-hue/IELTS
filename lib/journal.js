// The mistake journal: every wrong answer in one profile's logged Listening/Reading tests
// (newest test first), with the question text from the shared engnovate layout cache and
// the reason given. Reasons live in profile.mistakes under "<attempt id>:<question number>".
import { OBJECTIVE } from "../public/shared.js";

export function mistakeKey(attemptId, n) {
  return `${attemptId}:${n}`;
}

export function buildJournal(profile, tests) {
  const items = [];
  const attempts = profile.attempts
    .filter((a) => OBJECTIVE.has(a.skill))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  for (const a of attempts) {
    const skipped = new Set(a.skippedParts || []);
    const test = a.url ? tests[a.url] : null;
    for (const g of a.groups) {
      if (skipped.has(g.part)) continue;
      const tg = test?.groups.find((t) => t.from === g.from && t.to === g.to);
      for (const n of g.wrong) {
        const key = mistakeKey(a.id, n);
        const m = profile.mistakes[key] || {};
        items.push({
          key, attempt: a.id, date: a.date, title: a.title, url: a.url, skill: a.skill, type: g.type, n,
          prompt: tg?.prompts?.[n] || null,
          reason: m.reason || null, mine: m.mine || "", correct: m.correct || "", note: m.note || "",
        });
      }
    }
  }
  return items;
}

// Drops reasons for questions that are no longer marked wrong (attempt edited or deleted).
export function pruneMistakes(profile, tests) {
  const live = new Set(buildJournal(profile, tests).map((i) => i.key));
  for (const key of Object.keys(profile.mistakes)) if (!live.has(key)) delete profile.mistakes[key];
}
