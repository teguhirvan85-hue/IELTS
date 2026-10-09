import { WRITING_MIN_WORDS, WRITING_MINUTES, essayWords, formatBand, letterOpening } from "/shared.js";
import { $, h, api, fmtDate, armedButton } from "/ui.js";
import { renderMarkdown } from "/md.js";
import { renderChart } from "/chart.js";

const KIND_LABEL = {
  formal: "Formal", "semi-formal": "Semi-formal", informal: "Informal",
  line: "Grafik garis", bar: "Grafik batang", pie: "Pie chart", table: "Tabel",
  opinion: "Opinion", discussion: "Discussion", problem: "Problem–solution", advantages: "Advantages–disadvantages", "two-part": "Two-part question",
};
const GUIDE = { general: "gt-task1", academic: "ac-task1", 2: "task2" };

let data = null; // { profile, module, targetBand, prompts }
let view = "1";
let task1Module = "general";
let selected = null; // prompt id, or "custom"
let pollTimer = null;
const guides = {};

async function load() {
  data = await api("/api/writing");
  task1Module = data.module === "academic" ? "academic" : "general";
  $("#w-eyebrow").textContent = `Writing · ${data.module === "academic" ? "Academic" : data.module === "general" ? "General Training" : "pilih modul di Pengaturan"}`;
  const q = new URLSearchParams(location.search);
  if (q.get("essay")) showEssay(q.get("essay"));
  else show(q.get("view") || "1");
}

function setTabs(v) {
  for (const b of $("#w-tabs").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.view === v));
}
$("#w-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b) return;
  history.pushState(null, "", `/writing?view=${b.dataset.view}`);
  show(b.dataset.view);
});
window.addEventListener("popstate", () => {
  const q = new URLSearchParams(location.search);
  if (q.get("essay")) showEssay(q.get("essay"));
  else show(q.get("view") || "1");
});

function show(v) {
  clearTimeout(pollTimer);
  view = v;
  setTabs(v);
  if (v === "history") return showHistory();
  selected = null;
  renderTask();
}

// ---------- choosing a prompt and writing ----------
function promptsFor() {
  const task = Number(view);
  return data.prompts.filter((p) => p.task === task && (task === 2 || p.module === task1Module));
}

function renderTask() {
  const task = Number(view);
  const list = promptsFor();
  if (!selected) selected = list[0]?.id || "custom";
  const moduleSwitch = task === 1 && !data.module
    ? h("div", { class: "seg", role: "group", "aria-label": "Modul" },
        ["general", "academic"].map((m) => h("button", {
          type: "button", "aria-pressed": String(task1Module === m), text: m === "general" ? "Surat (GT)" : "Grafik (Academic)",
          onclick: () => { task1Module = m; selected = null; renderTask(); },
        })))
    : null;
  const items = [...list.map((p) => ({ id: p.id, title: p.title, meta: `${KIND_LABEL[p.kind] || p.kind} · ${p.topic}` })), { id: "custom", title: "Soal sendiri", meta: "tempel soal dari engnovate atau sumber lain" }];
  const picker = h("div", { class: "prompt-list", role: "listbox", "aria-label": "Daftar soal" },
    items.map((it) => h("button", {
      class: "prompt-item", type: "button", role: "option", "aria-selected": String(it.id === selected),
      onclick: () => { selected = it.id; renderTask(); },
    }, h("span", { class: "pi-title", text: it.title }), h("span", { class: "pi-meta", text: it.meta }))));

  $("#w-main").replaceChildren(h("div", { class: "w-layout" },
    h("aside", { class: "card w-side" },
      h("div", { class: "card-head" }, h("div", {}, h("h2", { text: task === 1 ? "Soal Task 1" : "Soal Task 2" }), h("p", { class: "card-note", text: `${list.length} soal` })), moduleSwitch),
      picker),
    workspace(task)));
}

function draftKey(task) {
  return `ielts-draft:${data.profile}:${task}:${selected}`;
}
function readDraft(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
function writeDraft(key, value) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Drafts are a convenience; private windows may refuse storage.
  }
}

