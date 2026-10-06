import { scoreAttempt } from "/shared.js";
import { $, api } from "/ui.js";
import { lessonStats, focusLessons, lessonCard } from "/lesson-card.js";

async function load() {
  const [lessons, state] = await Promise.all([api("/api/lessons"), api("/api/state")]);
  const attempts = state.attempts.map((a) => ({ ...a, score: scoreAttempt(a) }));
  const stats = lessonStats(attempts);
  const drillAttempts = state.drillAttempts || [];
  const make = (l, i) => lessonCard(l, { stats: stats.get(l.id), drillAttempts, index: i, summary: true });

  $("#reading-list").replaceChildren(...lessons.filter((l) => l.skill === "reading").map(make));
  $("#listening-list").replaceChildren(...lessons.filter((l) => l.skill === "listening").map(make));

  // Weakest first: the lessons whose question types cost the most points in logged tests.
  const focus = focusLessons(lessons, stats);
  $("#focus-note").textContent = focus.weak
    ? "Tipe soal yang paling banyak membuang poin di tes engnovate yang kamu catat."
    : attempts.length
      ? "Belum ada tipe soal yang jelas lemah. Mulai dari tipe yang paling sering keluar di ujian."
      : "Setelah kamu mencatat tes diagnostik, tipe soal terlemahmu muncul di sini. Sementara itu, mulai dari tipe yang paling sering keluar.";
  $("#focus-list").replaceChildren(...focus.list.map(make));
}

load().catch((err) => {
  $("#focus-note").textContent = `Gagal memuat materi: ${err.message}`;
});
