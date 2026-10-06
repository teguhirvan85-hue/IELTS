import { GRADES, NEW_PER_DAY, schedule, reviewQueue, isNewCard } from "/shared.js";
import { $, h, api, fmtDay, armedButton } from "/ui.js";

let cards = [];
let today = "";
let editing = null; // id of the card loaded into the form
let active = null; // keyboard handlers of the running review

async function reloadCards() {
  ({ cards, today } = await api("/api/cards"));
}

async function load() {
  await reloadCards();
  renderIdle();
  renderList();
  loadDecks();
}

// ---------- review ----------
const intervalLabel = (days) => (days === 0 ? "hari ini" : days === 1 ? "1 hari" : `${days} hari`);

function renderIdle(message) {
  const queue = reviewQueue(cards, today);
  const box = $("#review");
  const due = queue.filter((c) => !isNewCard(c)).length;
  const fresh = queue.length - due;
  if (!queue.length) {
    const next = cards.filter((c) => !isNewCard(c)).map((c) => c.srs.due).sort()[0];
    box.replaceChildren(h("div", { class: "review-idle" },
      h("p", { class: "review-count", text: "0" }),
      h("div", {},
        h("h2", { text: message || (cards.length ? "Tidak ada kartu untuk hari ini" : "Belum ada kartu") }),
        h("p", { class: "card-note", text: cards.length ? (next ? `Review berikutnya: ${fmtDay(next)}.` : "") : "Tambahkan paket siap pakai di bawah, atau buat kartu sendiri." }))));
    return;
  }
  const start = h("button", { class: "btn primary", type: "button", text: "Mulai review" });
  start.addEventListener("click", () => startSession(queue));
  box.replaceChildren(h("div", { class: "review-idle" },
    h("p", { class: "review-count", text: String(queue.length) }),
    h("div", {},
      h("h2", { text: message || "kartu untuk hari ini" }),
      h("p", { class: "card-note", text: `${due} untuk diulang · ${fresh} baru (maks. ${NEW_PER_DAY} kartu baru per hari)` })),
    start));
}

function startSession(queue) {
  const session = [...queue];
  const box = $("#review");
  let i = 0;
  let reviewed = 0;

  function show() {
    if (i >= session.length) return finish();
    const card = session[i];
    let revealed = false;
    let busy = false;
    const back = h("div", { class: "flash-back", hidden: true },
      h("p", { class: "flash-answer", text: card.back }),
      card.example ? h("p", { class: "flash-example", text: card.example }) : null);
    const revealBtn = h("button", { class: "btn primary", type: "button", text: "Tampilkan jawaban" });
    const gradeButtons = GRADES.map((g) => {
      const b = h("button", { class: "btn grade", type: "button" }, h("span", { text: `${g.id + 1} · ${g.label}` }), h("small", { text: intervalLabel(schedule(card.srs, g.id, today).interval) }));
      b.addEventListener("click", () => grade(g.id));
      return b;
    });
    const grades = h("div", { class: "grades", hidden: true }, gradeButtons);
    const reveal = () => {
      revealed = true;
      back.hidden = false;
      revealBtn.hidden = true;
      grades.hidden = false;
      gradeButtons[2].focus();
    };
    async function grade(g) {
      if (busy || !revealed) return;
      busy = true;
      gradeButtons.forEach((b) => { b.disabled = true; });
      try {
        const updated = await api(`/api/cards/${card.id}/review`, { method: "POST", body: { grade: g } });
        cards[cards.findIndex((c) => c.id === card.id)] = updated;
        reviewed++;
        if (g === 0) session.push(updated); // forgotten: once more before the session ends
        i++;
        show();
      } catch (err) {
        busy = false;
        gradeButtons.forEach((b) => { b.disabled = false; });
        status.textContent = `Gagal menyimpan: ${err.message}`;
      }
    }
    revealBtn.addEventListener("click", reveal);
    const end = h("button", { class: "link-btn", type: "button", text: "Selesai dulu", onclick: finish });
    const status = h("p", { class: "msg", role: "alert" });
    box.replaceChildren(
      h("div", { class: "review-top" }, h("span", { class: "hint", text: `${i + 1} / ${session.length}${isNewCard(card) ? " · kartu baru" : ""}` }), end),
      h("div", { class: "flash" }, h("p", { class: "flash-front", text: card.front }), back),
      h("div", { class: "review-actions" }, revealBtn, grades),
      status,
      h("p", { class: "hint keys", text: "Spasi: balik kartu · 1–4: Lupa, Sulit, Ingat, Mudah" }));
    active = { reveal: () => !revealed && reveal(), grade: (g) => grade(g), revealed: () => revealed };
    revealBtn.focus();
  }

  function finish() {
    active = null;
    renderIdle(reviewed ? `Selesai: ${reviewed} kartu diulang` : null);
    renderList();
  }
  show();
}

