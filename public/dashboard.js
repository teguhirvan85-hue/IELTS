import { SKILLS, SKILL_IDS, QTYPES, OBJECTIVE, BAND_STEPS, scoreAttempt, typeStats, roundBand, formatBand, daysUntil, todayISO, lessonFor, buildPlan, planStreak, weekPlan, PLAN_PHASES, FOCUS_LABEL } from "/shared.js";
import { $, h, api, fmtDay, fmtDate, armedButton, renameCurrentProfile } from "/ui.js";

// Starting tests for the diagnostic: the newest Cambridge set on engnovate.
const DIAGNOSTIC = {
  listening: { title: "Cambridge IELTS 21 Academic Listening Test 1", url: "https://engnovate.com/ielts-listening-tests/cambridge-ielts-21-academic-listening-test-1/", time: "±40 menit: 30 menit audio + cek jawaban" },
  readingAcademic: { title: "Cambridge IELTS 21 Academic Reading Test 1", url: "https://engnovate.com/ielts-reading-tests/cambridge-ielts-21-academic-reading-test-1/", time: "60 menit, 3 passage" },
  readingGeneral: { title: "Cambridge IELTS 20 General Training Reading Test 1", url: "https://engnovate.com/ielts-reading-tests/cambridge-ielts-20-general-training-reading-test-1/", time: "60 menit, 3 section" },
};

let state = { settings: {}, attempts: [] };
let lessons = [];
let typeSkill = "reading";

