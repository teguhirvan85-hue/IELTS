import { SKILLS, QTYPES, OBJECTIVE, MODULES, BAND_STEPS, scoreAttempt, roundBand, formatBand, parseNumberList, formatNumberList, defaultGroups, todayISO } from "/shared.js";
import { $, h, api } from "/ui.js";

const CRITERIA = {
  writing: [["ta", "Task Achievement / Response"], ["cc", "Coherence & Cohesion"], ["lr", "Lexical Resource"], ["gra", "Grammar"]],
  speaking: [["fc", "Fluency & Coherence"], ["lr", "Lexical Resource"], ["gra", "Grammar"], ["p", "Pronunciation"]],
};

const form = $("#attempt-form");
const editId = new URLSearchParams(location.search).get("id");

// Everything the form edits. Groups keep the question text read from engnovate (prompts)
// so a wrong number can show what the question was.
let model = null;
let manual = false;

function blank(skill) {
  return { skill, module: "academic", title: "", url: "", date: todayISO(), minutes: null, notes: "", groups: defaultGroups(skill), skippedParts: [], band: null, criteria: {} };
}

// ---------- loading a test ----------
async function loadFromLink(url, refresh = false) {
  const status = $("#fetch-status");
  status.textContent = "Membaca tes dari engnovate…";
  try {
    const test = await api(`/api/engnovate?url=${encodeURIComponent(url)}${refresh ? "&refresh=1" : ""}`);
    const keep = model && model.url === test.url ? model : null;
    model = {
      ...(keep || blank(test.skill)),
      skill: test.skill,
      module: test.module || keep?.module || "academic",
      title: test.title,
      url: test.url,
      groups: test.groups.map((g) => ({ ...g, wrong: keep?.groups.find((k) => k.from === g.from)?.wrong || [] })),
    };
    manual = false;
    status.textContent = OBJECTIVE.has(test.skill)
      ? `Terbaca ${test.groups.length} grup soal. Cek tipe soalnya, lalu tandai yang salah.`
      : "Terbaca. Isi band-nya di bawah.";
    $("#refresh-btn").hidden = false;
    show();
  } catch (err) {
    status.textContent = `${err.message}`;
  }
}

$("#fetch-form").addEventListener("submit", (e) => {
  e.preventDefault();
  loadFromLink(e.target.url.value);
});
$("#refresh-btn").addEventListener("click", () => loadFromLink($("#fetch-form").url.value, true));
$("#manual-btn").addEventListener("click", () => {
  model = blank("reading");
  manual = true;
  $("#fetch-status").textContent = "";
  show();
});

// ---------- rendering ----------
function show() {
  form.hidden = false;
  const objective = OBJECTIVE.has(model.skill);
  $("#test-title").textContent = manual ? "Tes tanpa link" : model.title;
  const total = model.groups.reduce((n, g) => n + g.to - g.from + 1, 0);
  const parts = new Set(model.groups.map((g) => g.part).filter((p) => p != null));
  $("#test-meta").textContent = manual
    ? "Isi judul, skill dan susunan soalnya sendiri."
    : [SKILLS[model.skill].label, model.skill === "reading" ? MODULES[model.module] : null, objective ? `${total} soal` : null, parts.size ? `${parts.size} part` : null].filter(Boolean).join(" · ");
  $("#title-field").hidden = !manual;
  $("#skill-field").hidden = !manual;
  $("#module-field").hidden = model.skill !== "reading";
  for (const b of $("#skill-seg").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.skill === model.skill));
  form.title.value = model.title;
  form.module.value = model.module;
  form.date.value = model.date;
  form.minutes.value = model.minutes ?? "";
  form.notes.value = model.notes;
  $("#objective-card").hidden = !objective;
  $("#subjective-card").hidden = objective;
  $("#manual-groups").hidden = !(manual && objective);
  if (objective) {
    if (manual) renderManualGroups();
    renderParts();
  } else renderSubjective();
  updateScore();
}

function partOf(g) {
  return g.part ?? 0;
}

function renderParts() {
  const byPart = new Map();
  for (const g of model.groups) {
    if (!byPart.has(partOf(g))) byPart.set(partOf(g), []);
    byPart.get(partOf(g)).push(g);
  }
  const skipped = new Set(model.skippedParts);
  const sections = [...byPart.entries()].sort((a, b) => a[0] - b[0]).map(([part, groups]) => {
    const isSkipped = skipped.has(part);
    const toggle = h("button", { class: "chip", type: "button", "aria-pressed": String(isSkipped), text: isSkipped ? "Dilewati" : "Dikerjakan" });
    const section = h("div", { class: `qpart${isSkipped ? " skipped" : ""}` },
      h("div", { class: "qpart-head" }, h("h3", {}, part ? `Part ${part}` : "Soal", h("small", { text: `Q${groups[0].from}–${groups.at(-1).to}` })), part ? toggle : null),
      ...groups.map(renderGroup)
    );
    toggle.addEventListener("click", () => {
      const set = new Set(model.skippedParts);
      set.has(part) ? set.delete(part) : set.add(part);
      model.skippedParts = [...set];
      renderParts();
      updateScore();
    });
    return section;
  });
  $("#parts").replaceChildren(...sections);
  syncWrongText();
}

