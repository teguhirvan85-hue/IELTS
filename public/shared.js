// Shared by the server (Node) and the browser: skills, question types, band tables
// and scoring. Plain ES module with no dependencies.

export const SKILLS = {
  listening: { label: "Listening", short: "L" },
  reading: { label: "Reading", short: "R" },
  writing: { label: "Writing", short: "W" },
  speaking: { label: "Speaking", short: "S" },
};
export const SKILL_IDS = Object.keys(SKILLS);
export const OBJECTIVE = new Set(["listening", "reading"]);

export const MODULES = { academic: "Academic", general: "General Training" };

// IELTS question types, named the way IELTS material names them.
export const QTYPES = {
  tfng: "True / False / Not Given",
  ynng: "Yes / No / Not Given",
  mcq: "Multiple choice",
  mcq_multi: "Multiple choice (pilih 2+)",
  headings: "Matching headings",
  matching_info: "Matching information",
  matching_features: "Matching features",
  endings: "Matching sentence endings",
  summary: "Summary completion",
  notes: "Note completion",
  table: "Table completion",
  flowchart: "Flow-chart completion",
  sentence: "Sentence completion",
  form: "Form completion",
  diagram: "Diagram labelling",
  map: "Map / plan labelling",
  short: "Short answer",
  other: "Lainnya",
};

// First match wins, so the specific patterns sit above the generic ones
// ("Complete the summary using the list of…" is a summary, not matching features).
const TYPE_RULES = [
  ["ynng", /\bwrite\s+yes\b|\byes\s+if\b/],
  ["tfng", /\bwrite\s+true\b|\btrue\s+if\b/],
  ["headings", /list of headings|correct heading/],
  ["endings", /correct ending/],
  ["map", /label the (map|plan)\b/],
  ["diagram", /label the (diagram|chart|picture|figure|drawing|illustration)/],
  ["mcq_multi", /choose (two|three|four|five) letters|which (two|three)\b/],
  ["flowchart", /complete the flow[\s-]?chart/],
  ["table", /complete the table/],
  ["form", /complete the form/],
  ["notes", /complete the notes/],
  ["summary", /complete the summary/],
  ["sentence", /complete the sentences|complete each sentence/],
  ["matching_info", /which (paragraph|section)|for which .{0,40}\b(is|are) the following|which (review|advert|advertisement|text|description|notice|extract)/],
  ["matching_features", /match each|list of [a-z]+|correct (person|people|researcher|scientist|expert|writer)|from the box|next to questions/],
  ["short", /answer the questions/],
  ["mcq", /choose the correct (letter|answer)/],
];

export function classifyInstruction(text) {
  const t = String(text || "").toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  for (const [type, re] of TYPE_RULES) if (re.test(t)) return type;
  return "other";
}

// Raw score (out of 40) → band. Rows are [minimum raw score, band], highest first.
// Listening is the same for both modules; Reading has an Academic and a General Training table.
const BAND_TABLES = {
  listening: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [1, 2], [0, 0]],
  readingAcademic: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [1, 2], [0, 0]],
  readingGeneral: [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5], [1, 2], [0, 0]],
};

export function rawToBand(skill, module, raw) {
  const table = skill === "listening" ? BAND_TABLES.listening
    : module === "general" ? BAND_TABLES.readingGeneral : BAND_TABLES.readingAcademic;
  for (const [min, band] of table) if (raw >= min) return band;
  return 0;
}

// IELTS rounds the average to the nearest half band, with .25 and .75 rounding up.
export function roundBand(x) {
  return Math.round(x * 2) / 2;
}

export const BAND_STEPS = Array.from({ length: 19 }, (_, i) => i * 0.5);
export function formatBand(b) {
  return b == null ? "—" : Number(b).toFixed(1);
}

export function groupSize(g) {
  return g.to - g.from + 1;
}

