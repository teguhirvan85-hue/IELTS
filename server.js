// IELTS Coach — personal study companion for tests taken on engnovate.com.
// `npm start` serves the dashboard at http://127.0.0.1:3232 (zero dependencies).
// Data lives in data/db.json, one entry per learner profile (chosen with the "profile"
// cookie); test layouts read from engnovate are cached there too, shared by all profiles.
// Lessons and drills live in content/ (Markdown + JSON, audio made by `npm run audio`).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStore } from "./lib/store.js";
import { fetchTest, normalizeUrl } from "./lib/engnovate.js";
import { cleanAttempt, cleanSettings, cleanName, cleanDrillAnswers, cleanMistake, cleanCard, cleanGrade, cleanEssay, cleanSpeaking, cleanPlanMark, cleanPlanSnapshot } from "./lib/validate.js";
import { loadBank, markSpeaking } from "./lib/speaking.js";
import { loadPrompts, loadGuide, markEssay } from "./lib/writing.js";
import { createContent } from "./lib/content.js";
import { buildJournal, pruneMistakes } from "./lib/journal.js";
import { gradeDrill, newSrs, schedule, reviewQueue, todayISO, essayWords, slugify, planStreak } from "./public/shared.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3232;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(ROOT, "public");
const PAGES = {
  "/": "index.html",
  "/log": "log.html",
  "/learn": "learn.html",
  "/journal": "journal.html",
  "/writing": "writing.html",
  "/speaking": "speaking.html",
  "/speaking.js": "speaking.js",
  "/writing.js": "writing.js",
  "/chart.js": "chart.js",
  "/cards": "cards.html",
  "/journal.js": "journal.js",
  "/cards.js": "cards.js",
  "/md.js": "md.js",
  "/learn.js": "learn.js",
  "/lesson.js": "lesson.js",
  "/app.css": "app.css",
  "/shared.js": "shared.js",
  "/ui.js": "ui.js",
  "/dashboard.js": "dashboard.js",
  "/log.js": "log.js",
  "/favicon.svg": "favicon.svg",
  "/pilih": "profiles.html",
  "/profiles.js": "profiles.js",
};
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".m4a": "audio/mp4" };
const content = createContent(path.join(ROOT, "content"));
const LESSON_RE = /^[a-z0-9-]{1,40}$/;