function typeSelect(value, onChange, label) {
  const sel = h("select", { class: "tf sm", "aria-label": label }, Object.entries(QTYPES).map(([id, name]) => h("option", { value: id, text: name })));
  sel.value = value;
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function renderGroup(g) {
  const nums = [];
  for (let n = g.from; n <= g.to; n++) {
    const btn = h("button", { class: "qn", type: "button", "data-n": n, "aria-pressed": String(g.wrong.includes(n)), "aria-label": `Soal ${n}`, title: g.prompts?.[n] || null, text: String(n) });
    btn.addEventListener("click", () => {
      g.wrong = g.wrong.includes(n) ? g.wrong.filter((x) => x !== n) : [...g.wrong, n].sort((a, b) => a - b);
      btn.setAttribute("aria-pressed", String(g.wrong.includes(n)));
      renderWrongList(g, list);
      syncWrongText();
      updateScore();
    });
    nums.push(btn);
  }
  const list = h("ul", { class: "qwrong" });
  renderWrongList(g, list);
  g._list = list;
  return h("div", { class: "qgroup" },
    h("div", { class: "qgroup-head" },
      h("span", { class: "qrange", text: g.from === g.to ? `Q${g.from}` : `Q${g.from}–${g.to}` }),
      typeSelect(g.type, (t) => { g.type = t; }, `Tipe soal Q${g.from}–${g.to}`),
      g.instruction ? h("p", { class: "qinstr", text: brief(g.instruction) }) : null
    ),
    h("div", { class: "qnums" }, nums),
    list
  );
}

// The instruction's opening sentences ("Complete the notes below. Choose ONE WORD ONLY…"),
// without the notes or table text that follows it on the page.
function brief(text) {
  const sentences = text.match(/[^.?!]+[.?!]+/g) || [text];
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).length > 140) break;
    out += s;
  }
  return out.length > 170 ? out.slice(0, 169) + "…" : out.trim();
}

// The question text of each wrong number, so a mis-click is easy to spot.
function renderWrongList(g, list) {
  list.replaceChildren(...g.wrong.filter((n) => g.prompts?.[n]).map((n) => h("li", {}, h("b", { text: `✗ ${n}` }), h("span", { text: g.prompts[n] }))));
}

function allWrong() {
  return model.groups.flatMap((g) => g.wrong);
}
function syncWrongText() {
  const input = $("#wrong-text");
  if (document.activeElement !== input) input.value = formatNumberList(allWrong());
}
$("#wrong-text").addEventListener("input", (e) => {
  const nums = new Set(parseNumberList(e.target.value));
  for (const g of model.groups) {
    g.wrong = [...nums].filter((n) => n >= g.from && n <= g.to);
    for (const btn of $("#parts").querySelectorAll(".qn")) {
      const n = Number(btn.dataset.n);
      if (n >= g.from && n <= g.to) btn.setAttribute("aria-pressed", String(g.wrong.includes(n)));
    }
    if (g._list) renderWrongList(g, g._list);
  }
  updateScore();
});
$("#wrong-text").addEventListener("blur", syncWrongText);

// ---------- manual layout ----------
function renderManualGroups() {
  const rows = model.groups.map((g, i) => {
    const num = (key, label, min, max) => {
      const input = h("input", { class: "tf mono", type: "number", min, max, inputmode: "numeric", value: g[key] ?? "" });
      input.addEventListener("change", () => {
        g[key] = input.value === "" ? null : Number(input.value);
        g.wrong = g.wrong.filter((n) => n >= g.from && n <= g.to);
        renderParts();
        updateScore();
      });
      return h("label", { class: "fl" }, label, input);
    };
    const remove = h("button", { class: "link-btn danger", type: "button", text: "Hapus" });
    remove.addEventListener("click", () => {
      model.groups.splice(i, 1);
      renderManualGroups();
      renderParts();
      updateScore();
    });
    return h("div", { class: "mg-row" },
      num("from", "Dari no.", 1, 40),
      num("to", "Sampai no.", 1, 40),
      num("part", "Part", 1, 4),
      h("label", { class: "fl" }, "Tipe soal", typeSelect(g.type, (t) => { g.type = t; renderParts(); }, "Tipe soal")),
      remove
    );
  });
  const add = h("button", { class: "link-btn", type: "button", text: "+ Tambah grup" });
  add.addEventListener("click", () => {
    const last = model.groups.at(-1);
    const from = Math.min(40, (last?.to ?? 0) + 1);
    model.groups.push({ from, to: from, type: "other", part: last?.part ?? 1, wrong: [] });
    renderManualGroups();
    renderParts();
    updateScore();
  });
  $("#mg-rows").replaceChildren(...rows, h("div", {}, add));
}