// Score of one attempt. Listening/Reading: counted from the groups that were done.
// A full test (all 40 answered) gets a real band; a partial one only an estimate
// scaled to 40, because passages differ in difficulty.
export function scoreAttempt(a) {
  if (!OBJECTIVE.has(a.skill)) {
    return { band: a.band ?? null, estimate: false, full: true, correct: null, total: null };
  }
  const skipped = new Set(a.skippedParts || []);
  let total = 0;
  let wrong = 0;
  for (const g of a.groups || []) {
    if (skipped.has(g.part)) continue;
    total += groupSize(g);
    wrong += (g.wrong || []).length;
  }
  const correct = total - wrong;
  if (!total) return { band: null, estimate: false, full: false, correct: 0, total: 0 };
  const full = total === 40;
  const raw = full ? correct : Math.round((correct / total) * 40);
  return { band: rawToBand(a.skill, a.module, raw), estimate: !full, full, correct, total };
}

// Per question type: questions answered, correct, and points lost, over L/R attempts of one skill.
export function typeStats(attempts, skill) {
  const by = new Map();
  for (const a of attempts) {
    if (a.skill !== skill) continue;
    const skipped = new Set(a.skippedParts || []);
    for (const g of a.groups || []) {
      if (skipped.has(g.part)) continue;
      const s = by.get(g.type) || { type: g.type, total: 0, correct: 0, lost: 0, tests: new Set() };
      const n = groupSize(g);
      const w = (g.wrong || []).length;
      s.total += n;
      s.correct += n - w;
      s.lost += w;
      s.tests.add(a.id);
      by.set(g.type, s);
    }
  }
  return [...by.values()]
    .map((s) => ({ ...s, tests: s.tests.size, accuracy: s.total ? s.correct / s.total : 0 }))
    .sort((x, y) => y.lost - x.lost || x.accuracy - y.accuracy);
}

// "3, 5, 12-14" → [3, 5, 12, 13, 14], limited to 1..40.
export function parseNumberList(text) {
  const out = new Set();
  for (const part of String(text || "").split(/[\s,;]+/)) {
    const m = part.match(/^(\d{1,2})(?:[-–](\d{1,2}))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) if (n >= 1 && n <= 40) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

// [3, 5, 12, 13, 14] → "3, 5, 12-14"
export function formatNumberList(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j - i >= 2 ? `${sorted[i]}-${sorted[j]}` : sorted.slice(i, j + 1).join(", "));
    i = j;
  }
  return parts.join(", ");
}

// Default question layout when a test is entered by hand.
export function defaultGroups(skill) {
  if (skill === "listening") return [1, 2, 3, 4].map((p) => ({ from: p * 10 - 9, to: p * 10, type: "other", part: p, wrong: [] }));
  if (skill === "reading") return [[1, 13, 1], [14, 26, 2], [27, 40, 3]].map(([from, to, part]) => ({ from, to, type: "other", part, wrong: [] }));
  return [];
}

export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysUntil(iso, from = new Date()) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target - start) / 86400000);
}

// ---------- lessons & drills ----------

// Which lesson teaches a question type. Reading and Listening share type ids but
// have their own lessons; several gap-fill types share one completion lesson.
const LESSON_BY_TYPE = {
  reading: {
    tfng: "tfng", ynng: "ynng", headings: "headings", matching_info: "matching-info",
    matching_features: "matching-features", endings: "endings", mcq: "mcq", mcq_multi: "mcq",
    summary: "completion", notes: "completion", table: "completion", flowchart: "completion",
    sentence: "completion", short: "completion", diagram: "completion", form: "completion",
  },
  listening: {
    form: "l-completion", notes: "l-completion", table: "l-completion", flowchart: "l-completion",
    sentence: "l-completion", short: "l-completion", summary: "l-completion",
    mcq: "l-mcq", mcq_multi: "l-mcq", map: "l-map", diagram: "l-map",
    matching_features: "l-matching", matching_info: "l-matching",
  },
};
export function lessonFor(skill, type) {
  return LESSON_BY_TYPE[skill]?.[type] ?? null;
}

export function countQuestions(drill) {
  return drill.questions.reduce((n, q) => n + (Array.isArray(q.n) ? q.n.length : 1), 0);
}

// "Choose TWO letters" questions cover two numbers and are keyed "5-6".
export function questionKey(q) {
  return Array.isArray(q.n) ? q.n.join("-") : String(q.n);
}

// Gap-fill answers: case, curly quotes, spacing and a trailing full stop don't matter.
export function normalizeAnswer(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "");
}
export function wordCount(s) {
  const t = normalizeAnswer(s);
  return t ? t.split(" ").length : 0;
}

