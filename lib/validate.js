// Input checks for the API. Everything the browser sends is rebuilt field by field.
import { SKILLS, OBJECTIVE, MODULES, QTYPES, REASONS, questionKey } from "../public/shared.js";
import { normalizeUrl } from "./engnovate.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CRITERIA = { writing: ["ta", "cc", "lr", "gra"], speaking: ["fc", "lr", "gra", "p"] };

function fail(msg) {
  throw Object.assign(new Error(msg), { status: 400 });
}
function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function text(v, max, name) {
  if (v == null) return "";
  if (typeof v !== "string") fail(`${name} harus berupa teks.`);
  return v.trim().slice(0, max);
}
function band(v, name) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 9 || (n * 2) % 1 !== 0) fail(`${name} harus 0–9 dengan kelipatan 0.5.`);
  return n;
}
function isoDate(v, name) {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v))) fail(`${name} harus tanggal (YYYY-MM-DD).`);
  return v;
}
function int(v, min, max, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${name} harus angka ${min}–${max}.`);
  return n;
}

export function cleanSettings(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  const out = {};
  if ("examDate" in input) out.examDate = isoDate(input.examDate, "Tanggal ujian");
  if ("targetBand" in input) out.targetBand = band(input.targetBand, "Target band");
  if ("module" in input) {
    if (input.module != null && !(input.module in MODULES)) fail("Modul tidak dikenal.");
    out.module = input.module ?? null;
  }
  if ("minutesPerDay" in input) out.minutesPerDay = int(input.minutesPerDay, 10, 240, "Menit belajar per hari");
  if ("role" in input) out.role = text(input.role, 20, "Peran") || null;
  return out;
}

function cleanGroups(list) {
  if (!Array.isArray(list) || list.length > 40) fail("Daftar grup soal tidak valid.");
  const used = new Set();
  const groups = list.map((g, i) => {
    if (!isObject(g)) fail(`Grup ${i + 1} tidak valid.`);
    const from = int(g.from, 1, 40, "Nomor soal");
    const to = int(g.to, from, 40, "Nomor soal");
    for (let n = from; n <= to; n++) {
      if (used.has(n)) fail(`Soal nomor ${n} ada di dua grup.`);
      used.add(n);
    }
    const type = g.type in QTYPES ? g.type : "other";
    const part = g.part == null || g.part === "" ? null : int(g.part, 1, 4, "Part");
    const wrong = Array.isArray(g.wrong) ? [...new Set(g.wrong.map(Number))].filter((n) => Number.isInteger(n) && n >= from && n <= to).sort((a, b) => a - b) : [];
    return { from, to, type, part, wrong };
  });
  return groups.sort((a, b) => a.from - b.from);
}

export function cleanAttempt(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  if (!(input.skill in SKILLS)) fail("Skill harus listening, reading, writing atau speaking.");
  const skill = input.skill;
  const out = {
    skill,
    module: input.module in MODULES ? input.module : "academic",
    title: text(input.title, 200, "Judul") || `${SKILLS[skill].label} test`,
    url: input.url ? normalizeUrl(input.url) : "",
    date: isoDate(input.date, "Tanggal") || fail("Tanggal wajib diisi."),
    minutes: input.minutes == null || input.minutes === "" ? null : int(input.minutes, 1, 600, "Durasi"),
    notes: text(input.notes, 4000, "Catatan"),
  };
  if (OBJECTIVE.has(skill)) {
    out.groups = cleanGroups(input.groups);
    if (!out.groups.length) fail("Tambahkan minimal satu grup soal.");
    const parts = new Set(out.groups.map((g) => g.part));
    out.skippedParts = Array.isArray(input.skippedParts) ? [...new Set(input.skippedParts.map(Number))].filter((p) => parts.has(p)) : [];
    if (out.groups.every((g) => out.skippedParts.includes(g.part))) fail("Semua part dilewati, tidak ada yang dihitung.");
  } else {
    out.band = band(input.band, "Band");
    out.criteria = {};
    for (const k of CRITERIA[skill]) out.criteria[k] = band(input.criteria?.[k], "Nilai kriteria");
  }
  return out;
}

// Answers to one drill: only its own question keys, short strings or short lists of letters.
export function cleanDrillAnswers(drill, input) {
  if (!isObject(input) || !isObject(input.answers)) fail("Jawaban harus objek JSON.");
  const out = {};
  for (const q of drill.questions) {
    const key = questionKey(q);
    const v = input.answers[key];
    if (v == null || v === "") continue;
    if (Array.isArray(v)) out[key] = v.filter((x) => typeof x === "string").map((x) => x.slice(0, 10)).slice(0, 5);
    else if (typeof v === "string") out[key] = v.slice(0, 120);
    else fail(`Jawaban soal ${key} tidak valid.`);
  }
  return out;
}

// A reason (and optional notes) for one wrong answer in the journal.
export function cleanMistake(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  if (input.reason != null && !(input.reason in REASONS)) fail("Alasan tidak dikenal.");
  return {
    reason: input.reason ?? null,
    mine: text(input.mine, 80, "Jawabanmu"),
    correct: text(input.correct, 80, "Jawaban benar"),
    note: text(input.note, 500, "Catatan"),
  };
}

const SOURCES = new Set(["manual", "test", "drill", "deck"]);
export function cleanCard(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  const front = text(input.front, 120, "Depan");
  const back = text(input.back, 300, "Belakang");
  if (!front) fail("Sisi depan kartu wajib diisi.");
  if (!back) fail("Sisi belakang kartu wajib diisi.");
  const source = isObject(input.source) && SOURCES.has(input.source.kind)
    ? { kind: input.source.kind, ref: text(input.source.ref, 80, "Sumber") }
    : { kind: "manual", ref: "" };
  return { front, back, example: text(input.example, 300, "Contoh"), source };
}

export function cleanGrade(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  const g = Number(input.grade);
  if (![0, 1, 2, 3].includes(g)) fail("Nilai review harus 0–3.");
  return g;
}

export function cleanName(v) {
  const name = text(v, 40, "Nama");
  if (!name) fail("Nama profil wajib diisi.");
  return name;
}

// An essay sent for marking. The prompt is either one from the bank (looked up by the
// server) or the learner's own, pasted as text.
export function cleanEssay(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  const task = Number(input.task);
  if (task !== 1 && task !== 2) fail("Task harus 1 atau 2.");
  const module = input.module === "academic" ? "academic" : "general";
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length < 40) fail("Tulisanmu masih terlalu pendek untuk dinilai.");
  if (text.length > 20000) fail("Tulisan terlalu panjang.");
  const promptId = typeof input.promptId === "string" && /^[a-z0-9-]{1,20}$/.test(input.promptId) ? input.promptId : null;
  const custom = text_(input.custom, 4000);
  if (!promptId && !custom) fail("Pilih soal dari daftar, atau tulis soalmu sendiri.");
  const minutes = input.minutes == null || input.minutes === "" ? null : int(input.minutes, 1, 180, "Waktu");
  return { task, module, text, promptId, custom, minutes };
}
function text_(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// A recorded Speaking session: the questions, the transcripts and how long each answer took.
const SPEAKING_MODES = new Set(["part1", "part2", "full"]);
export function cleanSpeaking(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  if (!SPEAKING_MODES.has(input.mode)) fail("Jenis latihan tidak dikenal.");
  if (!Array.isArray(input.answers) || !input.answers.length || input.answers.length > 20) fail("Daftar jawaban tidak valid.");
  const answers = input.answers.map((a, i) => {
    if (!isObject(a)) fail(`Jawaban ${i + 1} tidak valid.`);
    const part = Number(a.part);
    if (![1, 2, 3].includes(part)) fail(`Part jawaban ${i + 1} harus 1, 2 atau 3.`);
    const seconds = Number(a.seconds);
    return {
      part,
      question: text(a.question, 800, "Pertanyaan"),
      transcript: text(a.transcript, 6000, "Transkrip"),
      seconds: Number.isFinite(seconds) && seconds >= 0 ? Math.min(600, Math.round(seconds)) : 0,
    };
  });
  const words = answers.reduce((n, a) => n + (a.transcript.match(/\S+/g) || []).length, 0);
  if (words < 10) fail("Transkripnya masih terlalu pendek untuk dinilai.");
  return { mode: input.mode, title: text(input.title, 120, "Judul") || "Latihan Speaking", answers };
}

// Today's plan as first shown, kept for the day so finished tasks stay on the list.
export function cleanPlanSnapshot(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) fail("Tanggal tidak valid.");
  if (!Array.isArray(input.tasks) || input.tasks.length > 10) fail("Daftar tugas tidak valid.");
  const tasks = input.tasks.map((t) => {
    if (!isObject(t) || typeof t.id !== "string" || !/^[a-z0-9:_-]{1,60}$/.test(t.id)) fail("Tugas tidak valid.");
    const href = text(t.href, 200, "Link");
    if (href && !href.startsWith("/") && !href.startsWith("https://engnovate.com/")) fail("Link tugas tidak valid.");
    return { id: t.id, title: text(t.title, 120, "Judul"), detail: text(t.detail, 300, "Keterangan"), minutes: int(t.minutes, 1, 240, "Menit"), href, external: Boolean(t.external) };
  });
  return { date: input.date, tasks, force: Boolean(input.force) };
}

export function cleanPlanMark(input) {
  if (!isObject(input)) fail("Body harus objek JSON.");
  if (typeof input.date !== "string" || !DATE_RE.test(input.date)) fail("Tanggal tidak valid.");
  if (typeof input.id !== "string" || !/^[a-z0-9:_-]{1,60}$/.test(input.id)) fail("Tugas tidak valid.");
  return { date: input.date, id: input.id, done: Boolean(input.done) };
}