$("#skill-seg").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-skill]");
  if (!b || b.dataset.skill === model.skill) return;
  model = { ...blank(b.dataset.skill), title: form.title.value, date: form.date.value, notes: form.notes.value };
  show();
});

// ---------- writing / speaking ----------
function bandSelect(value, label, onChange) {
  const sel = h("select", { class: "tf" }, h("option", { value: "", text: "—" }), BAND_STEPS.map((b) => h("option", { value: String(b), text: formatBand(b) })));
  sel.value = value == null ? "" : String(value);
  sel.addEventListener("change", () => onChange(sel.value === "" ? null : Number(sel.value)));
  return h("label", { class: "fl" }, label, sel);
}
function renderSubjective() {
  const crit = CRITERIA[model.skill];
  const overall = bandSelect(model.band, `Band ${SKILLS[model.skill].label}`, (v) => { model.band = v; updateScore(); });
  const fields = crit.map(([key, label]) =>
    bandSelect(model.criteria[key], label, (v) => {
      model.criteria[key] = v;
      // All four criteria known and no band yet: suggest their average.
      const vals = crit.map(([k]) => model.criteria[k]);
      if (model.band == null && vals.every((x) => x != null)) {
        model.band = roundBand(vals.reduce((a, b) => a + b, 0) / 4);
        overall.querySelector("select").value = String(model.band);
        updateScore();
      }
    })
  );
  $("#ws-grid").replaceChildren(overall, ...fields);
}

// ---------- score bar ----------
function updateScore() {
  const s = scoreAttempt(model);
  const el = $("#score");
  if (!OBJECTIVE.has(model.skill)) {
    el.replaceChildren(h("span", { class: "big", text: formatBand(s.band) }), h("small", { text: s.band == null ? "Band belum diisi" : `Band ${SKILLS[model.skill].label}` }));
    return;
  }
  if (!s.total) {
    el.replaceChildren(h("small", { text: "Belum ada soal yang dihitung." }));
    return;
  }
  el.replaceChildren(
    h("span", { class: "big", text: `${s.correct}/${s.total}` }),
    h("small", { text: "benar" }),
    s.full
      ? h("small", {}, "Band ", h("strong", { text: formatBand(s.band) }))
      : h("small", { class: "est" }, `≈ band ${formatBand(s.band)} (perkiraan dari latihan per bagian)`)
  );
}

// ---------- save ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#save-msg");
  msg.hidden = true;
  const body = {
    skill: model.skill,
    module: form.module.value,
    title: manual ? form.title.value : model.title,
    url: model.url,
    date: form.date.value,
    minutes: form.minutes.value === "" ? null : Number(form.minutes.value),
    notes: form.notes.value,
  };
  if (OBJECTIVE.has(model.skill)) {
    body.groups = model.groups.map(({ from, to, type, part, wrong }) => ({ from, to, type, part, wrong }));
    body.skippedParts = model.skippedParts;
  } else {
    body.band = model.band;
    body.criteria = model.criteria;
  }
  try {
    const saved = editId ? await api(`/api/attempts/${editId}`, { method: "PUT", body }) : await api("/api/attempts", { method: "POST", body });
    // Wrong answers go straight to the journal, while the test is still fresh in mind.
    const skipped = new Set(saved.skippedParts || []);
    const anyWrong = (saved.groups || []).some((g) => !skipped.has(g.part) && g.wrong.length);
    location.href = anyWrong ? `/journal?attempt=${saved.id}` : `/?saved=${saved.id}`;
  } catch (err) {
    msg.textContent = err.message;
    msg.hidden = false;
  }
});

form.module.addEventListener("change", () => {
  model.module = form.module.value;
  updateScore();
});
form.date.addEventListener("change", () => { model.date = form.date.value; });
form.minutes.addEventListener("change", () => { model.minutes = form.minutes.value === "" ? null : Number(form.minutes.value); });
form.notes.addEventListener("input", () => { model.notes = form.notes.value; });
form.title.addEventListener("input", () => { model.title = form.title.value; });

// ---------- edit mode ----------
async function loadEdit() {
  const a = await api(`/api/attempts/${editId}`);
  $("#page-title").textContent = "Ubah tes";
  document.title = "Ubah tes · IELTS Coach";
  model = { ...blank(a.skill), ...a, criteria: a.criteria || {}, groups: (a.groups || []).map((g) => ({ ...g })), skippedParts: a.skippedParts || [] };
  manual = !a.url;
  if (a.url) {
    $("#fetch-form").url.value = a.url;
    // Bring back the question text from the cached engnovate layout.
    try {
      const test = await api(`/api/engnovate?url=${encodeURIComponent(a.url)}`);
      for (const g of model.groups) {
        const t = test.groups.find((x) => x.from === g.from && x.to === g.to);
        if (t) Object.assign(g, { prompts: t.prompts, instruction: t.instruction });
      }
    } catch {}
  }
  show();
}

if (editId) loadEdit().catch((err) => { $("#fetch-status").textContent = err.message; });
else $("#fetch-form").url.focus();
