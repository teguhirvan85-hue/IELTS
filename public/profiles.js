import { formatBand, daysUntil, todayISO } from "/shared.js";
import { $, h, api, icon } from "/ui.js";

const MODULE = { general: "General Training", academic: "Academic" };
const next = new URLSearchParams(location.search).get("next");
// Only local paths, so the link can't send anyone elsewhere.
const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

// A line of encouragement that changes once a day.
const LINES = [
  "Kalian satu tim. Skornya masing-masing, tujuannya sama.",
  "Saling sabar hari ini, saling bangga nanti di Australia.",
  "Belajar berdua bukan lomba. Kalau satu lelah, yang lain menyemangati.",
  "Jangan bandingkan skor kalian. Bandingkan dirimu hari ini dengan kemarin.",
  "Rayakan kemajuan pasanganmu sama senangnya dengan kemajuanmu sendiri.",
  "Saling ingatkan jadwal belajar, bukan saling menyalahkan.",
  "Sebelum mulai, tanyakan kabar pasanganmu. Belajar terasa lebih ringan kalau hati tenang.",
  "Ujian ini sementara. Kebiasaan saling mendukung yang kalian bangun sekarang akan menetap.",
  "Satu tujuan, dua nama di visa, satu kehidupan baru.",
  "Bayangkan pagi pertama kalian di Australia. Hari ini kalian sedang membangunnya.",
  "Setiap kartu yang kamu hafal malam ini adalah satu langkah menuju rumah baru kalian.",
  "Australia menunggu kalian berdua, bukan salah satu saja. Ajak pasanganmu belajar hari ini.",
  "Hari ini belajar berdua, nanti jalan-jalan berdua di Australia.",
  "Sedikit setiap hari lebih kuat daripada banyak sekali-sekali.",
  "Tidak apa-apa pelan, asal tidak berhenti. Dan tidak apa-apa minta ditemani.",
  "Kesalahan di latihan itu teman. Lebih baik ketemu sekarang daripada di hari ujian.",
  "Mulai saja dulu. Semangat biasanya datang setelah kamu mulai.",
  "Kalau hari ini berat, cukup satu sesi kecil. Lalu peluk pasanganmu.",
  "Band 7 tidak datang dalam semalam, tapi dari malam-malam seperti ini.",
  "Kalian sudah lebih jauh daripada hari pertama. Lanjutkan, bersama.",
];
function lineOfTheDay() {
  const [y, m, d] = todayISO().split("-").map(Number);
  const day = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  return LINES[day % LINES.length];
}

$("#picker-mark").append(icon("logo"));

function progressText(p) {
  const parts = [];
  if (p.today.total) parts.push(p.today.done >= p.today.total ? `✓ Semua ${p.today.total} tugas hari ini selesai` : `${p.today.done}/${p.today.total} tugas hari ini`);
  else parts.push("Belum mulai hari ini");
  if (p.streak > 1) parts.push(`${p.streak} hari berturut-turut`);
  return parts.join(" · ");
}

async function load() {
  const { active, chosen, profiles } = await api("/api/profiles");

  // Greeting with everyone's names and the nearest exam.
  const names = profiles.map((p) => p.name);
  const together = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0];
  const exams = profiles.map((p) => daysUntil(p.examDate)).filter((d) => d != null && d >= 0);
  const nearest = exams.length ? Math.min(...exams) : null;
  $("#greeting").textContent = nearest == null ? `Semangat, ${together}!` : `Semangat, ${together}! ${nearest === 0 ? "Hari ini hari ujian." : `${nearest} hari lagi menuju ujian.`}`;
  $("#motivation").textContent = lineOfTheDay();

  $("#who").replaceChildren(...profiles.map((p, i) => {
    const days = daysUntil(p.examDate);
    const link = `${location.origin}/p/${p.slug}`;
    const copy = h("button", { class: "link-btn", type: "button", text: "Salin" });
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link);
        copy.textContent = "✓ Tersalin";
      } catch {
        copy.textContent = link;
      }
    });
    const card = h("button", { class: "who-card", type: "button" },
      h("span", { class: `avatar xl c${i % 4}`, "aria-hidden": "true", text: (p.name.trim()[0] || "?").toUpperCase() }),
      p.role ? h("span", { class: "who-role", text: p.role }) : null,
      h("span", { class: "who-name", text: p.name }),
      h("span", { class: "who-meta", text: [MODULE[p.module] || "Modul belum dipilih", p.targetBand ? `target ${formatBand(p.targetBand)}` : null].filter(Boolean).join(" · ") }),
      h("span", { class: "who-meta", text: days == null ? "Tanggal ujian belum diatur" : days > 0 ? `Ujian ${days} hari lagi` : days === 0 ? "Ujian hari ini" : "Ujian sudah lewat" }),
      h("span", { class: "who-progress", text: progressText(p) }),
      chosen && p.id === active ? h("span", { class: "who-current", text: "Sedang dipakai" }) : null);
    card.addEventListener("click", async () => {
      await api(`/api/profiles/${p.id}/activate`, { method: "POST", body: {} });
      location.href = target;
    });
    return h("div", { class: "who" }, card, h("p", { class: "who-link" }, h("span", { text: `Link pribadi: /p/${p.slug}` }), copy));
  }));
}

load().catch((err) => {
  $("#who").replaceChildren(h("p", { class: "msg", text: `Gagal memuat profil: ${err.message}` }));
});
