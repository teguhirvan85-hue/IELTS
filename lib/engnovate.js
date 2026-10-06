// Reads the structure of an engnovate.com test page: title, skill, module, and the
// question groups ("Questions 1-6" + instruction → question type) with each question's text.
// The answer key is not on the page (engnovate grades on its server), so the user marks
// which numbers were wrong.
import { classifyInstruction } from "../public/shared.js";

const HOSTS = new Set(["engnovate.com", "www.engnovate.com"]);
const MAX_BYTES = 4 * 1024 * 1024;

// Errors carry the HTTP status the API should answer with.
function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    fail("Link tidak valid.", 400);
  }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.has(u.hostname)) fail("Hanya link dari engnovate.com.", 400);
  u.protocol = "https:";
  u.hostname = "engnovate.com";
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
  return u.toString();
}

export function skillFromUrl(url) {
  const m = String(url).match(/\/ielts-(listening|reading|writing|speaking)-tests\//);
  return m ? m[1] : null;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function toText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/Listen From Here|Practice this section only|Drop answer here/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(s, n) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

// Question text per number. Statement-style questions (T/F/NG, MCQ, matching) carry
// their text in a <span> right after the number; gap-fill questions get the words
// around the gap instead ("… are especially keen on ___ …").
function extractPrompts(chunk, prefix) {
  const marked = chunk.replace(
    new RegExp(`<strong[^>]*${prefix}-question-number[^>]*>\\s*(\\d+)\\s*</strong>`, "g"),
    (_, n) => ` ⟦${n}⟧ `
  );
  const prompts = {};
  for (const m of marked.matchAll(/⟦(\d+)⟧\s*<span>([\s\S]*?)<\/span>/g)) {
    const text = toText(m[2]);
    if (text) prompts[m[1]] = clip(text, 220);
  }
  const text = toText(marked);
  const markers = [...text.matchAll(/⟦(\d+)⟧/g)];
  const after = markers.map((m, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
    return text.slice(m.index + m[0].length, end).trim();
  });
  markers.forEach((m, i) => {
    const n = m[1];
    if (prompts[n]) return;
    // "Choose TWO letters": numbers 23 and 24 sit side by side and share the question after them.
    if (!after[i] || (i > 0 && !after[i - 1])) {
      const j = after.findIndex((s, k) => k >= i && s);
      if (j > -1) {
        const q = after[j];
        const end = q.indexOf("?");
        const stem = end > -1 ? q.slice(0, end + 1) : q.split(/\sA\s/)[0];
        prompts[n] = clip(stem, 220);
        return;
      }
    }
    const start = i > 0 ? markers[i - 1].index + markers[i - 1][0].length : 0;
    let before = text.slice(start, m.index).trim();
    let next = after[i];
    before = before.length > 90 ? "…" + before.slice(-90).replace(/^\S*\s/, "") : before;
    next = next.length > 70 ? next.slice(0, 70).replace(/\s\S*$/, "") + "…" : next;
    const ctx = `${before} ___ ${next}`.trim();
    if (ctx !== "___") prompts[n] = clip(ctx, 220);
  });
  return prompts;
}

export function parseTest(html, url) {
  const skill = skillFromUrl(url);
  if (!skill) fail("Ini bukan halaman tes engnovate (Listening, Reading, Writing atau Speaking).", 400);
  const rawTitle = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const title = decodeEntities(rawTitle)
    .replace(/\s*\((Free )?Online Test[^)]*\)\s*$/i, "")
    .replace(/\s*[-|–]\s*Engnovate\s*$/i, "")
    .trim();
  const module = /general training/i.test(title) ? "general" : /academic/i.test(title) ? "academic" : null;

  const groups = [];
  if (skill === "listening" || skill === "reading") {
    const prefix = `ielts-${skill}`;
    const parts = [...html.matchAll(new RegExp(`<div id="${prefix}-question-section-\\d+"[^>]*data-part-number="(\\d+)"`, "g"))]
      .map((m) => ({ index: m.index, part: Number(m[1]) }));
    const heads = [...html.matchAll(new RegExp(`<h2 class="${prefix}-question-section-heading">([\\s\\S]*?)</h2>`, "g"))];
    const endIndex = (() => {
      const i = html.indexOf(`${prefix}-bottom-panel`);
      return i === -1 ? html.length : i;
    })();
    heads.forEach((h, i) => {
      const heading = toText(h[1]);
      const range = heading.match(/Questions?\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
      if (!range) return;
      const from = Number(range[1]);
      const to = Number(range[2] || range[1]);
      const start = h.index + h[0].length;
      const end = Math.min(i + 1 < heads.length ? heads[i + 1].index : endIndex, endIndex);
      const chunk = html.slice(start, end);
      const firstQ = chunk.search(new RegExp(`${prefix}-question-number`));
      const instruction = clip(toText(firstQ > -1 ? chunk.slice(0, chunk.lastIndexOf("<", firstQ)) : chunk), 400);
      const part = parts.filter((p) => p.index < h.index).pop()?.part ?? null;
      groups.push({ from, to, part, type: classifyInstruction(instruction), instruction, prompts: extractPrompts(chunk, prefix) });
    });
  }
  return { url, title: title || "Tes engnovate", skill, module, groups };
}

export async function fetchTest(rawUrl) {
  const url = normalizeUrl(rawUrl);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    fail("Tidak bisa menghubungi engnovate. Cek koneksi, atau isi manual.", 502);
  }
  if (!HOSTS.has(new URL(res.url).hostname)) fail("Link mengarah ke luar engnovate.", 502);
  if (!res.ok) fail(`engnovate membalas ${res.status}. Cek link-nya, atau isi manual.`, 502);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) fail("Halaman terlalu besar.", 502);
  return parseTest(new TextDecoder().decode(buf), url);
}