// Oldest first, with the score worked out once.
function scored() {
  return [...state.attempts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((a) => ({ ...a, score: scoreAttempt(a) }));
}

// Band points per skill. Writing and Speaking also get the Claude-marked practice in this
// app, shown as estimates (hollow dots), so those skills have a band even when engnovate
// gives none.
function series(list, skill) {
  const own = list.filter((a) => a.skill === skill && a.score.band != null);
  const point = (x, title) => ({ id: x.id, skill, date: x.createdAt.slice(0, 10), createdAt: x.createdAt, title, score: { band: x.band, estimate: true, full: false } });
  const lab = skill === "writing" ? (state.essays || []).map((e) => point(e, `Writing lab · Task ${e.task}: ${e.title}`))
    : skill === "speaking" ? (state.speaking || []).map((x) => point(x, `Speaking · ${x.title}`))
    : [];
  return [...own, ...lab].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function render() {
  const list = scored();
  const module = { academic: "Academic", general: "General Training" }[state.settings.module];
  $("#who").textContent = ["Persiapan IELTS", state.profile?.name, module].filter(Boolean).join(" · ");
  renderKpis(list);
  renderPlan(list);
  renderDiagnostic(list);
  renderSkills(list);
  renderTypes(list);
  renderHistory(list);
}

// ---------- KPIs ----------
function kpi(label, value, note) {
  return h("div", { class: "kpi" }, h("h2", { text: label }), value, h("p", { class: "kpi-note" }, note));
}
function settingsLink(text) {
  return h("button", { class: "link-btn inline", type: "button", onclick: openSettings, text });
}

function renderKpis(list) {
  const { examDate, targetBand } = state.settings;
  const days = daysUntil(examDate);
  const exam = examDate
    ? kpi("Ujian", h("p", { class: "kpi-value" }, days >= 0 ? String(days) : "—", h("small", { text: days >= 0 ? "hari lagi" : "sudah lewat" })), [fmtDate(examDate), " · ", settingsLink("Ubah")])
    : kpi("Ujian", h("p", { class: "kpi-value", text: "—" }), settingsLink("Atur tanggal ujian"));

  const latest = Object.fromEntries(SKILL_IDS.map((s) => [s, series(list, s).at(-1)?.score.band ?? null]));
  const missing = SKILL_IDS.filter((s) => latest[s] == null);
  const overall = missing.length ? null : roundBand(SKILL_IDS.reduce((sum, s) => sum + latest[s], 0) / 4);
  const parts = SKILL_IDS.map((s) => `${SKILLS[s].short} ${formatBand(latest[s])}`).join(" · ");
  const overallKpi = kpi(
    "Perkiraan overall",
    h("p", { class: "kpi-value", text: formatBand(overall) }),
    overall != null ? `Dari tes terakhir: ${parts}` : `Butuh skor ${missing.map((s) => SKILLS[s].label).join(", ")}`
  );

  let targetNote;
  if (targetBand == null) targetNote = settingsLink("Atur target band");
  else {
    const below = SKILL_IDS.filter((s) => latest[s] != null && latest[s] < targetBand).map((s) => SKILLS[s].label);
    if (overall != null && overall >= targetBand) targetNote = "✓ Overall sudah di target";
    else if (below.length) targetNote = `Di bawah target: ${below.join(", ")}`;
    else targetNote = list.length ? "Skill yang tercatat sudah di target" : "Belum ada skor untuk dibandingkan";
  }
  const target = kpi("Target tiap skill", h("p", { class: "kpi-value", text: formatBand(targetBand) }), targetNote);

  const weekAgo = todayISO(new Date(Date.now() - 6 * 86400000));
  const week = list.filter((a) => a.date >= weekAgo);
  const minutes = week.reduce((m, a) => m + (a.minutes || 0), 0);
  const count = kpi(
    "Tes tercatat",
    h("p", { class: "kpi-value", text: String(list.length) }),
    `${week.length} dalam 7 hari terakhir${minutes ? ` · ${minutes} menit` : ""}`
  );
  $("#kpis").replaceChildren(exam, overallKpi, target, count);
}

// ---------- today's plan ----------
// Built from the exam date, minutes per day and weak spots; kept for the day once shown.
// Tasks tick themselves when the matching work shows up (a drill, an essay, a review…).
function autoDone(task, list, today) {
  const t = state.today || {};
  const on = (iso) => iso && iso.slice(0, 10) === today;
  const [kind, arg] = task.id.split(":");
  if (kind === "cards") return arg === "start" ? (state.today?.cardsTotal || 0) > 0 : t.cardsDue === 0;
  if (kind === "journal") return t.journalOpen === 0;
  if (kind === "diagnostic") return list.some((a) => a.skill === arg);
  if (kind === "lesson") return (state.drillAttempts || []).some((d) => d.lesson === arg && on(d.createdAt));
  if (kind === "engnovate") return list.some((a) => a.skill === arg && a.date === today);
  if (kind === "mock") return list.some((a) => a.skill === "listening" && a.date === today) && list.some((a) => a.skill === "reading" && a.date === today);
  if (kind === "writing") return (state.essays || []).some((e) => String(e.task) === arg && on(e.createdAt));
  if (kind === "speaking") return (state.speaking || []).some((x) => on(x.createdAt) && (arg !== "part1" || x.mode === "part1"));
  return false;
}

async function renderPlan(list, force = false) {
  const box = $("#plan");
  const today = todayISO();
  const latest = Object.fromEntries(SKILL_IDS.map((s) => [s, series(list, s).at(-1)?.score.band ?? null]));
  const fresh = buildPlan({
    today, settings: state.settings, attempts: state.attempts, drillAttempts: state.drillAttempts, latest,
    cardsDue: state.today?.cardsDue || 0, cardsTotal: state.today?.cardsTotal || 0, journalOpen: state.today?.journalOpen || 0, lessons,
  });
  let day = state.plan?.[today];
  if (!day?.tasks?.length || force) {
    try {
      day = await api("/api/plan/snapshot", { method: "POST", body: { date: today, tasks: fresh.tasks, force } });
      state.plan = { ...(state.plan || {}), [today]: day };
    } catch {
      day = { tasks: fresh.tasks, done: [] };
    }
  }
  box.hidden = false;
  const phase = PLAN_PHASES[fresh.phase];
  const done = new Set(day.done || []);
  for (const task of day.tasks) {
    if (!done.has(task.id) && autoDone(task, list, today)) {
      done.add(task.id);
      api("/api/plan", { method: "POST", body: { date: today, id: task.id, done: true } }).catch(() => {});
    }
  }
  day.done = [...done];
  const total = day.tasks.reduce((n, t) => n + t.minutes, 0);
  const finished = day.tasks.filter((t) => done.has(t.id)).length;
  const streak = planStreak({ ...(state.plan || {}), [today]: day }, today);

  const rows = day.tasks.map((task) => {
    const isDone = done.has(task.id);
    const tick = h("button", { class: "tick", type: "button", role: "checkbox", "aria-checked": String(isDone), "aria-label": `Tandai selesai: ${task.title}` });
    tick.addEventListener("click", async () => {
      const next = tick.getAttribute("aria-checked") !== "true";
      tick.setAttribute("aria-checked", String(next));
      tick.closest(".task").classList.toggle("done", next);
      const saved = await api("/api/plan", { method: "POST", body: { date: today, id: task.id, done: next } });
      state.plan[today] = saved;
      renderPlan(list);
    });
    const link = task.external
      ? h("a", { class: "task-title ext", href: task.href, target: "_blank", rel: "noopener", text: task.title })
      : h("a", { class: "task-title", href: task.href, text: task.title });
    return h("li", { class: `task${isDone ? " done" : ""}` }, tick, h("div", { class: "task-body" }, link, task.detail ? h("p", { class: "hint", text: task.detail }) : null), h("span", { class: "mins", text: `${task.minutes} mnt` }));
  });

  const week = weekPlan(today, latest, state.settings.targetBand).map((d) => {
    const did = (state.plan?.[d.date]?.done || []).length > 0 || (d.date === today && finished > 0);
    return h("li", { class: `wday${d.date === today ? " today" : ""}${did ? " did" : ""}`, "aria-current": d.date === today ? "date" : null },
      h("span", { class: "wd-label", text: d.label }),
      h("span", { class: "wd-focus", text: FOCUS_LABEL[d.focus] || d.focus }),
      h("span", { class: "wd-mark", text: did ? "✓" : "" }));
  });

  const redo = h("button", { class: "link-btn", type: "button", text: "Susun ulang", title: "Buat ulang rencana hari ini dari data terbaru" });
  redo.addEventListener("click", () => renderPlan(list, true));
  const daysText = fresh.daysLeft == null ? "tanggal ujian belum diatur" : fresh.daysLeft > 0 ? `${fresh.daysLeft} hari lagi` : "";
  box.replaceChildren(
    h("div", { class: "card-head" },
      h("div", {}, h("p", { class: "eyebrow", text: [`Fase ${phase.name}`, daysText].filter(Boolean).join(" · ") }), h("h2", { id: "plan-title", text: "Rencana hari ini" }), h("p", { class: "card-note", text: phase.note })),
      h("div", { class: "plan-meta" },
        h("p", { class: "plan-progress" }, h("b", { text: `${finished}/${day.tasks.length}` }), " selesai"),
        streak ? h("p", { class: "hint", text: `${streak} hari berturut-turut` }) : null)),
    day.tasks.length ? h("ul", { class: "tasks" }, rows) : h("p", { class: "empty", text: "Tidak ada tugas untuk hari ini." }),
    h("div", { class: "plan-foot" },
      h("span", { class: "hint", text: `±${total} menit · waktumu ${state.settings.minutesPerDay || 45} menit per hari` }),
      redo),
    h("ol", { class: "week", "aria-label": "Fokus minggu ini" }, week));
}

// ---------- diagnostic ----------
function renderDiagnostic(list) {
  const has = (s) => list.some((a) => a.skill === s);
  const card = $("#diagnostic");
  card.hidden = has("listening") && has("reading");
  if (card.hidden) return;
  const reading = state.settings.module === "general" ? DIAGNOSTIC.readingGeneral : DIAGNOSTIC.readingAcademic;
  const step = (n, done, skill, t, extra) =>
    h("li", { class: `step${done ? " done" : ""}` },
      h("span", { class: "n", text: String(n) }),
      h("p", {}, h("strong", { text: skill }), " · ", h("a", { class: "ext", href: t.url, target: "_blank", rel: "noopener", text: t.title }), h("small", { text: t.time }), extra),
      done ? h("span", { class: "hint", text: "Sudah dicatat" }) : h("a", { class: "link-btn", href: "/log", text: "Catat hasil" })
    );
  const gtNote = state.settings.module
    ? null
    : h("small", {}, "Untuk General Training: ", h("a", { class: "ext", href: DIAGNOSTIC.readingGeneral.url, target: "_blank", rel: "noopener", text: DIAGNOSTIC.readingGeneral.title }));
  $("#diag-steps").replaceChildren(
    step(1, has("listening"), "Listening", DIAGNOSTIC.listening),
    step(2, has("reading"), "Reading", reading, gtNote),
    h("li", { class: "hint", text: "Writing & Speaking: kerjakan juga di engnovate kalau sempat, lalu catat band-nya kalau engnovate memberi skor." })
  );
}

// ---------- skill small multiples ----------
const tip = $("#tip");
function showTip(x, y, band, lines) {
  tip.replaceChildren(h("b", { text: band }), ...lines.map((l) => h("div", { text: l })));
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
  const top = y - r.height - 14 < 8 ? y + 18 : y - r.height - 14;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
function hideTip() {
  tip.hidden = true;
}

function scoreLine(a) {
  const s = a.score;
  if (!OBJECTIVE.has(a.skill)) return a.title;
  return `${s.correct}/${s.total} benar${s.full ? "" : " · latihan per bagian"}`;
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
}

// One small line chart per skill, all on the same band scale so they compare at a glance.
function drawSpark(holder, points, target) {
  const W = Math.max(160, holder.clientWidth);
  const H = 104;
  const pad = { l: 20, r: 30, t: 10, b: 8 };
  const values = points.map((p) => p.score.band);
  const lo = Math.min(4, Math.floor(Math.min(...values, target ?? 9)));
  const hi = 9;
  const y = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const x = (i) => (points.length === 1 ? W - pad.r : pad.l + 6 + (i * (W - pad.l - pad.r - 6)) / (points.length - 1));

  const root = svg("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, width: W, height: H, tabindex: 0, role: "img" });
  root.setAttribute("aria-label", `Band dari ${points.length} tes, terakhir ${formatBand(values.at(-1))}`);
  for (let v = Math.ceil(lo); v <= hi; v++) {
    root.append(svg("line", { class: "grid", x1: pad.l, x2: W - pad.r + 6, y1: y(v), y2: y(v) }));
    if (v % 2 === 0) {
      const t = svg("text", { class: "tick", x: 0, y: y(v) + 3.5 });
      t.textContent = String(v);
      root.append(t);
    }
  }
  if (target != null) {
    root.append(svg("line", { class: "target", x1: pad.l, x2: W - pad.r + 6, y1: y(target), y2: y(target) }));
    const t = svg("text", { class: "target-label", x: pad.l + 4, y: y(target) - 4 });
    t.textContent = `target ${formatBand(target)}`;
    root.append(t);
  }
  if (points.length > 1) {
    root.append(svg("path", { class: "line", d: points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score.band).toFixed(1)}`).join("") }));
  }
  const xhair = svg("line", { class: "xhair", y1: pad.t - 4, y2: H - pad.b + 2, visibility: "hidden" });
  root.append(xhair);
  const dots = points.map((p, i) => {
    const c = svg("circle", { class: `pt${p.score.estimate ? " est" : ""}`, cx: x(i), cy: y(p.score.band), r: 4 });
    root.append(c);
    return c;
  });
  const end = svg("text", { class: "end-label", x: x(points.length - 1) + 9, y: y(values.at(-1)) + 4 });
  end.textContent = formatBand(values.at(-1));
  root.append(end);

  let active = -1;
  function focusPoint(i) {
    if (active > -1) dots[active].setAttribute("r", 4);
    active = i;
    dots[i].setAttribute("r", 6);
    xhair.setAttribute("x1", x(i));
    xhair.setAttribute("x2", x(i));
    xhair.setAttribute("visibility", "visible");
    const p = points[i];
    const box = root.getBoundingClientRect();
    showTip(box.left + x(i), box.top + y(p.score.band), `${p.score.estimate ? "≈ " : ""}${formatBand(p.score.band)}`, [fmtDate(p.date), p.title, scoreLine(p)]);
  }
  function clear() {
    if (active > -1) dots[active].setAttribute("r", 4);
    active = -1;
    xhair.setAttribute("visibility", "hidden");
    hideTip();
  }
  root.addEventListener("pointermove", (e) => {
    const px = e.clientX - root.getBoundingClientRect().left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    if (best !== active) focusPoint(best);
  });
  root.addEventListener("pointerleave", clear);
  root.addEventListener("focus", () => focusPoint(points.length - 1));
  root.addEventListener("blur", clear);
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" && active > 0) focusPoint(active - 1);
    if (e.key === "ArrowRight" && active < points.length - 1) focusPoint(active + 1);
  });
  holder.replaceChildren(root);
}

function deltaEl(cur, prev) {
  if (prev == null) return h("span", { class: "delta flat", text: "tes pertama" });
  const d = cur - prev;
  if (!d) return h("span", { class: "delta flat", text: "= sama" });
  return h("span", { class: `delta ${d > 0 ? "up" : "down"}` }, h("i", { text: d > 0 ? "▲" : "▼" }), `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}`, h("span", { class: "hint", text: " vs sebelumnya" }));
}

const sparkJobs = [];
function renderSkills(list) {
  sparkJobs.length = 0;
  const cards = SKILL_IDS.map((skill) => {
    const pts = series(list, skill);
    const card = h("article", { class: "card skill" }, h("h3", { text: SKILLS[skill].label }));
    if (!pts.length) {
      const n = list.filter((a) => a.skill === skill).length;
      card.append(h("p", { class: "none", text: n ? "Sudah dicatat, tapi tanpa band." : "Belum ada tes." }));
      return card;
    }
    const last = pts.at(-1);
    const holder = h("div");
    card.append(
      h("div", { class: "now" }, h("span", { class: `big${last.score.estimate ? " est" : ""}`, text: formatBand(last.score.band) }), deltaEl(last.score.band, pts.at(-2)?.score.band)),
      holder,
      h("p", { class: "meta", text: `${pts.length} tes · terakhir ${fmtDay(last.date)}` })
    );
    sparkJobs.push(() => drawSpark(holder, pts, state.settings.targetBand));
    return card;
  });
  $("#skills").replaceChildren(...cards);
  sparkJobs.forEach((job) => job());
}
let resizeTimer;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => sparkJobs.forEach((job) => job()), 80);
}).observe($("#skills"));

// ---------- question types ----------
// The type name links to the lesson that teaches it.
function lessonLink(type, text) {
  const id = lessonFor(typeSkill, type);
  return id ? h("a", { class: "type-link", href: `/learn/${id}`, text }) : text;
}

function renderTypes(list) {
  for (const b of $("#type-skill").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.skill === typeSkill));
  const stats = typeStats(list, typeSkill);
  const body = $("#type-body");
  if (!stats.length) {
    body.replaceChildren(h("p", { class: "empty", text: `Belum ada tes ${SKILLS[typeSkill].label} yang dicatat. Setelah 1–2 tes, tipe soal yang paling lemah akan terlihat di sini.` }));
    return;
  }
  const weak = stats.filter((s) => s.total >= 3 && s.accuracy < 0.75 && s.lost > 0).slice(0, 2);
  const focus = weak.length
    ? h("p", { class: "focus" }, "Fokus dulu: ", ...weak.flatMap((s, i) => [i ? " dan " : "", h("strong", {}, lessonLink(s.type, QTYPES[s.type])), ` (${Math.round(s.accuracy * 100)}% benar)`]), ". Buka materinya untuk strategi dan latihan mini.")
    : null;
  const head = h("div", { class: "trow trow-head" }, h("span", { text: "Tipe soal" }), h("span", { text: "Akurasi" }), h("span", { class: "num", text: "Benar" }), h("span", { class: "num", text: "Poin hilang" }));
  const rows = stats.map((s) => {
    const pct = Math.round(s.accuracy * 100);
    return h("div", { class: "trow" },
      h("div", { class: "name" }, lessonLink(s.type, QTYPES[s.type]), h("small", { text: `${s.tests} tes${s.total < 5 ? " · data masih sedikit" : ""}` })),
      h("div", { class: "bar", role: "img", "aria-label": `${pct}% benar` }, h("span", { style: `width:${pct}%` })),
      h("span", { class: "num acc", text: `${s.correct}/${s.total} · ${pct}%` }),
      h("span", { class: "num lost", text: s.lost ? `−${s.lost} poin` : "0" })
    );
  });
  body.replaceChildren(...[focus, head, ...rows].filter(Boolean));
}
$("#type-skill").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-skill]");
  if (!b) return;
  typeSkill = b.dataset.skill;
  renderTypes(scored());
});

// ---------- history ----------
function partsLabel(a) {
  if (a.score.full) return "Full test";
  const skipped = new Set(a.skippedParts || []);
  const done = [...new Set(a.groups.map((g) => g.part).filter((p) => p != null && !skipped.has(p)))];
  return done.length ? `Latihan Part ${done.join(", ")}` : "Latihan";
}

function renderHistory(list) {
  const body = $("#history-body");
  if (!list.length) {
    body.replaceChildren(h("p", { class: "empty" }, "Belum ada. ", h("a", { href: "/log", text: "Catat tes pertamamu" }), "."));
    return;
  }
  const saved = new URLSearchParams(location.search).get("saved");
  const rows = [...list].reverse().map((a) => {
    const s = a.score;
    const sub = [OBJECTIVE.has(a.skill) ? partsLabel(a) : null, a.minutes ? `${a.minutes} menit` : null].filter(Boolean).join(" · ");
    const title = a.url ? h("a", { class: "t-title ext", href: a.url, target: "_blank", rel: "noopener", text: a.title }) : h("span", { class: "t-title", text: a.title });
    const del = h("button", { class: "link-btn danger", type: "button", text: "Hapus" });
    armedButton(del, async () => {
      await api(`/api/attempts/${a.id}`, { method: "DELETE" });
      await load();
    });
    return h("tr", { class: a.id === saved ? "row-flash" : null },
      h("td", { class: "date", text: fmtDay(a.date) }),
      h("td", {}, title, sub ? h("small", { text: sub }) : null),
      h("td", { text: SKILLS[a.skill].label }),
      h("td", { class: "num", text: OBJECTIVE.has(a.skill) ? `${s.correct}/${s.total}` : "—" }),
      h("td", { class: "num", text: s.band == null ? "—" : `${s.estimate ? "≈" : ""}${formatBand(s.band)}` }),
      h("td", { class: "actions" }, h("a", { class: "link-btn", href: `/log?id=${a.id}`, text: "Ubah" }), del)
    );
  });
  const table = h("table", {},
    h("thead", {}, h("tr", {}, h("th", { text: "Tanggal" }), h("th", { text: "Tes" }), h("th", { text: "Skill" }), h("th", { class: "num", text: "Skor" }), h("th", { class: "num", text: "Band" }), h("th", {}))),
    h("tbody", {}, rows)
  );
  body.replaceChildren(h("div", { class: "scroll" }, table));
  if (saved) history.replaceState(null, "", "/");
}

// ---------- settings ----------
const dlg = $("#settings");
const form = $("#settings-form");
form.targetBand.replaceChildren(h("option", { value: "", text: "Belum ditentukan" }), ...BAND_STEPS.filter((b) => b >= 4).map((b) => h("option", { value: String(b), text: formatBand(b) })));
function openSettings() {
  const s = state.settings;
  form.name.value = state.profile?.name || "";
  form.role.value = s.role || "";
  form.examDate.value = s.examDate || "";
  form.targetBand.value = s.targetBand == null ? "" : String(s.targetBand);
  form.module.value = s.module || "";
  form.minutesPerDay.value = String(s.minutesPerDay || 45);
  $("#settings-msg").hidden = true;
  dlg.showModal();
}
$("#open-settings").addEventListener("click", openSettings);
$("#settings-cancel").addEventListener("click", () => dlg.close());
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    state.settings = await api("/api/settings", {
      method: "PUT",
      body: { name: form.name.value, role: form.role.value, examDate: form.examDate.value || null, targetBand: form.targetBand.value === "" ? null : Number(form.targetBand.value), module: form.module.value || null, minutesPerDay: Number(form.minutesPerDay.value) },
    });
    state.profile = { ...state.profile, name: state.settings.name };
    renameCurrentProfile(state.settings.name);
    dlg.close();
    render();
  } catch (err) {
    const msg = $("#settings-msg");
    msg.textContent = err.message;
    msg.hidden = false;
  }
});

async function load() {
  [state, lessons] = await Promise.all([api("/api/state"), api("/api/lessons").catch(() => [])]);
  render();
  // The sidebar's Pengaturan link on other pages lands here with ?settings=1.
  if (new URLSearchParams(location.search).has("settings")) {
    history.replaceState(null, "", "/");
    openSettings();
  }
}
load().catch((err) => {
  $("#kpis").replaceChildren(h("p", { class: "empty", text: `Gagal memuat data: ${err.message}` }));
});