// Under "… AND/OR A NUMBER" a number (25, £25, 9.30, 15th, 3pm) is not counted as a word.
const NUMBER_TOKEN = /^[£$€]?\d[\d.,:/]*(%|st|nd|rd|th|am|pm|p)?$/;
export function allowsNumber(drill) {
  return /and\/or a number/i.test(drill.instruction || "");
}
export function limitWords(drill, s) {
  const t = normalizeAnswer(s);
  if (!t) return 0;
  const tokens = t.split(" ");
  return allowsNumber(drill) ? tokens.filter((w) => !NUMBER_TOKEN.test(w)).length : tokens.length;
}

// Marks one drill. answers: { "1": "TRUE", "5-6": ["B", "D"], "7": "lantern" }.
// A gap-fill answer longer than the word limit is wrong even if it contains the
// right word, as in the real test (numbers don't count under "AND/OR A NUMBER"). Two-answer questions score one point per letter.
export function gradeDrill(drill, answers = {}) {
  const results = {};
  let correct = 0;
  let total = 0;
  for (const q of drill.questions) {
    const key = questionKey(q);
    const given = answers[key];
    let points = 0;
    let max = 1;
    let overLimit = false;
    if (Array.isArray(q.answer)) {
      max = q.answer.length;
      // Only as many letters as there are answers count, as on the answer sheet.
      const picked = new Set((Array.isArray(given) ? given : []).slice(0, max));
      points = q.answer.filter((a) => picked.has(a)).length;
    } else if ((q.input || drill.input) === "text") {
      overLimit = Boolean(drill.wordLimit) && limitWords(drill, given) > drill.wordLimit;
      const accepted = [q.answer, ...(q.accept || [])].map(normalizeAnswer);
      points = !overLimit && accepted.includes(normalizeAnswer(given)) ? 1 : 0;
    } else {
      points = given === q.answer ? 1 : 0;
    }
    results[key] = { points, max, ok: points === max, overLimit };
    correct += points;
    total += max;
  }
  return { results, correct, total };
}

// ---------- mistake journal ----------

// Why an answer was wrong. Each reason carries advice and the lessons that help, per skill.
export const REASONS = {
  paraphrase: {
    label: "Tidak mengenali parafrase",
    tip: "Soal hampir selalu memakai kata yang berbeda dari teks. Setiap kali kamu menemukan pasangan kata (teks ↔ soal), simpan sebagai kartu. Paket \"Pasangan parafrase\" di halaman Kartu adalah awal yang baik.",
    lessons: { reading: ["tfng", "matching-info"], listening: ["l-mcq", "l-matching"] },
  },
  not_found: {
    label: "Tidak menemukan lokasi jawaban",
    tip: "Latih scanning: cari nama, angka, dan istilah yang mudah terlihat dulu, lalu baca kalimat di sekitarnya. Ingat, sebagian besar tipe soal mengikuti urutan teks.",
    lessons: { reading: ["completion", "tfng"], listening: ["l-completion"] },
  },
  fng: {
    label: "Bingung FALSE / NOT GIVEN",
    tip: "Tanyakan: apakah teks benar-benar mengatakan kebalikannya? Kalau tidak ada kalimat yang membantah, jawabannya NOT GIVEN.",
    lessons: { reading: ["tfng", "ynng"] },
  },
  distractor: {
    label: "Terkecoh pengecoh",
    tip: "Pilihan pengecoh biasanya disebut lebih dulu lalu dikoreksi, atau benar tapi tidak menjawab pertanyaan. Tunggu sampai pembicara atau penulis selesai sebelum memutuskan.",
    lessons: { reading: ["mcq", "headings"], listening: ["l-mcq", "l-completion"] },
  },
  vocab: {
    label: "Kosakata tidak dikenal",
    tip: "Simpan kata yang tidak kamu kenal sebagai kartu, lengkap dengan kalimat aslinya, lalu ulangi setiap hari.",
    lessons: {},
  },
  spelling: {
    label: "Salah eja / bentuk kata",
    tip: "Satu huruf salah berarti salah. Perhatikan jamak/tunggal dan bentuk kata. Paket \"Kata yang sering salah eja\" di halaman Kartu membantu untuk Listening.",
    lessons: { reading: ["completion"], listening: ["l-completion"] },
  },
  word_limit: {
    label: "Melebihi batas kata",
    tip: "Lingkari batas kata di instruksi sebelum mulai. Jangan menulis ulang kata yang sudah ada di sekitar celah.",
    lessons: { reading: ["completion"], listening: ["l-completion"] },
  },
  lost_audio: {
    label: "Ketinggalan audio",
    tip: "Kalau satu jawaban terlewat, langsung pindah ke soal berikutnya. Gunakan jeda untuk membaca soal di depan, dan pegang kata kunci soal berikutnya sebagai \"alarm\".",
    lessons: { listening: ["l-completion", "l-map"] },
  },
  time: {
    label: "Kehabisan waktu",
    tip: "Targetkan 20 menit per passage Reading. Lewati soal yang macet lebih dari 2 menit dan kembali di akhir.",
    lessons: { reading: ["headings", "tfng"] },
  },
  careless: {
    label: "Kurang teliti",
    tip: "Sisakan 2 menit di akhir untuk memeriksa ejaan, jamak, dan apakah setiap soal sudah terisi.",
    lessons: {},
  },
  other: { label: "Lainnya", tip: "", lessons: {} },
};
const GAP_TYPES = new Set(["summary", "notes", "table", "flowchart", "sentence", "short", "diagram", "form", "other"]);

