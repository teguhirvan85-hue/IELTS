import { SKILLS, typeStats, scoreAttempt, gradeDrill, questionKey, countQuestions, normalizeAnswer } from "/shared.js";
import { $, h, api } from "/ui.js";
import { renderMarkdown } from "/md.js";

const lessonId = location.pathname.split("/").pop();

// ---------- page ----------
async function load() {
  const [lesson, state] = await Promise.all([api(`/api/lessons/${lessonId}`), api("/api/state")]);
  const { meta, body, drills, attempts } = lesson;
  document.title = `${meta.title} · IELTS Coach`;
  $("#lesson-eyebrow").replaceChildren(h("a", { href: "/learn", text: "Materi" }), ` · ${SKILLS[meta.skill].label}`);
  $("#lesson-title").textContent = meta.title;
  $("#lesson-summary").textContent = meta.summary;

  // How this lesson's question types went in logged engnovate tests.
  const tests = state.attempts.map((a) => ({ ...a, score: scoreAttempt(a) }));
  const mine = typeStats(tests, meta.skill).filter((s) => meta.types.includes(s.type));
  const correct = mine.reduce((n, s) => n + s.correct, 0);
  const total = mine.reduce((n, s) => n + s.total, 0);
  $("#lesson-stats").textContent = total
    ? `Di tes engnovate yang kamu catat: ${correct}/${total} benar (${Math.round((correct / total) * 100)}%).`
    : "";

  // Lesson text is our own content; the renderer escapes it before adding markup.
  $("#lesson-body").innerHTML = renderMarkdown(body);
  renderDrills(drills, attempts);
}

function renderDrills(drills, history) {
  const host = $("#latihan");
  if (!drills.length) {
    host.replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: "Latihan untuk materi ini menyusul." })));
    return;
  }
  $("#jump-drill").hidden = false;
  // Open the first drill this learner hasn't tried yet.
  const firstNew = drills.findIndex((d) => !history.some((a) => a.drill === d.id));
  let current = firstNew === -1 ? 0 : firstNew;
  const show = () => host.replaceChildren(drillCard(drills[current], history, drills, current, (i) => { current = i; show(); }));
  show();
  // The drill is rendered after the page loads, so follow a #latihan link by hand.
  if (location.hash === "#latihan") host.scrollIntoView();
}

// ---------- one drill ----------
function drillCard(drill, history, all, index, switchTo) {
  const answers = {};
  const last = history.filter((a) => a.drill === drill.id).at(-1);
  const count = countQuestions(drill);

  const tabs = all.length > 1
    ? h("div", { class: "seg", role: "group", "aria-label": "Pilih latihan" },
        all.map((d, i) => h("button", { type: "button", "aria-pressed": String(i === index), onclick: () => switchTo(i), text: `Latihan ${i + 1}${history.some((a) => a.drill === d.id) ? " ✓" : ""}` })))
    : null;
  const note = h("p", { class: "card-note", text: [drill.variant, `${count} soal · ±${drill.minutes} menit`, last ? `terakhir ${last.correct}/${last.total} benar` : null].filter(Boolean).join(" · ") });
  const source = renderSource(drill);
  const qs = renderQuestions(drill, answers, () => updateProgress());
  const progress = h("span", { class: "hint" });
  const checkBtn = h("button", { class: "btn primary", type: "button", text: "Periksa jawaban" });
  const foot = h("div", { class: "drill-foot" }, progress, checkBtn);

  function answeredCount() {
    return drill.questions.reduce((n, q) => {
      const v = answers[questionKey(q)];
      if (Array.isArray(q.n)) return n + Math.min(Array.isArray(v) ? v.length : 0, q.n.length);
      return n + (v != null && String(v).trim() !== "" ? 1 : 0);
    }, 0);
  }
  function updateProgress() {
    progress.textContent = `${answeredCount()}/${count} dijawab`;
  }
  updateProgress();

  checkBtn.addEventListener("click", async () => {
    const result = gradeDrill(drill, answers);
    qs.lock(result.results);
    source.reveal();
    const status = h("span", { class: "hint", text: "Menyimpan…" });
    const again = h("button", { class: "btn", type: "button", text: "Ulangi", onclick: () => switchTo(index) });
    const next = all.length > index + 1 ? h("button", { class: "btn", type: "button", text: "Latihan berikutnya", onclick: () => switchTo(index + 1) }) : null;
    foot.replaceChildren(
      h("div", { class: "score" }, h("span", { class: "big", text: `${result.correct}/${result.total}` }), h("small", { text: "benar" }), status),
      h("div", { class: "controls" }, again, next)
    );
    try {
      const saved = await api(`/api/drills/${drill.id}/attempts`, { method: "POST", body: { answers } });
      history.push(saved);
      status.textContent = "Tersimpan";
    } catch (err) {
      status.textContent = `Gagal menyimpan: ${err.message}`;
    }
  });

  return h("article", { class: "card drill" },
    h("div", { class: "card-head" }, h("div", {}, h("p", { class: "eyebrow", text: "Latihan mini" }), h("h2", { text: drill.title }), note), tabs),
    h("div", { class: `drill-body ${drill.skill}` }, source.el, qs.el),
    foot
  );
}

