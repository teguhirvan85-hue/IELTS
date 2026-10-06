// Lesson cards shared by the dashboard ("Materi untukmu") and the Materi page: a glass
// icon, the lesson's drills and a segmented bar with one segment per drill question.
import { SKILLS, lessonFor, typeStats } from "/shared.js";
import { h, icon } from "/ui.js";

// Starting points before any test is logged: the types that show up most often.
const STARTERS = ["tfng", "completion", "l-completion"];

// Accuracy per lesson from logged engnovate tests: question types folded into their lesson.
export function lessonStats(attempts) {
  const by = new Map();
  for (const skill of ["reading", "listening"]) {
    for (const s of typeStats(attempts, skill)) {
      const id = lessonFor(skill, s.type);
      if (!id) continue;
      const cur = by.get(id) || { correct: 0, total: 0, lost: 0 };
      cur.correct += s.correct;
      cur.total += s.total;
      cur.lost += s.lost;
      by.set(id, cur);
    }
  }
  return by;
}

// The lessons to work on next: those whose question types cost the most points, else the
// most common types. `weak` says which of the two it is.
export function focusLessons(lessons, stats) {
  const weak = lessons
    .filter((l) => {
      const s = stats.get(l.id);
      return s && s.total >= 3 && s.correct / s.total < 0.75 && s.lost > 0;
    })
    .sort((a, b) => stats.get(b.id).lost - stats.get(a.id).lost)
    .slice(0, 3);
  return weak.length ? { weak: true, list: weak } : { weak: false, list: lessons.filter((l) => STARTERS.includes(l.id)) };
}

function progressBar(lesson, drillAttempts) {
  const tried = new Set(drillAttempts.filter((a) => a.lesson === lesson.id).map((a) => a.drill));
  const segments = lesson.drills.flatMap((d) => Array.from({ length: d.count || 1 }, () => tried.has(d.id)));
  const left = lesson.drills.filter((d) => !tried.has(d.id)).length;
  const label = left ? `${left} latihan lagi` : "✓ Semua latihan";
  return h("div", { class: "segbar", role: "img", "aria-label": `${lesson.drills.length - left} dari ${lesson.drills.length} latihan dikerjakan` },
    h("span", { class: "segs", "aria-hidden": "true" }, segments.map((on) => h("i", { class: on ? "on" : null }))),
    h("span", { class: "seg-label", "aria-hidden": "true", text: label }));
}

export function lessonCard(lesson, { stats, drillAttempts = [], index = 0, summary = false } = {}) {
  const pct = stats?.total ? Math.round((stats.correct / stats.total) * 100) : null;
  const minutes = lesson.drills.reduce((m, d) => m + (d.minutes || 0), 0);
  const meta = [
    lesson.drills.length ? `${lesson.drills.length} latihan` : "Latihan menyusul",
    minutes ? `±${minutes} menit` : null,
    pct != null ? `${pct}% benar di tes` : null,
  ].filter(Boolean);
  return h("a", { class: "lesson-card", href: `/learn/${lesson.id}` },
    h("div", { class: "lc-main" },
      h("span", { class: "lc-skill", text: SKILLS[lesson.skill].label }),
      h("h3", { text: lesson.title }),
      h("p", { class: "lc-meta" }, meta.flatMap((m, i) => (i ? [h("span", { class: "dot-sep", "aria-hidden": "true", text: "•" }), m] : [m])))),
    h("span", { class: `lc-thumb t${index % 4}`, "aria-hidden": "true" },
      h("span", { class: "glass" }, icon(lesson.skill === "listening" ? "headphones" : "learn"))),
    summary ? h("p", { class: "lc-summary", text: lesson.summary }) : null,
    lesson.drills.length ? progressBar(lesson, drillAttempts) : null);
}