// The reasons that make sense for one question: F/NG only for T/F/NG and Y/N/NG,
// spelling and word limits only for gap-fill, lost audio only for Listening.
export function reasonsFor(skill, type) {
  return Object.keys(REASONS).filter((r) => {
    if (r === "fng") return skill === "reading" && (type === "tfng" || type === "ynng");
    if (r === "lost_audio") return skill === "listening";
    if (r === "time") return skill === "reading";
    if (r === "spelling" || r === "word_limit") return GAP_TYPES.has(type);
    return true;
  });
}

// ---------- flashcards: spaced repetition ----------

export const GRADES = [
  { id: 0, label: "Lupa" },
  { id: 1, label: "Sulit" },
  { id: 2, label: "Ingat" },
  { id: 3, label: "Mudah" },
];
export const NEW_PER_DAY = 15;

export function newSrs() {
  return { due: null, interval: 0, ease: 2.5, reps: 0, lapses: 0, introducedOn: null, lastReviewed: null };
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return todayISO(new Date(y, m - 1, d + n));
}

// SM-2 style schedule, in whole days. "Lupa" brings the card back today; the first
// intervals are short (1 → 3 days) because the exam is only weeks away.
export function schedule(srs, grade, today) {
  const s = { ...newSrs(), ...srs, introducedOn: srs?.introducedOn || today, lastReviewed: today };
  if (grade === 0) {
    if (s.reps > 0) s.lapses += 1;
    s.reps = 0;
    s.interval = 0;
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.due = today;
    return s;
  }
  if (s.reps === 0) s.interval = grade === 3 ? 3 : 1;
  else if (s.reps === 1) s.interval = grade === 1 ? 2 : grade === 2 ? 3 : 5;
  else {
    const factor = grade === 1 ? 1.2 : grade === 2 ? s.ease : s.ease * 1.3;
    s.interval = Math.max(s.interval + 1, Math.round(s.interval * factor));
  }
  s.ease = Math.min(3, Math.max(1.3, s.ease + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0)));
  s.reps += 1;
  s.due = addDays(today, s.interval);
  return s;
}

export function isNewCard(card) {
  return !card.srs?.lastReviewed;
}

// Cards to review today: everything due (oldest first), then new cards up to the daily limit.
export function reviewQueue(cards, today, newLimit = NEW_PER_DAY) {
  const due = cards.filter((c) => !isNewCard(c) && c.srs.due <= today).sort((a, b) => a.srs.due.localeCompare(b.srs.due));
  const introducedToday = cards.filter((c) => c.srs?.introducedOn === today).length;
  const fresh = cards.filter(isNewCard).slice(0, Math.max(0, newLimit - introducedToday));
  return [...due, ...fresh];
}

// ---------- writing ----------