// ---------- passage, or audio + transcript ----------
function renderSource(drill) {
  const marks = drill.questions
    .filter((q) => q.evidence)
    .map((q) => ({ label: Array.isArray(q.n) ? q.n.join("–") : String(q.n), quote: q.evidence }));

  if (drill.skill === "reading") {
    const paras = drill.passage.paragraphs.map((p) => {
      const text = h("span", { text: p.text });
      return { text: p.text, el: h("p", { class: p.label ? "labelled" : null }, p.label ? h("b", { class: "plabel", text: p.label }) : null, text), span: text };
    });
    const el = h("div", { class: "drill-source" },
      h("div", { class: "passage" }, h("h3", { class: "passage-title", text: drill.passage.title }), paras.map((p) => p.el)));
    return { el, reveal: () => paras.forEach((p) => highlight(p.span, p.text, marks)) };
  }

  const lines = drill.script.map((l) => {
    const text = h("span", { text: l.text });
    return { text: l.text, span: text, el: h("p", {}, l.speaker ? h("b", { class: "speaker", text: l.speaker }) : null, text) };
  });
  const audio = h("audio", { controls: true, preload: "metadata", src: `/content/audio/${drill.id}.m4a` });
  const missing = h("p", { class: "msg", hidden: true, text: "Audio belum dibuat. Jalankan npm run audio." });
  audio.addEventListener("error", () => { missing.hidden = false; });
  const transcript = h("details", { class: "transcript", hidden: true }, h("summary", { text: "Transkrip" }), lines.map((l) => l.el));
  const el = h("div", { class: "drill-source" },
    h("div", { class: "audio-box" }, audio, missing, h("p", { class: "hint", text: "Dengarkan sekali saja seperti ujian asli, sambil menjawab. Setelah diperiksa, transkripnya muncul di sini." })),
    drill.image
      ? h("figure", { class: "drill-figure" },
          h("a", { href: `/content/img/${drill.image}`, target: "_blank", rel: "noopener" }, h("img", { src: `/content/img/${drill.image}`, alt: drill.imageAlt || "Gambar soal" })),
          h("figcaption", { class: "hint", text: "Klik gambar untuk memperbesar." }))
      : null,
    transcript
  );
  return {
    el,
    reveal: () => {
      lines.forEach((l) => highlight(l.span, l.text, marks));
      transcript.hidden = false;
      transcript.open = true;
    },
  };
}

// Wraps each evidence quote found in this text in <mark>, with its question number.
function highlight(span, text, marks) {
  const found = marks
    .map((m) => ({ ...m, at: text.indexOf(m.quote) }))
    .filter((m) => m.at > -1)
    .sort((a, b) => a.at - b.at);
  if (!found.length) return;
  const parts = [];
  let pos = 0;
  for (const m of found) {
    if (m.at < pos) continue; // overlapping quote: keep the first
    parts.push(text.slice(pos, m.at), h("mark", { class: "ev" }, h("sup", { text: m.label }), m.quote));
    pos = m.at + m.quote.length;
  }
  parts.push(text.slice(pos));
  span.replaceChildren(...parts);
}

