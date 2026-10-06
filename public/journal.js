import { SKILLS, QTYPES, REASONS, reasonsFor } from "/shared.js";
import { $, h, api, fmtDay } from "/ui.js";

const params = new URLSearchParams(location.search);
const freshAttempt = params.get("attempt");
let items = [];

async function load() {
  ({ items } = await api("/api/journal"));
  render();
}

function render() {
  renderPatterns();
  const open = items.filter((i) => !i.reason || i._justSet);
  const done = items.filter((i) => i.reason && !i._justSet);
  // A test that was just logged goes first, so its mistakes are analysed while fresh.
  if (freshAttempt && open.some((i) => i.attempt === freshAttempt)) {
    $("#fresh").hidden = false;
    open.sort((a, b) => (b.attempt === freshAttempt) - (a.attempt === freshAttempt));
  }
  $("#open-title").textContent = `Belum dianalisis (${items.filter((i) => !i.reason).length})`;
  $("#done-title").textContent = `Sudah dianalisis (${done.length})`;
  $("#open-list").replaceChildren(...(open.length
    ? groupByTest(open)
    : [h("p", { class: "empty", text: items.length ? "Semua jawaban salah sudah diberi alasan." : "Belum ada jawaban salah. Catat tes engnovate dulu, lalu nomor yang salah muncul di sini." })]));
  $("#done-list").replaceChildren(...(done.length ? groupByTest(done) : [h("p", { class: "empty", text: "Belum ada." })]));
}

// ---------- patterns ----------
function renderPatterns() {
  const counted = items.filter((i) => i.reason);
  const note = $("#patterns-note");
  if (!counted.length) {
    note.textContent = "Setelah kamu memberi alasan pada beberapa jawaban salah, pola terbesarnya muncul di sini beserta cara memperbaikinya.";
    $("#patterns").replaceChildren();
    return;
  }
  note.textContent = `Dari ${counted.length} jawaban salah yang sudah dianalisis.`;
  const by = new Map();
  for (const i of counted) {
    const cur = by.get(i.reason) || { reason: i.reason, count: 0, skills: new Set() };
    cur.count++;
    cur.skills.add(i.skill);
    by.set(i.reason, cur);
  }
  const rows = [...by.values()].sort((a, b) => b.count - a.count);
  const max = rows[0].count;
  const bars = rows.map((r) => {
    const pct = Math.round((r.count / counted.length) * 100);
    return h("div", { class: "prow" },
      h("span", { class: "prow-label", text: REASONS[r.reason].label }),
      h("div", { class: "bar", role: "img", "aria-label": `${r.count} jawaban` }, h("span", { style: `width:${Math.round((r.count / max) * 100)}%` })),
      h("span", { class: "num", text: `${r.count} · ${pct}%` }));
  });
  // Advice for the two biggest patterns, with the lessons that help.
  const advice = rows.filter((r) => REASONS[r.reason].tip).slice(0, 2).map((r) => {
    const reason = REASONS[r.reason];
    const links = [...r.skills].flatMap((s) => reason.lessons[s] || []);
    const unique = [...new Set(links)];
    return h("div", { class: "advice" },
      h("p", { class: "advice-title", text: reason.label }),
      h("p", { text: reason.tip }),
      unique.length || r.reason === "vocab" || r.reason === "paraphrase" || r.reason === "spelling"
        ? h("p", { class: "advice-links" },
            ...unique.map((id) => h("a", { href: `/learn/${id}`, text: "Buka materi" + labelFor(id) })),
            ["vocab", "paraphrase", "spelling"].includes(r.reason) ? h("a", { href: "/cards", text: "Ke Kartu" }) : null)
        : null);
  });
  $("#patterns").replaceChildren(h("div", { class: "prows" }, bars), h("div", { class: "advice-list" }, advice));
}
const LESSON_NAMES = {
  tfng: "T/F/NG", ynng: "Y/N/NG", headings: "Matching Headings", "matching-info": "Matching Information",
  completion: "Completion", mcq: "Multiple Choice", "l-completion": "Form Completion", "l-mcq": "Multiple Choice (Listening)",
  "l-map": "Map", "l-matching": "Matching (Listening)",
};
function labelFor(id) {
  return LESSON_NAMES[id] ? `: ${LESSON_NAMES[id]}` : "";
}