export const WRITING_MIN_WORDS = { 1: 150, 2: 250 };
export const WRITING_MINUTES = { 1: 20, 2: 40 };
export const CRITERIA_NAMES = {
  1: { task: "Task Achievement", cc: "Coherence and Cohesion", lr: "Lexical Resource", gra: "Grammatical Range and Accuracy" },
  2: { task: "Task Response", cc: "Coherence and Cohesion", lr: "Lexical Resource", gra: "Grammatical Range and Accuracy" },
};

// Words as the test counts them: anything between spaces ("well-known" is one word).
export function essayWords(text) {
  return (String(text || "").match(/\S+/g) || []).length;
}

// Examiners give each criterion a whole band; the task band is their average, rounded
// down to the half band below (6.75 → 6.5). Treated as an estimate in the app.
export function taskBand(criteria) {
  const bands = criteria.map((c) => c.band);
  return Math.floor((bands.reduce((a, b) => a + b, 0) / bands.length) * 2) / 2;
}

// As on the real paper: a formal letter prints "Dear Sir or Madam,"; for anyone the writer
// knows, the line is left for the candidate to fill in, so choosing the greeting is part of the task.
export function letterOpening(p) {
  return p.kind === "formal" ? p.opening : "Dear ……………,";
}

// The full task as the candidate sees it, in plain text (also sent to the examiner).
export function promptText(p) {
  if (!p) return "";
  if (p.custom) return p.custom;
  if (p.module === "general") {
    return [
      p.situation,
      "",
      `Write a letter to ${p.recipient}. In your letter`,
      ...p.bullets.map((b) => `• ${b}`),
      "",
      "Write at least 150 words.",
      "You do NOT need to write any addresses.",
      "Begin your letter as follows:",
      letterOpening(p),
    ].join("\n");
  }
  if (p.module === "academic") return [p.prompt, "", "Write at least 150 words.", "", chartAsText(p.kind, p.chart)].join("\n");
  return [p.prompt, "", "Give reasons for your answer and include any relevant examples from your own knowledge or experience.", "", "Write at least 250 words."].join("\n");
}

export function chartAsText(kind, chart) {
  const head = `Chart data: ${chart.title}${chart.unit ? ` (unit: ${chart.unit})` : ""}, ${kind} chart`;
  const rows = chart.categories.map((cat, i) => `${cat}: ${chart.series.map((ser) => `${ser.name} ${ser.values[i]}`).join("; ")}`);
  return [head, ...rows].join("\n");
}

// ---------- daily study plan ----------

export const PLAN_PHASES = {
  foundation: { name: "Fondasi", note: "Kuasai strategi tiap tipe soal lewat materi dan latihan mini, dan bangun kosakata." },
  practice: { name: "Latihan terarah", note: "Kerjakan soal asli per bagian di engnovate, lalu perbaiki tipe soal yang paling lemah." },
  mock: { name: "Simulasi", note: "Tes lengkap dengan waktu ujian di akhir pekan; hari lain untuk menambal kelemahan kecil." },
  exam: { name: "Hari ujian", note: "Cukup pemanasan ringan. Semoga sukses!" },
  done: { name: "Ujian selesai", note: "Catat skor resmimu kalau sudah keluar." },
};

// Focus per weekday (0 = Sunday). Friday goes to whichever skill is furthest from target.
const WEEK_FOCUS = ["writing2", "listening", "reading", "writing1", "speaking", "weakest", "listening"];
export const FOCUS_LABEL = { listening: "Listening", reading: "Reading", writing1: "Writing 1", writing2: "Writing 2", speaking: "Speaking", mock: "Simulasi" };
const ENGNOVATE = { listening: "https://engnovate.com/ielts-listening-tests/", reading: "https://engnovate.com/ielts-reading-tests/" };
const LESSON_ORDER = {
  reading: ["tfng", "completion", "headings", "matching-info", "ynng", "mcq", "matching-features", "endings"],
  listening: ["l-completion", "l-mcq", "l-map", "l-matching"],
};

function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function planPhase(daysLeft) {
  if (daysLeft == null || daysLeft > 35) return "foundation";
  if (daysLeft > 14) return "practice";
  if (daysLeft > 0) return "mock";
  return daysLeft === 0 ? "exam" : "done";
}