// ---------- questions ----------
function optionsFor(drill, q) {
  return q.choices || drill.options || [];
}
// T/F/NG style options are their own label; lettered lists (headings, people, endings)
// are printed once and answered by key.
function isLabelled(options) {
  return options.some((o) => o.text && o.text !== o.key);
}

function renderQuestions(drill, answers, onChange) {
  const lockers = [];
  const blocks = [];
  blocks.push(h("p", { class: "drill-instr", text: drill.instruction }));

  if (drill.options && isLabelled(drill.options)) {
    blocks.push(h("div", { class: "opt-list" },
      h("p", { class: "opt-title", text: drill.optionsTitle || "Pilihan" }),
      h("ul", {}, drill.options.map((o) => h("li", {}, h("b", { text: o.key }), h("span", { text: o.text }))))));
  }

  if (drill.input === "text") {
    const inputs = new Map();
    const gap = (n) => {
      const q = drill.questions.find((x) => x.n === n);
      const input = h("input", { class: "gap-input", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", maxlength: "60", "aria-label": `Soal ${n}` });
      input.addEventListener("input", () => { answers[String(n)] = input.value; onChange(); });
      const mark = h("span", { class: "gap-mark" });
      inputs.set(n, { input, mark, q });
      return h("span", { class: "gap" }, h("span", { class: "gap-n", text: String(n) }), input, mark);
    };
    if (drill.context) blocks.push(renderContext(drill.context, gap));
    for (const q of drill.questions) {
      if (q.prompt) blocks.push(h("div", { class: "dq" }, h("p", { class: "dq-prompt" }, ...withGaps(q.prompt, gap))));
    }
    if (drill.wordLimit) blocks.push(h("p", { class: "hint", text: `Batas: maksimal ${drill.wordLimit} kata per jawaban.` }));
    const resultList = h("ol", { class: "gap-results", hidden: true });
    blocks.push(resultList);
    lockers.push((results) => {
      for (const [n, { input, mark, q }] of inputs) {
        const r = results[String(n)];
        input.disabled = true;
        input.classList.add(r.ok ? "ok" : "bad");
        mark.textContent = r.ok ? "✓" : "✗";
        const given = input.value.trim();
        const verdict = r.ok
          ? `✓ ${n}. Benar: ${given}${normalizeAnswer(given) !== normalizeAnswer(q.answer) ? ` (jawaban lengkap: ${q.answer})` : ""}.`
          : `✗ ${n}. ${given ? `Jawabanmu "${given}"` : "Belum dijawab"}${r.overLimit ? ` (lebih dari ${drill.wordLimit} kata)` : ""}. Jawaban: ${[q.answer, ...(q.accept || [])].join(" / ")}.`;
        resultList.append(h("li", { class: r.ok ? "ok" : "bad" }, h("strong", { text: verdict }), " ", q.explain));
      }
      resultList.hidden = false;
    });
  } else {
    for (const q of drill.questions) {
      const { el, lock } = choiceQuestion(drill, q, answers, onChange);
      blocks.push(el);
      lockers.push(lock);
    }
  }
  return { el: h("div", { class: "drill-questions" }, blocks), lock: (results) => lockers.forEach((l) => l(results)) };
}

function withGaps(text, gap) {
  return text.split(/\[\[(\d+)\]\]/).map((part, i) => (i % 2 ? gap(Number(part)) : part));
}

// Notes, forms, summaries, tables and flow-charts with gaps written as [[n]].
function renderContext(ctx, gap) {
  const box = h("div", { class: `context context-${ctx.kind || "notes"}` });
  if (ctx.title) box.append(h("p", { class: "context-title", text: ctx.title }));
  if (ctx.rows) {
    const [head, ...rows] = ctx.rows;
    box.append(h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, head.map((c) => h("th", {}, ...withGaps(c, gap))))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, ...withGaps(c, gap)))))))));
  }
  const lines = ctx.lines || [];
  if (ctx.kind === "flow") {
    lines.forEach((l, i) => {
      if (i) box.append(h("div", { class: "flow-arrow", "aria-hidden": "true", text: "↓" }));
      box.append(h("div", { class: "flow-step" }, ...withGaps(l, gap)));
    });
  } else {
    for (const l of lines) {
      if (l.startsWith("# ")) box.append(h("p", { class: "context-sub" }, ...withGaps(l.slice(2), gap)));
      else if (l.startsWith("- ")) box.append(h("p", { class: "context-bullet" }, ...withGaps(l.slice(2), gap)));
      else box.append(h("p", {}, ...withGaps(l, gap)));
    }
  }
  return box;
}

