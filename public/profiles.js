import { formatBand, daysUntil, todayISO } from "/shared.js";
import { $, h, api, icon, themeToggle } from "/ui.js";

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
$("#picker-theme").replaceWith(themeToggle());

const TILES = ["blue", "pink", "lime"];

// One segment per task in today's plan; the plan exists once the dashboard was opened today.
function todayBar(p) {
  const { done, total } = p.today;
  const label = !total ? "Belum mulai hari ini" : done >= total ? `✓ ${total}/${total} tugas hari ini` : `${done}/${total} tugas hari ini`;
  return h("div", { class: "segbar", role: "img", "aria-label": label },
    h("span", { class: "segs", "aria-hidden": "true" }, total ? Array.from({ length: total }, (_, i) => h("i", { class: i < done ? "on" : null })) : h("i")),
    h("span", { class: "seg-label", "aria-hidden": "true", text: label }));
}

function stat(value, label) {
  return h("div", { class: "wt-stat" }, h("span", { class: "wt-big", text: value }), h("span", { class: "wt-small", text: label }));
}

function profileTile(p, i, isCurrent) {
  const days = daysUntil(p.examDate);
  const link = `${location.origin}/p/${p.slug}`;
  const enter = h("button", { class: "btn primary", type: "button", text: `Masuk sebagai ${p.name}` });
  const copy = h("button", { class: "link-btn copy", type: "button", title: link, text: `Salin link /p/${p.slug}` });
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = "✓ Link tersalin";
    } catch {
      copy.textContent = link;
    }
  });
  async function activate() {
    enter.disabled = true;
    await api(`/api/profiles/${p.id}/activate`, { method: "POST", body: {} });
    location.href = target;
  }
  enter.addEventListener("click", activate);

  const tile = h("article", { class: `tile ${TILES[i % TILES.length]} who-tile` },
    h("div", { class: "wt-top" },
      h("div", { class: "wt-chips" },
        p.role ? h("span", { class: "wt-chip", text: p.role }) : null,
        isCurrent ? h("span", { class: "wt-chip now", text: "Sedang dipakai" }) : null),
      h("span", { class: `avatar xl c${i % 4}`, "aria-hidden": "true", text: (p.name.trim()[0] || "?").toUpperCase() })),
    h("h2", { class: "wt-name", text: p.name }),
    h("p", { class: "wt-meta", text: [MODULE[p.module] || "Modul belum dipilih", p.targetBand ? `target ${formatBand(p.targetBand)}` : null].filter(Boolean).join(" · ") }),
    h("div", { class: "wt-stats" },
      days == null ? stat("—", "tanggal ujian belum diatur") : days >= 0 ? stat(String(days), days ? "hari lagi menuju ujian" : "hari ini ujian") : stat("✓", "ujian sudah lewat"),
      stat(String(p.streak || 0), "hari belajar beruntun")),
    todayBar(p),
    h("div", { class: "wt-actions" }, enter, copy));
  // The whole tile is a big target for the mouse; the button is the keyboard control.
  tile.addEventListener("click", (e) => {
    if (!e.target.closest("button")) activate();
  });
  return tile;
}

async function load() {
  const { active, chosen, profiles } = await api("/api/profiles");

  // Greeting with everyone's names and the nearest exam.
  const names = profiles.map((p) => p.name);
  const together = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0];
  $("#greeting").textContent = `Semangat, ${together}!`;
  const now = new Date();
  $("#hero-count").replaceChildren(
    h("span", { class: "hc-big", text: now.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) }),
    h("span", { class: "hc-label", text: now.toLocaleDateString("id-ID", { weekday: "long" }) }));
  $("#motivation").textContent = lineOfTheDay();

  $("#who").replaceChildren(...profiles.map((p, i) => profileTile(p, i, chosen && p.id === active)));
}

load().catch((err) => {
  $("#who").replaceChildren(h("p", { class: "msg", text: `Gagal memuat profil: ${err.message}` }));
});