// The skill furthest below target (a skill with no score yet comes first).
export function weakestSkill(latest, target) {
  const order = ["listening", "reading", "writing", "speaking"];
  return order
    .map((s) => ({ s, gap: latest[s] == null ? 99 : (target ?? 7) - latest[s] }))
    .sort((a, b) => b.gap - a.gap)[0].s;
}

/**
 * Today's tasks. input: { today, settings, attempts, drillAttempts, latest: {skill: band|null},
 * cardsDue, cardsTotal, journalOpen, lessons: [{ id, skill, title }] }.
 * Returns { phase, daysLeft, focus, tasks: [{ id, title, detail, minutes, href, external }] }.
 */
export function buildPlan(input) {
  const { today, settings = {}, attempts = [], drillAttempts = [], latest = {}, cardsDue = 0, cardsTotal = 0, journalOpen = 0, lessons = [] } = input;
  const daysLeft = daysUntil(settings.examDate, (() => { const [y, m, d] = today.split("-").map(Number); return new Date(y, m - 1, d); })());
  const phase = planPhase(daysLeft);
  const budget = settings.minutesPerDay || 45;
  const tasks = [];
  const used = () => tasks.reduce((n, t) => n + t.minutes, 0);
  const add = (t) => tasks.push(t);
  const title = (id) => lessons.find((l) => l.id === id)?.title || id;

  if (phase === "done") return { phase, daysLeft, focus: null, tasks };
  if (phase === "exam") {
    if (cardsDue) add({ id: "cards", title: `Ulangi ${cardsDue} kartu`, detail: "Pemanasan ringan, tanpa materi baru.", minutes: 10, href: "/cards" });
    return { phase, daysLeft, focus: null, tasks };
  }

  const scored = attempts.map((a) => ({ ...a, score: scoreAttempt(a) }));
  const has = (skill) => scored.some((a) => a.skill === skill);
  let focus = WEEK_FOCUS[weekday(today)];
  if (focus === "weakest") {
    const w = weakestSkill(latest, settings.targetBand);
    focus = w === "writing" ? "writing2" : w;
  }
  if (phase === "mock" && weekday(today) === 6) focus = "mock";

  // Weakest lesson of a skill: most points lost in logged tests, else the next lesson whose
  // drill hasn't been done well yet.
  const weakLesson = (skill) => {
    const lost = new Map();
    for (const s of typeStats(scored, skill)) {
      const id = lessonFor(skill, s.type);
      if (id && s.total >= 3 && s.correct / s.total < 0.8) lost.set(id, (lost.get(id) || 0) + s.lost);
    }
    const ranked = [...lost.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    if (ranked.length) return ranked[0];
    const best = (id) => Math.max(0, ...drillAttempts.filter((d) => d.lesson === id).map((d) => d.correct / d.total));
    return LESSON_ORDER[skill].find((id) => best(id) < 0.8) || null;
  };

  // A diagnostic comes before anything else while there is no score to plan from.
  if (!has("listening") || !has("reading")) {
    const skill = !has("listening") ? "listening" : "reading";
    add({ id: `diagnostic:${skill}`, title: `Tes diagnostik ${skill === "listening" ? "Listening" : "Reading"} di engnovate`, detail: "Kerjakan satu tes lengkap dengan waktu penuh, lalu catat hasilnya. Link tesnya ada di dashboard.", minutes: skill === "listening" ? 40 : 60, href: "/#diagnostic" });
  }

  if (cardsDue) add({ id: "cards", title: `Ulangi ${cardsDue} kartu`, detail: "Kosakata dan parafrase yang jatuh tempo hari ini.", minutes: Math.min(10, Math.max(5, Math.ceil(cardsDue / 3))), href: "/cards" });
  else if (!cardsTotal) add({ id: "cards:start", title: "Tambahkan paket kartu parafrase", detail: "Sekali saja; setelah itu kartu baru muncul 15 per hari.", minutes: 5, href: "/cards" });
  if (journalOpen) add({ id: "journal", title: `Beri alasan untuk ${Math.min(journalOpen, 10)} jawaban salah`, detail: "Supaya pola kesalahanmu terlihat.", minutes: 5, href: "/journal" });

  // On a diagnostic day the day's focus only joins if it still fits.
  const diagnostic = tasks.some((t) => t.id.startsWith("diagnostic:"));
  const addFocus = (t) => {
    if (!diagnostic || used() + t.minutes <= budget + 5) add(t);
  };

  const objective = (skill) => {
    if (phase === "foundation") {
      const id = weakLesson(skill);
      if (id) return { id: `lesson:${id}`, title: `Pelajari ${title(id)}`, detail: "Baca strateginya, lalu kerjakan latihan mini sampai paham pembahasannya.", minutes: 20, href: `/learn/${id}` };
    }
    return {
      id: `engnovate:${skill}`,
      title: `Kerjakan 1 bagian ${skill === "listening" ? "Listening" : "Reading"} di engnovate`,
      detail: skill === "listening" ? "Satu Part (10 soal) yang belum pernah kamu kerjakan, lalu catat dan isi jurnal." : "Satu passage dalam 20 menit, lalu catat dan isi jurnal.",
      minutes: skill === "listening" ? 15 : 25,
      href: ENGNOVATE[skill],
      external: true,
    };
  };

  if (focus === "listening" || focus === "reading") {
    addFocus(objective(focus));
    if (phase !== "foundation") {
      const id = weakLesson(focus);
      if (id) addFocus({ id: `lesson:${id}`, title: `Ulangi materi ${title(id)}`, detail: "Tipe soal yang paling banyak membuang poin.", minutes: 15, href: `/learn/${id}` });
    }
  } else if (focus === "writing1") {
    addFocus({ id: "writing:1", title: settings.module === "academic" ? "Writing Task 1: deskripsi grafik" : "Writing Task 1: surat", detail: "20 menit menulis dengan timer, lalu baca feedback-nya.", minutes: 25, href: "/writing?view=1" });
  } else if (focus === "writing2") {
    addFocus(budget >= 45
      ? { id: "writing:2", title: "Writing Task 2: esai", detail: "40 menit menulis dengan timer, lalu baca feedback-nya.", minutes: 45, href: "/writing?view=2" }
      : { id: "writing:2", title: "Writing Task 2: rencana, intro, dan satu paragraf", detail: "Latihan esai yang dipotong supaya muat di waktumu hari ini.", minutes: 20, href: "/writing?view=2" });
  } else if (focus === "speaking") {
    addFocus({ id: "speaking", title: phase === "mock" ? "Speaking: tes lengkap" : "Speaking: Part 2 & 3", detail: "Rekam jawabanmu, lalu dengarkan lagi sambil membaca feedback.", minutes: 15, href: "/speaking" });
  } else if (focus === "mock") {
    addFocus({ id: "mock", title: "Simulasi: Listening dan Reading lengkap di engnovate", detail: "Waktu ujian penuh (±100 menit), lalu catat keduanya. Kalau waktumu kurang, kerjakan Listening saja.", minutes: 100, href: ENGNOVATE.listening, external: true });
  }

  // Fill what is left of the day's minutes with the other objective skill, then speaking.
  const extras = [];
  if (focus !== "reading") extras.push(objective("reading"));
  if (focus !== "listening") extras.push(objective("listening"));
  if (focus !== "speaking") extras.push({ id: "speaking:part1", title: "Speaking Part 1: satu topik", detail: "4–5 pertanyaan singkat, ±5 menit.", minutes: 10, href: "/speaking" });
  for (const t of extras) {
    if (used() + t.minutes > budget + 5) continue;
    if (tasks.some((x) => x.id === t.id)) continue;
    add(t);
  }
  return { phase, daysLeft, focus, tasks };
}

// Consecutive days, ending today (or yesterday if today has nothing yet), with a task done.
export function planStreak(plan, today) {
  const doneOn = (d) => (plan?.[d]?.done || []).length > 0;
  let day = doneOn(today) ? today : addDays(today, -1);
  let n = 0;
  while (doneOn(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function weekPlan(today, latest, target) {
  const back = (weekday(today) + 6) % 7; // Monday first
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - back);
    let focus = WEEK_FOCUS[weekday(date)];
    if (focus === "weakest") {
      const w = weakestSkill(latest, target);
      focus = w === "writing" ? "writing2" : w;
    }
    return { date, focus, label: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][weekday(date)] };
  });
}

// "Istri" → "istri", "Dewi Ayu" → "dewi-ayu": the personal link /p/<slug> of a profile.
export function slugify(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profil";
}