function choiceQuestion(drill, q, answers, onChange) {
  const key = questionKey(q);
  const options = optionsFor(drill, q);
  const multi = Array.isArray(q.n);
  const pick = multi ? q.n.length : 1;
  const labelled = isLabelled(options);
  const rows = Boolean(q.choices); // multiple choice: letter + full text per line
  const buttons = options.map((o) => {
    const b = h("button", {
      class: rows ? "opt-row" : "pill",
      type: "button",
      "aria-pressed": "false",
      "data-key": o.key,
    }, rows ? [h("b", { text: o.key }), h("span", { text: o.text })] : (labelled ? o.key : o.text));
    b.addEventListener("click", () => {
      if (multi) {
        const cur = new Set(answers[key] || []);
        if (cur.has(o.key)) cur.delete(o.key);
        else if (cur.size < pick) cur.add(o.key);
        answers[key] = [...cur];
      } else answers[key] = answers[key] === o.key ? undefined : o.key;
      const chosen = new Set([].concat(answers[key] || []));
      for (const x of buttons) x.setAttribute("aria-pressed", String(chosen.has(x.dataset.key)));
      onChange();
    });
    return b;
  });
  const label = multi ? `${q.n[0]}–${q.n.at(-1)}` : String(q.n);
  const result = h("div", { class: "dq-result", hidden: true });
  const el = h("div", { class: "dq" },
    h("div", { class: "dq-head" }, h("span", { class: "qbadge", text: label }), h("p", { class: "dq-prompt", text: q.prompt || "" })),
    multi ? h("p", { class: "hint", text: `Pilih ${pick === 2 ? "DUA" : pick === 3 ? "TIGA" : pick} jawaban.` }) : null,
    h("div", { class: rows ? "opt-rows" : "pills" }, buttons),
    result
  );
  const show = (k) => {
    const o = options.find((x) => x.key === k);
    return labelled && o ? `${k} (${o.text})` : k;
  };
  return {
    el,
    lock(results) {
      const r = results[key];
      const correctKeys = new Set([].concat(q.answer));
      const chosen = new Set([].concat(answers[key] || []));
      for (const b of buttons) {
        b.disabled = true;
        if (correctKeys.has(b.dataset.key)) b.classList.add("is-answer");
        else if (chosen.has(b.dataset.key)) b.classList.add("is-wrong");
      }
      const answerText = [].concat(q.answer).map(show).join(" dan ");
      const verdict = r.ok
        ? (multi ? `✓ ${r.points}/${r.max} benar.` : "✓ Benar.")
        : `✗ ${multi ? `${r.points}/${r.max} benar. ` : chosen.size ? "Salah. " : "Belum dijawab. "}Jawaban: ${answerText}.`;
      result.replaceChildren(h("strong", { text: verdict }), " ", q.explain);
      result.classList.add(r.ok ? "ok" : "bad");
      result.hidden = false;
    },
  };
}

load().catch((err) => {
  $("#lesson-title").textContent = "Materi tidak ditemukan";
  $("#lesson-summary").textContent = err.message;
});