function promptView(p, task) {
  if (!p) return null;
  if (p.module === "general") {
    return h("div", { class: "task-prompt" },
      h("p", { text: p.situation }),
      h("p", { text: `Write a letter to ${p.recipient}. In your letter` }),
      h("ul", {}, p.bullets.map((b) => h("li", { text: b }))),
      h("p", { class: "tp-small", text: "Write at least 150 words. You do NOT need to write any addresses." }),
      h("p", { class: "tp-small", text: "Begin your letter as follows:" }),
      h("p", { class: "tp-opening", text: letterOpening(p) }));
  }
  if (p.module === "academic") {
    return h("div", { class: "task-prompt" }, h("p", { text: p.prompt }), h("p", { class: "tp-small", text: "Write at least 150 words." }), renderChart(p.kind, p.chart));
  }
  return h("div", { class: "task-prompt" },
    h("p", { class: "tp-statement", text: p.prompt }),
    h("p", { class: "tp-small", text: "Give reasons for your answer and include any relevant examples from your own knowledge or experience." }),
    h("p", { class: "tp-small", text: `Write at least ${WRITING_MIN_WORDS[task]} words.` }));
}

function guideBox(task) {
  const name = task === 2 ? GUIDE[2] : GUIDE[task1Module];
  const body = h("div", { class: "prose guide-body" }, h("p", { class: "hint", text: "Memuat panduan…" }));
  const box = h("details", { class: "guide" }, h("summary", { text: task === 2 ? "Panduan Task 2: struktur, bahasa, jebakan" : task1Module === "general" ? "Panduan surat (GT Task 1)" : "Panduan grafik (Academic Task 1)" }), body);
  box.addEventListener("toggle", async () => {
    if (!box.open || guides[name]) return;
    try {
      guides[name] = (await api(`/api/writing/guide/${name}`)).markdown;
      body.innerHTML = renderMarkdown(guides[name]); // our own content, escaped by the renderer
    } catch (err) {
      body.replaceChildren(h("p", { class: "hint", text: err.message }));
    }
  });
  return box;
}