// ---------- mistake items ----------
function groupByTest(list) {
  const groups = new Map();
  for (const i of list) {
    if (!groups.has(i.attempt)) groups.set(i.attempt, []);
    groups.get(i.attempt).push(i);
  }
  return [...groups.values()].map((g) => {
    const first = g[0];
    const title = first.url ? h("a", { class: "ext", href: first.url, target: "_blank", rel: "noopener", text: first.title }) : first.title;
    return h("div", { class: "mk-group" },
      h("p", { class: "mk-test" }, title, h("span", { class: "hint", text: ` · ${SKILLS[first.skill].label} · ${fmtDay(first.date)}` })),
      g.sort((a, b) => a.n - b.n).map(mistakeRow));
  });
}

function mistakeRow(item) {
  const status = h("span", { class: "hint mk-status", role: "status" });
  const save = async (patch) => {
    Object.assign(item, patch);
    status.textContent = "Menyimpan…";
    try {
      await api(`/api/mistakes/${item.key}`, { method: "PUT", body: { reason: item.reason, mine: item.mine, correct: item.correct, note: item.note } });
      status.textContent = "Tersimpan";
    } catch (err) {
      status.textContent = `Gagal: ${err.message}`;
    }
  };

  const chips = reasonsFor(item.skill, item.type).map((r) => {
    const b = h("button", { class: "pill", type: "button", "aria-pressed": String(item.reason === r), "data-reason": r, text: REASONS[r].label });
    b.addEventListener("click", async () => {
      const next = item.reason === r ? null : r;
      for (const x of chips) x.setAttribute("aria-pressed", String(x.dataset.reason === next));
      item._justSet = true; // keep it where it is until the next visit
      await save({ reason: next });
      renderPatterns();
      $("#open-title").textContent = `Belum dianalisis (${items.filter((i) => !i.reason).length})`;
    });
    return b;
  });

  const field = (key, label, max) => {
    const input = h("input", { class: "tf", maxlength: String(max), value: item[key], autocomplete: "off" });
    input.addEventListener("change", () => save({ [key]: input.value.trim() }));
    return h("label", { class: "fl" }, label, input);
  };
  const note = h("textarea", { class: "tf", rows: "2", maxlength: "500" });
  note.value = item.note;
  note.addEventListener("change", () => save({ note: note.value.trim() }));

  const more = h("details", { class: "mk-more" },
    h("summary", { text: item.mine || item.correct || item.note ? "Catatan" : "Tambah catatan atau kartu" }),
    h("div", { class: "mk-fields" },
      field("mine", "Jawabanmu", 80),
      field("correct", "Jawaban benar", 80),
      h("label", { class: "fl wide" }, "Catatan (misalnya pasangan parafrase: teks ↔ soal)", note),
      cardMaker(item)));

  return h("div", { class: "mk" },
    h("div", { class: "mk-head" },
      h("span", { class: "qbadge", text: String(item.n) }),
      h("span", { class: "mk-type", text: QTYPES[item.type] || item.type }),
      status),
    item.prompt ? h("p", { class: "mk-prompt", text: item.prompt }) : null,
    h("div", { class: "pills mk-reasons", role: "group", "aria-label": `Alasan salah untuk soal ${item.n}` }, chips),
    more);
}

// Turns a mistake into a flashcard: the correct answer on the front, the question as example.
function cardMaker(item) {
  const front = h("input", { class: "tf", maxlength: "120", placeholder: "kata atau frasa", autocomplete: "off" });
  const back = h("input", { class: "tf", maxlength: "300", placeholder: "arti, sinonim, atau parafrasenya", autocomplete: "off" });
  const msg = h("span", { class: "hint", role: "status" });
  const button = h("button", { class: "btn", type: "button", text: "Jadikan kartu" });
  button.addEventListener("click", async () => {
    front.value ||= item.correct;
    if (!front.value.trim() || !back.value.trim()) {
      msg.textContent = "Isi depan dan belakang kartu dulu.";
      return;
    }
    try {
      await api("/api/cards", { method: "POST", body: { front: front.value, back: back.value, example: item.prompt || "", source: { kind: "test", ref: item.key } } });
      msg.textContent = "Kartu dibuat. Muncul di review berikutnya.";
      front.value = "";
      back.value = "";
    } catch (err) {
      msg.textContent = err.message;
    }
  });
  return h("div", { class: "mk-card wide" },
    h("p", { class: "mk-card-title", text: "Kartu baru dari soal ini" }),
    h("div", { class: "mk-card-fields" }, h("label", { class: "fl" }, "Depan", front), h("label", { class: "fl" }, "Belakang", back)),
    h("div", { class: "controls" }, button, msg));
}

load().catch((err) => {
  $("#open-list").replaceChildren(h("p", { class: "empty", text: `Gagal memuat jurnal: ${err.message}` }));
});