// DATA_DIR lets a second copy run on sample data without touching the real data/.
const store = createStore(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data"));

// ---------- marking queue ----------
// Essays and Speaking sessions are marked one at a time by the Claude CLI. Anything still
// "pending" when the server starts was cut off by a restart, so it is offered for a retry.
for (const prof of Object.values(store.db.profiles)) {
  for (const item of [...prof.essays, ...prof.speaking]) {
    if (item.status === "pending") Object.assign(item, { status: "error", error: "Penilaian terputus karena aplikasi dimulai ulang.", hint: "Klik Kirim ulang." });
  }
}
store.save();
let queue = Promise.resolve();
const MARKERS = { essays: markEssay, speaking: markSpeaking };
function enqueueMarking(profileId, kind, itemId) {
  queue = queue.then(async () => {
    const prof = store.db.profiles[profileId];
    const item = prof?.[kind].find((e) => e.id === itemId);
    if (!item || item.status !== "pending") return;
    try {
      item.feedback = await MARKERS[kind](item, prof.settings);
      item.status = "done";
      delete item.error;
      delete item.hint;
    } catch (err) {
      Object.assign(item, { status: "error", error: err.message, hint: err.hint || null });
      if (!err.hint) console.error(err);
    }
    item.markedAt = new Date().toISOString();
    store.save();
  });
}

function speakingSummary(s) {
  return { id: s.id, mode: s.mode, title: s.title, answers: s.answers.length, status: s.status, band: s.feedback?.band ?? null, createdAt: s.createdAt };
}

// Recordings of Speaking answers live in <data>/audio/<profile>/<session>-<n>.<ext>.
const AUDIO_TYPES = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" };
const AUDIO_MIME = { webm: "audio/webm", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg" };
const audioDir = (profileId) => path.join(store.dir, "audio", profileId);

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("Rekaman terlalu besar."), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function essaySummary(e) {
  return { id: e.id, task: e.task, module: e.module, title: e.prompt.title || "Soal sendiri", words: e.words, status: e.status, band: e.feedback?.band ?? null, createdAt: e.createdAt };
}
const ID_RE = /^[a-z0-9]{8,32}$/;

function send(res, status, body, type = "application/json; charset=utf-8", headers = {}) {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...headers });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

const PROFILE_COOKIE = (id) => `profile=${id}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`;

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 256 * 1024) {
        reject(Object.assign(new Error("Data terlalu besar."), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(Object.assign(new Error("JSON tidak valid."), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function api(req, res, url) {
  const { db } = store;
  const method = req.method;
  const p = url.pathname;
  const P = store.profile(cookies(req).profile);

  // ---------- profiles ----------
  if (p === "/api/profiles" && method === "GET") {
    const chosen = Boolean(db.profiles[cookies(req).profile]);
    const today = todayISO();
    // Each learner's progress today and their streak, for the "who's studying?" cards.
    const profiles = Object.values(db.profiles).map((x) => ({
      id: x.id, name: x.name, role: x.settings.role, slug: slugify(x.name), module: x.settings.module, targetBand: x.settings.targetBand, examDate: x.settings.examDate,
      today: { done: x.plan[today]?.done?.length || 0, total: x.plan[today]?.tasks?.length || 0 },
      streak: planStreak(x.plan, today),
    }));
    return send(res, 200, { active: P.id, chosen, profiles });
  }
  if (p === "/api/profiles" && method === "POST") {
    const created = store.addProfile(cleanName((await readJson(req))?.name));
    store.save();
    return send(res, 201, { id: created.id, name: created.name });
  }
  const pm = p.match(/^\/api\/profiles\/(p[a-z0-9]{1,16})\/activate$/);
  if (pm && method === "POST") {
    if (!db.profiles[pm[1]]) return send(res, 404, { error: "Profil tidak ditemukan." });
    return send(res, 200, { active: pm[1] }, undefined, { "set-cookie": PROFILE_COOKIE(pm[1]) });
  }

  if (p === "/api/state" && method === "GET") {
    // "today" feeds the dashboard's Hari ini row.
    const today = {
      cardsDue: reviewQueue(P.cards, todayISO()).length,
      cardsTotal: P.cards.length,
      journalOpen: buildJournal(P, db.tests).filter((i) => !i.reason).length,
    };
    const essays = P.essays.filter((e) => e.status === "done").map(essaySummary);
    const speaking = P.speaking.filter((x) => x.status === "done").map(speakingSummary);
    return send(res, 200, { profile: { id: P.id, name: P.name }, settings: P.settings, attempts: P.attempts, drillAttempts: P.drillAttempts, essays, speaking, plan: P.plan, today });
  }

  if (p === "/api/settings" && method === "PUT") {
    const input = await readJson(req);
    Object.assign(P.settings, cleanSettings(input));
    if (input && "name" in input) P.name = cleanName(input.name);
    store.save();
    return send(res, 200, { ...P.settings, name: P.name });
  }

  // Test layout from an engnovate link. Cached per link; ?refresh=1 reads the page again.
  if (p === "/api/engnovate" && method === "GET") {
    const link = normalizeUrl(url.searchParams.get("url"));
    let test = db.tests[link];
    if (!test || url.searchParams.get("refresh") === "1") {
      test = { ...(await fetchTest(link)), fetchedAt: new Date().toISOString() };
      db.tests[link] = test;
      store.save();
    }
    return send(res, 200, test);
  }

  if (p === "/api/lessons" && method === "GET") return send(res, 200, content.summary());

  const lm = p.match(/^\/api\/lessons\/([^/]+)$/);
  if (lm && method === "GET") {
    const lesson = LESSON_RE.test(lm[1]) && content.lesson(lm[1]);
    if (!lesson) return send(res, 404, { error: "Materi tidak ditemukan." });
    return send(res, 200, { ...lesson, attempts: P.drillAttempts.filter((a) => a.lesson === lm[1]) });
  }

  // A finished drill. The server marks it again from the raw answers, so the stored
  // score never depends on the page.
  const dm = p.match(/^\/api\/drills\/([^/]+)\/attempts$/);
  if (dm && method === "POST") {
    const drill = LESSON_RE.test(dm[1]) && content.drill(dm[1]);
    if (!drill) return send(res, 404, { error: "Latihan tidak ditemukan." });
    const answers = cleanDrillAnswers(drill, await readJson(req));
    const { correct, total } = gradeDrill(drill, answers);
    const attempt = { id: crypto.randomBytes(6).toString("hex"), drill: drill.id, lesson: drill.lesson, skill: drill.skill, answers, correct, total, createdAt: new Date().toISOString() };
    P.drillAttempts.push(attempt);
    store.save();
    return send(res, 201, attempt);
  }

  // ---------- writing lab ----------
  if (p === "/api/writing" && method === "GET") {
    return send(res, 200, { profile: P.id, module: P.settings.module, targetBand: P.settings.targetBand, prompts: loadPrompts(content.dir) });
  }
  const gm = p.match(/^\/api\/writing\/guide\/(gt-task1|ac-task1|task2)$/);
  if (gm && method === "GET") {
    const markdown = loadGuide(content.dir, gm[1]);
    return markdown ? send(res, 200, { markdown }) : send(res, 404, { error: "Panduan belum tersedia." });
  }
  if (p === "/api/essays" && method === "GET") return send(res, 200, { essays: P.essays.map(essaySummary).reverse() });
  if (p === "/api/essays" && method === "POST") {
    const input = cleanEssay(await readJson(req));
    let prompt;
    if (input.promptId) {
      prompt = loadPrompts(content.dir).find((x) => x.id === input.promptId);
      if (!prompt) return send(res, 400, { error: "Soal tidak ditemukan." });
    } else prompt = { custom: input.custom, title: input.custom.split("\n")[0].slice(0, 60) };
    const essay = {
      id: crypto.randomBytes(6).toString("hex"),
      task: prompt.task || input.task,
      module: prompt.module === "academic" || prompt.module === "general" ? prompt.module : input.module,
      prompt,
      text: input.text,
      words: essayWords(input.text),
      minutes: input.minutes,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    P.essays.push(essay);
    store.save();
    enqueueMarking(P.id, "essays", essay.id);
    return send(res, 202, essay);
  }
  const em = p.match(/^\/api\/essays\/([a-f0-9]{8,32})(\/retry)?$/);
  if (em) {
    const i = P.essays.findIndex((e) => e.id === em[1]);
    if (i === -1) return send(res, 404, { error: "Tulisan tidak ditemukan." });
    const essay = P.essays[i];
    if (!em[2] && method === "GET") return send(res, 200, essay);
    if (em[2] && method === "POST") {
      if (essay.status !== "error") return send(res, 409, { error: "Tulisan ini tidak sedang gagal dinilai." });
      essay.status = "pending";
      store.save();
      enqueueMarking(P.id, "essays", essay.id);
      return send(res, 202, essay);
    }
    if (!em[2] && method === "DELETE") {
      P.essays.splice(i, 1);
      store.trash({ profile: P.id, essay });
      store.save();
      return send(res, 200, { ok: true });
    }
  }

  // ---------- speaking ----------
  if (p === "/api/speaking" && method === "GET") return send(res, 200, { ...loadBank(content.dir), targetBand: P.settings.targetBand });
  if (p === "/api/speaking/sessions" && method === "GET") return send(res, 200, { sessions: P.speaking.map(speakingSummary).reverse() });
  if (p === "/api/speaking/sessions" && method === "POST") {
    const session = { id: crypto.randomBytes(6).toString("hex"), ...cleanSpeaking(await readJson(req)), status: "pending", createdAt: new Date().toISOString() };
    session.answers = session.answers.map((a) => ({ ...a, audio: null }));
    P.speaking.push(session);
    store.save();
    enqueueMarking(P.id, "speaking", session.id);
    return send(res, 202, session);
  }
  const sm = p.match(/^\/api\/speaking\/sessions\/([a-f0-9]{8,32})(?:\/(retry)|\/audio\/(\d{1,2}))?$/);
  if (sm) {
    const i = P.speaking.findIndex((x) => x.id === sm[1]);
    if (i === -1) return send(res, 404, { error: "Sesi tidak ditemukan." });
    const session = P.speaking[i];
    if (sm[3] != null) {
      const answer = session.answers[Number(sm[3])];
      if (!answer) return send(res, 404, { error: "Jawaban tidak ditemukan." });
      if (method === "POST") {
        const type = String(req.headers["content-type"] || "").split(";")[0].trim();
        const ext = AUDIO_TYPES[type];
        if (!ext) return send(res, 415, { error: "Format rekaman tidak didukung." });
        const body = await readRaw(req, 15 * 1024 * 1024);
        fs.mkdirSync(audioDir(P.id), { recursive: true });
        answer.audio = `${session.id}-${sm[3]}.${ext}`;
        fs.writeFileSync(path.join(audioDir(P.id), answer.audio), body);
        store.save();
        return send(res, 200, { ok: true });
      }
      if (method === "GET" && answer.audio) return sendFile(req, res, path.join(audioDir(P.id), answer.audio), AUDIO_MIME[answer.audio.split(".").pop()]);
      return send(res, 404, { error: "Rekaman tidak ada." });
    }
    if (!sm[2] && method === "GET") return send(res, 200, session);
    if (sm[2] && method === "POST") {
      if (session.status !== "error") return send(res, 409, { error: "Sesi ini tidak sedang gagal dinilai." });
      session.status = "pending";
      store.save();
      enqueueMarking(P.id, "speaking", session.id);
      return send(res, 202, session);
    }
    if (!sm[2] && method === "DELETE") {
      P.speaking.splice(i, 1);
      for (const a of session.answers) if (a.audio) fs.rmSync(path.join(audioDir(P.id), a.audio), { force: true });
      store.trash({ profile: P.id, speaking: session });
      store.save();
      return send(res, 200, { ok: true });
    }
  }

  // ---------- daily plan: the day's tasks (kept once shown) and which are done ----------
  if (p === "/api/plan/snapshot" && method === "POST") {
    const { date, tasks, force } = cleanPlanSnapshot(await readJson(req));
    const day = P.plan[date];
    if (!day?.tasks?.length || force) P.plan[date] = { tasks, done: (day?.done || []).filter((id) => tasks.some((t) => t.id === id)) };
    // Keep about two months of history; older days don't matter for the plan or the streak.
    for (const d of Object.keys(P.plan).sort().slice(0, -60)) delete P.plan[d];
    store.save();
    return send(res, 200, P.plan[date]);
  }
  if (p === "/api/plan" && method === "POST") {
    const { date, id, done } = cleanPlanMark(await readJson(req));
    const day = (P.plan[date] ||= { tasks: [], done: [] });
    const list = new Set(day.done);
    done ? list.add(id) : list.delete(id);
    day.done = [...list];
    store.save();
    return send(res, 200, day);
  }

  // ---------- mistake journal ----------
  if (p === "/api/journal" && method === "GET") return send(res, 200, { items: buildJournal(P, db.tests) });

  const mk = p.match(/^\/api\/mistakes\/([a-f0-9]{8,32}):(\d{1,2})$/);
  if (mk && method === "PUT") {
    const key = `${mk[1]}:${Number(mk[2])}`;
    if (!buildJournal(P, db.tests).some((i) => i.key === key)) return send(res, 404, { error: "Jawaban salah ini tidak ditemukan." });
    P.mistakes[key] = { ...cleanMistake(await readJson(req)), updatedAt: new Date().toISOString() };
    store.save();
    return send(res, 200, P.mistakes[key]);
  }

  // ---------- flashcards ----------
  if (p === "/api/cards" && method === "GET") return send(res, 200, { cards: P.cards, today: todayISO() });

  if (p === "/api/cards" && method === "POST") {
    const now = new Date().toISOString();
    const card = { id: crypto.randomBytes(6).toString("hex"), ...cleanCard(await readJson(req)), createdAt: now, updatedAt: now, srs: newSrs() };
    P.cards.push(card);
    store.save();
    return send(res, 201, card);
  }

  const cm = p.match(/^\/api\/cards\/([a-f0-9]{8,32})(\/review)?$/);
  if (cm) {
    const i = P.cards.findIndex((c) => c.id === cm[1]);
    if (i === -1) return send(res, 404, { error: "Kartu tidak ditemukan." });
    if (cm[2] && method === "POST") {
      const grade = cleanGrade(await readJson(req));
      P.cards[i].srs = schedule(P.cards[i].srs, grade, todayISO());
      store.save();
      return send(res, 200, P.cards[i]);
    }
    if (!cm[2] && method === "PUT") {
      const { front, back, example } = cleanCard(await readJson(req));
      Object.assign(P.cards[i], { front, back, example, updatedAt: new Date().toISOString() });
      store.save();
      return send(res, 200, P.cards[i]);
    }
    if (!cm[2] && method === "DELETE") {
      const [gone] = P.cards.splice(i, 1);
      store.trash({ profile: P.id, card: gone });
      store.save();
      return send(res, 200, { ok: true });
    }
  }

  // Ready-made decks: how many of their cards you already have, and importing the rest.
  const owned = () => new Set(P.cards.map((c) => c.front.trim().toLowerCase()));
  if (p === "/api/decks" && method === "GET") {
    const have = owned();
    return send(res, 200, content.decks().map((d) => ({ id: d.id, title: d.title, description: d.description, count: d.cards.length, owned: d.cards.filter((c) => have.has(c.front.trim().toLowerCase())).length })));
  }
  const dk = p.match(/^\/api\/decks\/([a-z0-9-]{1,40})\/import$/);
  if (dk && method === "POST") {
    const deck = content.decks().find((d) => d.id === dk[1]);
    if (!deck) return send(res, 404, { error: "Paket tidak ditemukan." });
    const have = owned();
    const now = new Date().toISOString();
    let added = 0;
    for (const c of deck.cards) {
      if (have.has(c.front.trim().toLowerCase())) continue;
      P.cards.push({ id: crypto.randomBytes(6).toString("hex"), ...cleanCard({ ...c, source: { kind: "deck", ref: deck.id } }), createdAt: now, updatedAt: now, srs: newSrs() });
      added++;
    }
    store.save();
    return send(res, 200, { added });
  }

  if (p === "/api/attempts" && method === "POST") {
    const now = new Date().toISOString();
    const attempt = { id: crypto.randomBytes(6).toString("hex"), ...cleanAttempt(await readJson(req)), createdAt: now, updatedAt: now };
    P.attempts.push(attempt);
    store.save();
    return send(res, 201, attempt);
  }

  const m = p.match(/^\/api\/attempts\/([^/]+)$/);
  if (m) {
    if (!ID_RE.test(m[1])) return send(res, 400, { error: "ID tidak valid." });
    const i = P.attempts.findIndex((a) => a.id === m[1]);
    if (i === -1) return send(res, 404, { error: "Tes tidak ditemukan." });
    if (method === "GET") return send(res, 200, P.attempts[i]);
    if (method === "PUT") {
      const old = P.attempts[i];
      P.attempts[i] = { id: old.id, ...cleanAttempt(await readJson(req)), createdAt: old.createdAt, updatedAt: new Date().toISOString() };
      pruneMistakes(P, db.tests);
      store.save();
      return send(res, 200, P.attempts[i]);
    }
    if (method === "DELETE") {
      const [gone] = P.attempts.splice(i, 1);
      store.trash({ profile: P.id, attempt: gone });
      pruneMistakes(P, db.tests);
      store.save();
      return send(res, 200, { ok: true });
    }
  }
  return send(res, 404, { error: "Tidak ada." });
}

// Audio and images for drills. Audio answers byte ranges: Safari will not play
// an <audio> source that can't seek.
const MEDIA_RE = /^\/content\/(audio|img)\/([a-z0-9-]+\.(m4a|svg|png))$/;
function sendContentFile(req, res, pathname) {
  const m = pathname.match(MEDIA_RE);
  if (!m || req.method !== "GET") return send(res, 404, "Not found", "text/plain; charset=utf-8");
  return sendFile(req, res, path.join(content.dir, m[1], m[2]), TYPES["." + m[3]]);
}

function sendFile(req, res, file, type) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-cache" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, stat.size - 1);
    if (start > end) {
      res.writeHead(416, { "content-range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${stat.size}`, "content-length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "content-length": stat.size });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/content/")) return sendContentFile(req, res, url.pathname);

    // A personal link opens that learner's profile directly.
    const link = url.pathname.match(/^\/p\/([a-z0-9-]{1,60})$/);
    if (link) {
      const target = Object.values(store.db.profiles).find((x) => slugify(x.name) === link[1] || x.id === link[1]);
      res.writeHead(302, { location: target ? "/" : "/pilih", ...(target ? { "set-cookie": PROFILE_COOKIE(target.id) } : {}) });
      return res.end();
    }
    const file = /^\/learn\/[a-z0-9-]+$/.test(url.pathname) ? "lesson.html" : PAGES[url.pathname];
    // With more than one learner, a browser that hasn't picked a profile starts at "who's studying?".
    if (file?.endsWith(".html") && file !== "profiles.html" && Object.keys(store.db.profiles).length > 1 && !store.db.profiles[cookies(req).profile]) {
      res.writeHead(302, { location: `/pilih?next=${encodeURIComponent(url.pathname + url.search)}` });
      return res.end();
    }
    if (!file || req.method !== "GET") return send(res, 404, "Not found", "text/plain; charset=utf-8");
    const body = fs.readFileSync(path.join(PUBLIC_DIR, file));
    return send(res, 200, body, TYPES[path.extname(file)]);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) send(res, status, { error: status === 500 ? "Terjadi kesalahan di server." : err.message });
  }
});

server.listen(PORT, HOST, () => console.log(`IELTS Coach → http://${HOST}:${PORT}`));