document.addEventListener("keydown", (e) => {
  if (!active || e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.key === " " || e.key === "Enter") && !active.revealed()) {
    e.preventDefault();
    active.reveal();
  } else if (["1", "2", "3", "4"].includes(e.key) && active.revealed()) {
    e.preventDefault();
    active.grade(Number(e.key) - 1);
  }
});

// ---------- decks ----------
async function loadDecks() {
  const decks = await api("/api/decks");
  $("#decks").replaceChildren(...decks.map((d) => {
    const left = d.count - d.owned;
    const btn = h("button", { class: "btn", type: "button", disabled: !left, text: !left ? "✓ Sudah ditambahkan" : left === d.count ? `Tambahkan ${d.count} kartu` : `Tambahkan ${left} sisanya` });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await api(`/api/decks/${d.id}/import`, { method: "POST", body: {} });
      await reloadCards();
      if (!active) renderIdle();
      renderList();
      loadDecks();
    });
    return h("div", { class: "deck" }, h("div", {}, h("h3", { text: d.title }), h("p", { class: "card-note", text: d.description })), btn);
  }));
}

// ---------- add / edit ----------
const form = $("#card-form");
function setEditing(card) {
  editing = card ? card.id : null;
  form.front.value = card?.front || "";
  form.back.value = card?.back || "";
  form.example.value = card?.example || "";
  $("#add-title").textContent = card ? "Ubah kartu" : "Tambah kartu";
  $("#card-submit").textContent = card ? "Simpan perubahan" : "Simpan kartu";
  $("#card-cancel").hidden = !card;
  if (card) {
    form.scrollIntoView({ block: "center" });
    form.front.focus();
  }
}
$("#card-cancel").addEventListener("click", () => setEditing(null));
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#card-msg");
  const body = { front: form.front.value, back: form.back.value, example: form.example.value };
  try {
    if (editing) await api(`/api/cards/${editing}`, { method: "PUT", body });
    else await api("/api/cards", { method: "POST", body });
    msg.textContent = editing ? "Perubahan disimpan." : "Kartu disimpan.";
    setEditing(null);
    form.front.focus();
    await reloadCards();
    if (!active) renderIdle();
    renderList();
  } catch (err) {
    msg.textContent = err.message;
  }
});

// ---------- list ----------
function scheduleLabel(c) {
  if (isNewCard(c)) return "Baru";
  return c.srs.due <= today ? "Hari ini" : fmtDay(c.srs.due);
}

function renderList() {
  const q = $("#search").value.trim().toLowerCase();
  const shown = cards.filter((c) => !q || `${c.front} ${c.back} ${c.example}`.toLowerCase().includes(q)).slice().reverse();
  $("#list-note").textContent = `${cards.length} kartu · ${cards.filter(isNewCard).length} belum pernah diulang`;
  $("#list-title").textContent = `Semua kartu (${cards.length})`;
  const body = $("#card-list");
  if (!shown.length) {
    body.replaceChildren(h("p", { class: "empty", text: cards.length ? "Tidak ada kartu yang cocok." : "Belum ada kartu." }));
    return;
  }
  const rows = shown.slice(0, 300).map((c) => {
    const del = h("button", { class: "link-btn danger", type: "button", text: "Hapus" });
    armedButton(del, async () => {
      await api(`/api/cards/${c.id}`, { method: "DELETE" });
      await reloadCards();
      if (!active) renderIdle();
      renderList();
      loadDecks();
    });
    return h("tr", {},
      h("td", { class: "c-front", text: c.front }),
      h("td", {}, h("span", { text: c.back }), c.example ? h("small", { text: c.example }) : null),
      h("td", { class: "date", text: scheduleLabel(c) }),
      h("td", { class: "actions" }, h("button", { class: "link-btn", type: "button", text: "Ubah", onclick: () => setEditing(c) }), del));
  });
  body.replaceChildren(h("div", { class: "scroll" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Depan" }), h("th", { text: "Belakang" }), h("th", { text: "Jadwal" }), h("th", {}))),
    h("tbody", {}, rows))));
}
$("#search").addEventListener("input", renderList);

load().catch((err) => {
  $("#review").replaceChildren(h("p", { class: "empty pad-top", text: `Gagal memuat kartu: ${err.message}` }));
});
