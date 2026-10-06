import { SKILLS, lessonFor, scoreAttempt, typeStats } from "/shared.js";
import { $, h, api } from "/ui.js";

// Starting points before any test is logged: the types that show up most often.
const STARTERS = ["tfng", "completion", "l-completion"];

// Accuracy per lesson from logged engnovate tests: question types folded into their lesson.
function lessonStats(attempts) {
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

function lastDrill(drillAttempts, lessonId) {
  return drillAttempts.filter((a) => a.lesson === lessonId).at(-1) || null;
}

function card(lesson, stats, last) {
  const pct = stats?.total ? Math.round((stats.correct / stats.total) * 100) : null;
  const drillCount = lesson.drills.length;
  const minutes = lesson.drills.reduce((m, d) => m + (d.minutes || 0), 0);
  return h("a", { class: "lesson-card", href: `/learn/${lesson.id}` },
    h("span", { class: "lc-skill", text: SKILLS[lesson.skill].label }),
    h("h3", { text: lesson.title }),
    h("p", { class: "lc-summary", text: lesson.summary }),
    h("div", { class: "lc-meta" },
      pct != null ? h("span", { text: `Di tes: ${stats.correct}/${stats.total} benar (${pct}%)` }) : null,
      last ? h("span", { text: `Latihan terakhir: ${last.correct}/${last.total}` }) : drillCount ? h("span", { text: `${drillCount} latihan · ±${minutes} menit` }) : h("span", { text: "Latihan menyusul" })
    )
  );
}

async function load() {
  const [lessons, state] = await Promise.all([api("/api/lessons"), api("/api/state")]);
  const attempts = state.attempts.map((a) => ({ ...a, score: scoreAttempt(a) }));
  const stats = lessonStats(attempts);
  const drillAttempts = state.drillAttempts || [];
  const make = (l) => card(l, stats.get(l.id), lastDrill(drillAttempts, l.id));

  $("#reading-list").replaceChildren(...lessons.filter((l) => l.skill === "reading").map(make));
  $("#listening-list").replaceChildren(...lessons.filter((l) => l.skill === "listening").map(make));

  // Weakest first: the lessons whose question types cost the most points in logged tests.
  const weak = lessons
    .filter((l) => {
      const s = stats.get(l.id);
      return s && s.total >= 3 && s.correct / s.total < 0.75 && s.lost > 0;
    })
    .sort((a, b) => stats.get(b.id).lost - stats.get(a.id).lost)
    .slice(0, 3);
  if (weak.length) {
    $("#focus-note").textContent = "Tipe soal yang paling banyak membuang poin di tes engnovate yang kamu catat.";
    $("#focus-list").replaceChildren(...weak.map(make));
  } else {
    $("#focus-note").textContent = attempts.length
      ? "Belum ada tipe soal yang jelas lemah. Mulai dari tipe yang paling sering keluar di ujian:"
      : "Setelah kamu mencatat tes diagnostik, tipe soal terlemahmu muncul di sini. Sementara itu, mulai dari tipe yang paling sering keluar:";
    $("#focus-list").replaceChildren(...lessons.filter((l) => STARTERS.includes(l.id)).map(make));
  }
}

load().catch((err) => {
  $("#focus-note").textContent = `Gagal memuat materi: ${err.message}`;
});