function workspace(task) {
  const p = data.prompts.find((x) => x.id === selected) || null;
  const key = draftKey(task);
  const draft = readDraft(key) || {};
  const min = WRITING_MIN_WORDS[task];
  const custom = selected === "custom"
    ? h("textarea", { class: "tf custom-prompt", rows: "5", maxlength: "4000", placeholder: task === 1 && task1Module === "academic" ? "Tempel soalnya di sini. Untuk grafik, tulis juga angka-angka utamanya supaya Claude bisa memeriksa ketepatan datamu." : "Tempel atau ketik soalnya di sini." })
    : null;
  if (custom) custom.value = draft.custom || "";
  const area = h("textarea", { class: "essay", spellcheck: "true", "aria-label": "Jawabanmu", placeholder: task === 1 && task1Module === "general" ? (p ? letterOpening(p) : "Dear …") : "Mulai menulis di sini…" });
  area.value = draft.text || "";
  const count = h("span", { class: "wc" });
  const updateCount = () => {
    const n = essayWords(area.value);
    count.textContent = `${n} kata · minimal ${min}`;
    count.classList.toggle("short", n < min);
    count.classList.toggle("enough", n >= min);
  };
  updateCount();
  const save = () => writeDraft(key, area.value.trim() || custom?.value.trim() ? { text: area.value, custom: custom?.value || "" } : null);
  area.addEventListener("input", () => { updateCount(); save(); });
  custom?.addEventListener("input", save);

  // Exam timer: counts down from 20 or 40 minutes and keeps counting past zero.
  let started = null;
  let elapsed = 0;
  let tick = null;
  const clock = h("span", { class: "clock", text: `${WRITING_MINUTES[task]}:00` });
  const timerBtn = h("button", { class: "btn", type: "button", text: "Mulai timer" });
  const total = WRITING_MINUTES[task] * 60;
  const secondsUsed = () => elapsed + (started ? (Date.now() - started) / 1000 : 0);
  const paint = () => {
    const left = Math.round(total - secondsUsed());
    const a = Math.abs(left);
    clock.textContent = `${left < 0 ? "+" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
    clock.classList.toggle("over", left < 0);
  };
  timerBtn.addEventListener("click", () => {
    if (started) {
      elapsed = secondsUsed();
      started = null;
      clearInterval(tick);
      timerBtn.textContent = "Lanjutkan timer";
    } else {
      started = Date.now();
      tick = setInterval(paint, 1000);
      timerBtn.textContent = "Jeda";
      area.focus();
    }
  });

  const msg = h("p", { class: "msg", role: "alert" });
  const submit = h("button", { class: "btn primary", type: "button", text: "Minta feedback" });
  submit.addEventListener("click", async () => {
    msg.textContent = "";
    if (essayWords(area.value) < 40) return void (msg.textContent = "Tulis minimal 40 kata dulu supaya bisa dinilai.");
    if (selected === "custom" && !custom.value.trim()) return void (msg.textContent = "Tulis soalnya dulu.");
    submit.disabled = true;
    try {
      const minutes = secondsUsed() > 30 ? Math.max(1, Math.round(secondsUsed() / 60)) : null;
      clearInterval(tick);
      const essay = await api("/api/essays", {
        method: "POST",
        body: { task, module: task === 1 ? task1Module : data.module || "general", promptId: selected === "custom" ? null : selected, custom: custom?.value || "", text: area.value, minutes },
      });
      writeDraft(key, null);
      history.pushState(null, "", `/writing?essay=${essay.id}`);
      showEssay(essay.id);
    } catch (err) {
      submit.disabled = false;
      msg.textContent = err.message;
    }
  });

  return h("section", { class: "card w-work" },
    h("div", { class: "card-head" }, h("div", {},
      h("p", { class: "eyebrow", text: task === 1 ? `Task 1 · ${task1Module === "general" ? "surat" : "grafik"} · 20 menit` : "Task 2 · esai · 40 menit" }),
      h("h2", { text: p ? p.title : "Soal sendiri" }))),
    h("div", { class: "w-body" },
      p ? promptView(p, task) : h("label", { class: "fl" }, "Soal", custom),
      guideBox(task),
      area,
      h("div", { class: "w-bar" },
        h("div", { class: "w-meta" }, count, clock, timerBtn),
        h("div", { class: "controls" }, msg, submit)),
      h("p", { class: "hint", text: "Penilaian memakai kuota Claude-mu dan biasanya selesai dalam 1–2 menit. Drafmu tersimpan otomatis di browser ini." })));
}

// ---------- one essay and its feedback ----------
async function showEssay(id) {
  clearTimeout(pollTimer);
  setTabs("history");
  let essay;
  try {
    essay = await api(`/api/essays/${id}`);
  } catch (err) {
    $("#w-main").replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: err.message })));
    return;
  }
  const back = h("a", { class: "link-btn", href: "/writing?view=history", text: "← Riwayat" });
  const head = h("div", { class: "card-head" }, h("div", {},
    h("p", { class: "eyebrow", text: `Task ${essay.task} · ${essay.module === "academic" ? "Academic" : "General Training"} · ${fmtDate(essay.createdAt.slice(0, 10))}` }),
    h("h2", { text: essay.prompt.title || "Soal sendiri" }),
    h("p", { class: "card-note", text: `${essay.words} kata${essay.minutes ? ` · ${essay.minutes} menit` : ""}` })), back);

  let body;
  if (essay.status === "pending") {
    body = h("div", { class: "pending" }, h("span", { class: "dot-pulse", "aria-hidden": "true" }), h("p", { text: "Claude sedang menilai tulisanmu. Biasanya 1–2 menit; halaman ini diperbarui sendiri." }));
    pollTimer = setTimeout(() => showEssay(id), 4000);
  } else if (essay.status === "error") {
    const retry = h("button", { class: "btn primary", type: "button", text: "Kirim ulang" });
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      await api(`/api/essays/${id}/retry`, { method: "POST", body: {} });
      showEssay(id);
    });
    body = h("div", { class: "pending" }, h("p", { class: "msg", text: essay.error }), essay.hint ? h("p", { class: "hint", text: essay.hint }) : null, retry);
  } else body = feedbackView(essay);

  const del = h("button", { class: "link-btn danger", type: "button", text: "Hapus tulisan ini" });
  armedButton(del, async () => {
    await api(`/api/essays/${id}`, { method: "DELETE" });
    history.pushState(null, "", "/writing?view=history");
    show("history");
  });

  $("#w-main").replaceChildren(h("article", { class: "card essay-card" }, head, body,
    h("details", { class: "fb-block" }, h("summary", { text: "Soal" }), h("div", { class: "fb-pad" }, essay.prompt.custom ? h("p", { class: "pre", text: essay.prompt.custom }) : promptView(essay.prompt, essay.task))),
    h("details", { class: "fb-block", open: essay.status !== "done" }, h("summary", { text: "Tulisanmu" }), h("div", { class: "fb-pad" }, essayText(essay))),
    h("div", { class: "fb-foot" }, del)));
}

// The essay with each quoted problem marked, numbered like the improvement list.
function essayText(essay) {
  const text = essay.text;
  const marks = (essay.feedback?.improvements || [])
    .map((imp, i) => ({ n: i + 1, quote: imp.quote, at: imp.found ? text.indexOf(imp.quote) : -1 }))
    .filter((m) => m.at > -1)
    .sort((a, b) => a.at - b.at);
  const parts = [];
  let pos = 0;
  for (const m of marks) {
    if (m.at < pos) continue;
    parts.push(text.slice(pos, m.at), h("mark", { class: "ev" }, h("sup", { text: String(m.n) }), m.quote));
    pos = m.at + m.quote.length;
  }
  parts.push(text.slice(pos));
  return h("div", { class: "essay-text" }, parts);
}

function feedbackView(essay) {
  const f = essay.feedback;
  const target = data.targetBand;
  const gap = target != null ? target - f.band : null;
  const verdict = gap == null ? "" : gap <= 0 ? "✓ Sudah di target" : `Kurang ${formatBand(gap)} dari target ${formatBand(target)}`;
  return h("div", { class: "fb" },
    h("div", { class: "fb-hero" },
      h("div", {}, h("p", { class: "fb-band", text: formatBand(f.band) }), h("p", { class: "hint", text: `Band Task ${essay.task} (estimasi)` })),
      h("div", { class: "fb-hero-text" }, verdict ? h("p", { class: "fb-verdict", text: verdict }) : null, h("p", { text: f.summary }))),
    h("div", { class: "fb-criteria" }, f.criteria.map((c) => h("div", { class: "crit" },
      h("div", { class: "crit-head" }, h("span", { class: "crit-name", text: c.name }), h("span", { class: "crit-band", text: String(c.band) })),
      h("div", { class: "bar", role: "img", "aria-label": `${c.band} dari 9` }, h("span", { style: `width:${(c.band / 9) * 100}%` })),
      h("p", { text: c.comment })))),
    h("div", { class: "fb-two" },
      h("div", { class: "fb-list" }, h("h3", { text: "Sudah bagus" }), h("ul", { class: "ticks" }, f.strengths.map((t) => h("li", { text: t })))),
      h("div", { class: "fb-list" }, h("h3", { text: "Langkah berikutnya" }), h("ol", {}, f.nextSteps.map((t) => h("li", { text: t }))))),
    h("div", { class: "fb-improve" }, h("h3", { text: "Yang perlu diperbaiki" }),
      h("ol", { class: "improve-list" }, f.improvements.map((imp) => h("li", {},
        h("span", { class: "tag", text: essay.task === 1 && imp.criterion === "task" ? "Task Achievement" : { task: "Task Response", cc: "Coherence & Cohesion", lr: "Lexical Resource", gra: "Grammar" }[imp.criterion] }),
        h("p", { class: "imp-quote" }, h("span", { class: "imp-icon", text: "✗" }), imp.quote),
        h("p", { class: "imp-fix" }, h("span", { class: "imp-icon", text: "✓" }), imp.fix),
        h("p", { class: "imp-why", text: imp.why }))))),
    h("details", { class: "fb-block", open: true }, h("summary", { text: "Contoh paragraf yang lebih kuat (band 7.5+)" }), h("div", { class: "fb-pad" }, h("p", { class: "model", text: f.modelParagraph }))));
}

// ---------- history ----------
async function showHistory() {
  const { essays } = await api("/api/essays");
  const main = $("#w-main");
  if (!essays.length) {
    main.replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: "Belum ada tulisan. Pilih Task 1 atau Task 2 untuk mulai." })));
    return;
  }
  const status = (e) => (e.status === "done" ? formatBand(e.band) : e.status === "pending" ? "dinilai…" : "gagal");
  main.replaceChildren(h("section", { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("h2", { text: "Riwayat tulisan" }), h("p", { class: "card-note", text: "Band di sini adalah estimasi Claude per task." }))),
    h("div", { class: "scroll" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Tanggal" }), h("th", { text: "Soal" }), h("th", { text: "Task" }), h("th", { class: "num", text: "Kata" }), h("th", { class: "num", text: "Band" }))),
      h("tbody", {}, essays.map((e) => h("tr", {},
        h("td", { class: "date", text: fmtDate(e.createdAt.slice(0, 10)) }),
        h("td", {}, h("a", { class: "t-title", href: `/writing?essay=${e.id}`, text: e.title })),
        h("td", { text: `Task ${e.task}${e.task === 1 ? (e.module === "academic" ? " · grafik" : " · surat") : ""}` }),
        h("td", { class: "num", text: String(e.words) }),
        h("td", { class: "num", text: status(e) }))))))));
}

load().catch((err) => {
  $("#w-main").replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: `Gagal memuat: ${err.message}` })));
});
