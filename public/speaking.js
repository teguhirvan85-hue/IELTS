import { formatBand } from "/shared.js";
import { $, h, api, fmtDate, armedButton } from "/ui.js";

// Browser speech recognition (Chrome and Safari) and voices for reading questions aloud.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const canSpeak = "speechSynthesis" in window;
const AUDIO_MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";

let bank = null; // { part1, part2, targetBand }
let pollTimer = null;
let session = null; // the practice in progress
const prefs = { voice: canSpeak };

async function load() {
  bank = await api("/api/speaking");
  const q = new URLSearchParams(location.search);
  if (q.get("session")) showResult(q.get("session"));
  else show(q.get("view") || "home");
}

function setTabs(v) {
  for (const b of $("#s-tabs").querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.view === v));
}
$("#s-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (!b || session?.running) return;
  history.pushState(null, "", `/speaking?view=${b.dataset.view}`);
  show(b.dataset.view);
});
window.addEventListener("popstate", () => {
  if (session?.running) return;
  const q = new URLSearchParams(location.search);
  if (q.get("session")) showResult(q.get("session"));
  else show(q.get("view") || "home");
});

function show(v) {
  clearTimeout(pollTimer);
  setTabs(v);
  if (v === "history") return showHistory();
  showHome();
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
// Part 1 topics an examiner starts with.
const OPENERS = new Set(["p1-01", "p1-02", "p1-03"]);
function cueText(card) {
  return [card.cue, "You should say:", ...card.bullets.map((b) => `• ${b}`), card.last].join("\n");
}

// ---------- choosing a practice ----------
function showHome() {
  const topic = h("select", { class: "tf" }, bank.part1.map((t) => h("option", { value: t.id, text: t.topic })));
  const card = h("select", { class: "tf" }, bank.part2.map((c) => h("option", { value: c.id, text: c.cue.replace(/^Describe /, "") })));
  const typed = h("input", { type: "checkbox" });
  const voice = h("input", { type: "checkbox", checked: prefs.voice, disabled: !canSpeak });
  voice.addEventListener("change", () => { prefs.voice = voice.checked; });

  const start = (mode) => {
    let items = [];
    let title = "";
    if (mode === "part1") {
      const t = bank.part1.find((x) => x.id === topic.value);
      items = t.questions.map((q) => ({ part: 1, question: q }));
      title = `Part 1: ${t.topic}`;
    } else {
      const c = mode === "full" ? pick(bank.part2) : bank.part2.find((x) => x.id === card.value);
      if (mode === "full") {
        // As in the exam: Part 1 opens with work/studies or home/hometown, then two more topics.
        const opener = pick(bank.part1.filter((t) => OPENERS.has(t.id)));
        const others = shuffle(bank.part1.filter((t) => !OPENERS.has(t.id))).slice(0, 2);
        items = [...opener.questions.slice(0, 4), ...others.flatMap((t) => t.questions.slice(0, 3))].map((q) => ({ part: 1, question: q }));
      }
      items.push({ part: 2, question: cueText(c), card: c });
      items.push(...c.part3.map((q) => ({ part: 3, question: q })));
      title = mode === "full" ? `Tes lengkap: ${c.cue.replace(/^Describe /, "")}` : `Part 2 & 3: ${c.cue.replace(/^Describe /, "")}`;
    }
    runSession({ mode, title, items, typed: typed.checked || (!Recognition && !navigator.mediaDevices) });
  };

  const tile = (title, meta, desc, control, mode) => h("div", { class: "mode-tile" },
    h("h3", { text: title }), h("p", { class: "hint", text: meta }), h("p", { class: "mode-desc", text: desc }),
    control, h("button", { class: "btn primary", type: "button", text: "Mulai", onclick: () => start(mode) }));

  const notes = [];
  if (!Recognition) notes.push("Browser ini tidak bisa mentranskrip suara. Pakai Safari atau Chrome, atau centang \"Ketik jawaban\" untuk berlatih dengan mengetik.");
  else notes.push("Transkrip dibuat oleh browser: di Chrome lewat layanan Google, di Safari lewat Apple. Rekamanmu sendiri hanya disimpan di Mac ini.");

  $("#s-main").replaceChildren(
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("div", {}, h("h2", { text: "Pilih latihan" }), h("p", { class: "card-note", text: "Speaking IELTS berlangsung 11–14 menit dalam tiga bagian. Latih per bagian, atau coba simulasi lengkap." }))),
      h("div", { class: "mode-grid" },
        tile("Part 1 · Wawancara", "1 topik · 5 pertanyaan · ±3 menit", "Pertanyaan singkat tentang dirimu. Jawab 2–4 kalimat: jawaban langsung, alasan, lalu contoh.", h("label", { class: "fl" }, "Topik", topic), "part1"),
        tile("Part 2 & 3 · Cue card", "1 menit persiapan · 2 menit bicara · diskusi", "Bicara sendiri selama 1–2 menit tentang satu topik, lalu diskusi yang lebih abstrak.", h("label", { class: "fl" }, "Kartu", card), "part2"),
        tile("Tes lengkap", "Part 1, 2, 3 · ±13 menit", "Simulasi seperti hari ujian: tiga topik Part 1, satu cue card, lalu diskusi Part 3. Cocok untuk minggu-minggu terakhir.", null, "full")),
      h("div", { class: "s-options" },
        h("label", { class: "check" }, voice, h("span", { text: "Pertanyaan dibacakan suara examiner" })),
        h("label", { class: "check" }, typed, h("span", { text: "Ketik jawaban (tanpa mikrofon)" })),
        ...notes.map((n) => h("p", { class: "hint", text: n })))));
}

// ---------- the practice itself ----------
function englishVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.name === "Daniel") || voices.find((v) => v.lang === "en-GB") || voices.find((v) => v.lang?.startsWith("en"));
}
function readAloud(text) {
  if (!prefs.voice || !canSpeak) return Promise.resolve();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/•/g, ""));
    const v = englishVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "en-GB";
    u.rate = 0.95;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
    setTimeout(resolve, 20000);
  });
}

// Recognition restarts itself when the browser stops it after a pause.
function startRecognition(onText) {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.lang = "en-GB";
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  let active = true;
  let ended = null;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript.trim() + " ";
      else interim += r[0].transcript;
    }
    onText(finalText, interim);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") active = false;
  };
  rec.onend = () => {
    if (active) {
      try { rec.start(); } catch { /* already restarting */ }
    } else ended?.();
  };
  try { rec.start(); } catch { return null; }
  return {
    stop() {
      active = false;
      return new Promise((resolve) => {
        ended = () => resolve(finalText.trim());
        try { rec.stop(); } catch { resolve(finalText.trim()); }
        setTimeout(() => resolve(finalText.trim()), 1500);
      });
    },
  };
}

async function runSession({ mode, title, items, typed }) {
  session = { mode, title, items, typed, answers: [], index: 0, running: true, stream: null };
  if (!typed) {
    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      $("#s-main").replaceChildren(h("section", { class: "card" }, h("div", { class: "card-head" }, h("div", {},
        h("h2", { text: "Mikrofon tidak bisa dipakai" }),
        h("p", { class: "card-note", text: "Izinkan akses mikrofon untuk localhost di pengaturan browser, lalu coba lagi. Atau berlatih dengan mengetik jawaban." }))),
        h("div", { class: "s-actions" },
          h("button", { class: "btn", type: "button", text: "Kembali", onclick: () => { session = null; showHome(); } }),
          h("button", { class: "btn primary", type: "button", text: "Ketik jawaban saja", onclick: () => runSession({ mode, title, items, typed: true }) }))));
      return;
    }
  }
  nextQuestion();
}

function stopStream() {
  session?.stream?.getTracks().forEach((t) => t.stop());
  if (canSpeak) speechSynthesis.cancel();
}

function fmtClock(s) {
  const a = Math.max(0, Math.round(s));
  return `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

function nextQuestion() {
  const item = session.items[session.index];
  if (!item) return review();
  const isCue = item.part === 2;
  const stage = h("div", { class: "q-stage" });
  const progress = h("p", { class: "hint", text: `Pertanyaan ${session.index + 1} dari ${session.items.length} · Part ${item.part}` });
  const prompt = isCue
    ? h("div", { class: "cue-card" }, h("p", { class: "cue-title", text: item.card.cue }), h("p", { class: "hint", text: "You should say:" }),
        h("ul", {}, item.card.bullets.map((b) => h("li", { text: b }))), h("p", { text: item.card.last }))
    : h("p", { class: "q-text", text: item.question });
  stage.append(progress, prompt);
  const controls = h("div", { class: "s-actions" });
  const live = h("div", { class: "live", hidden: true });
  stage.append(live, controls);
  const end = h("button", { class: "link-btn danger", type: "button", text: "Akhiri latihan", onclick: () => { stopStream(); session = null; showHome(); } });
  $("#s-main").replaceChildren(h("section", { class: "card session" },
    h("div", { class: "card-head" }, h("div", {}, h("p", { class: "eyebrow", text: session.title }), h("h2", { text: isCue ? "Part 2 · Cue card" : `Part ${item.part}` })), end),
    stage));

  if (isCue) {
    // One minute to prepare, with somewhere to make notes, then up to two minutes.
    const notes = h("textarea", { class: "tf", rows: "4", placeholder: "Catatan persiapan (opsional, tidak dinilai)" });
    const clock = h("span", { class: "big-clock", text: "1:00" });
    const begin = h("button", { class: "btn primary", type: "button", text: "Mulai bicara sekarang" });
    controls.replaceChildren(h("div", { class: "prep" }, h("p", { class: "hint", text: "Waktu persiapan" }), clock), notes, begin);
    readAloud(`${item.card.cue} You have one minute to prepare.`);
    let left = 60;
    const t = setInterval(() => {
      left -= 1;
      clock.textContent = fmtClock(left);
      if (left <= 0) go();
    }, 1000);
    const go = () => {
      clearInterval(t);
      record(item, controls, live, 120);
    };
    begin.addEventListener("click", go);
  } else {
    const begin = h("button", { class: "btn primary", type: "button", text: session.typed ? "Tulis jawaban" : "Mulai jawab" });
    controls.replaceChildren(begin);
    begin.addEventListener("click", () => record(item, controls, live, null));
    readAloud(item.question).then(() => {
      if (!session?.typed && begin.isConnected && prefs.voice) begin.click(); // answer straight after the question, as in the exam
    });
  }
}

// Records one answer (or takes a typed one), with a timer; Part 2 stops at two minutes.
function record(item, controls, live, limit) {
  const started = Date.now();
  const clock = h("span", { class: "big-clock", text: "0:00" });
  const text = h("p", { class: "live-text" });
  const interimEl = h("span", { class: "interim" });
  const stopBtn = h("button", { class: "btn primary", type: "button", text: "Selesai menjawab" });
  live.hidden = false;

  if (session.typed) {
    const area = h("textarea", { class: "tf", rows: "6", placeholder: "Tulis apa yang akan kamu ucapkan…" });
    live.replaceChildren(area);
    controls.replaceChildren(stopBtn);
    area.focus();
    stopBtn.addEventListener("click", () => {
      finish(item, area.value.trim(), (Date.now() - started) / 1000, null);
    });
    return;
  }

  let chunks = [];
  const recorder = new MediaRecorder(session.stream, AUDIO_MIME ? { mimeType: AUDIO_MIME } : undefined);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  const recog = startRecognition((finalText, interim) => {
    text.replaceChildren(finalText, interimEl);
    interimEl.textContent = interim;
  });
  live.replaceChildren(h("div", { class: "rec" }, h("span", { class: "rec-dot", "aria-hidden": "true" }), h("span", { text: "Merekam" }), clock),
    recog ? text : h("p", { class: "hint", text: "Transkripsi otomatis tidak tersedia; ketik jawabanmu setelah selesai." }));
  controls.replaceChildren(stopBtn);
  const tick = setInterval(() => {
    const s = (Date.now() - started) / 1000;
    clock.textContent = limit ? `${fmtClock(s)} / ${fmtClock(limit)}` : fmtClock(s);
    if (limit && s >= limit) stop();
  }, 250);
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    clearInterval(tick);
    stopBtn.disabled = true;
    const seconds = (Date.now() - started) / 1000;
    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.stop();
    const transcript = recog ? await recog.stop() : "";
    await done;
    const blob = chunks.length ? new Blob(chunks, { type: recorder.mimeType || AUDIO_MIME }) : null;
    finish(item, transcript, seconds, blob);
  }
  stopBtn.addEventListener("click", stop);
}

// After each answer: the transcript can be corrected (only words the machine misheard).
function finish(item, transcript, seconds, blob) {
  const answer = { part: item.part, question: item.question, transcript, seconds, blob };
  session.answers[session.index] = answer;
  const area = h("textarea", { class: "tf transcript-edit", rows: "5" });
  area.value = transcript;
  area.addEventListener("input", () => { answer.transcript = area.value; });
  const audio = blob ? h("audio", { controls: true, src: URL.createObjectURL(blob) }) : null;
  const again = h("button", { class: "btn", type: "button", text: "Ulangi jawaban", onclick: () => nextQuestion() });
  const next = h("button", { class: "btn primary", type: "button", text: session.index + 1 < session.items.length ? "Pertanyaan berikutnya" : "Selesai, lihat ringkasan" });
  next.addEventListener("click", () => {
    session.index += 1;
    nextQuestion();
  });
  const stage = document.querySelector(".q-stage");
  stage.querySelector(".live").replaceChildren(
    h("p", { class: "hint", text: `${fmtClock(seconds)} · ${(transcript.match(/\S+/g) || []).length} kata. ${session.typed ? "" : "Perbaiki hanya kata yang salah dengar oleh mesin, bukan isi jawabanmu."}` }),
    audio, area);
  stage.querySelector(".s-actions").replaceChildren(again, next);
}

function review() {
  const send = h("button", { class: "btn primary", type: "button", text: "Kirim untuk dinilai" });
  const msg = h("p", { class: "msg", role: "alert" });
  send.addEventListener("click", async () => {
    send.disabled = true;
    msg.textContent = "";
    try {
      const created = await api("/api/speaking/sessions", {
        method: "POST",
        body: { mode: session.mode, title: session.title, typed: Boolean(session.typed), answers: session.answers.map(({ part, question, transcript, seconds }) => ({ part, question, transcript, seconds })) },
      });
      // Recordings go up one by one; marking only needs the transcripts.
      for (const [i, a] of session.answers.entries()) {
        if (!a.blob) continue;
        await fetch(`/api/speaking/sessions/${created.id}/audio/${i}`, { method: "POST", headers: { "content-type": a.blob.type.split(";")[0] }, body: a.blob });
      }
      stopStream();
      session = null;
      history.pushState(null, "", `/speaking?session=${created.id}`);
      showResult(created.id);
    } catch (err) {
      send.disabled = false;
      msg.textContent = err.message;
    }
  });
  $("#s-main").replaceChildren(h("section", { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("p", { class: "eyebrow", text: session.title }), h("h2", { text: "Ringkasan jawaban" }), h("p", { class: "card-note", text: "Cek sekali lagi, lalu kirim. Penilaian memakai kuota Claude-mu dan biasanya selesai dalam 1–2 menit." }))),
    h("ol", { class: "answer-list" }, session.answers.map((a) => h("li", {},
      h("p", { class: "a-q", text: a.part === 2 ? a.question.split("\n")[0] : a.question }),
      h("p", { class: "hint", text: `Part ${a.part} · ${fmtClock(a.seconds)} · ${(a.transcript.match(/\S+/g) || []).length} kata` }),
      h("p", { class: "a-t", text: a.transcript || "(tidak ada jawaban)" })))),
    h("div", { class: "s-actions pad" }, msg, send)));
}

// ---------- a marked session ----------
async function showResult(id) {
  clearTimeout(pollTimer);
  setTabs("history");
  let s;
  try {
    s = await api(`/api/speaking/sessions/${id}`);
  } catch (err) {
    $("#s-main").replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: err.message })));
    return;
  }
  const head = h("div", { class: "card-head" }, h("div", {},
    h("p", { class: "eyebrow", text: fmtDate(s.createdAt.slice(0, 10)) }),
    h("h2", { text: s.title }),
    h("p", { class: "card-note", text: `${s.answers.length} jawaban` })), h("a", { class: "link-btn", href: "/speaking?view=history", text: "← Riwayat" }));
  let body;
  if (s.status === "pending") {
    body = h("div", { class: "pending" }, h("span", { class: "dot-pulse", "aria-hidden": "true" }), h("p", { text: "Claude sedang menilai jawabanmu. Biasanya 1–2 menit; halaman ini diperbarui sendiri." }));
    pollTimer = setTimeout(() => showResult(id), 4000);
  } else if (s.status === "error") {
    const retry = h("button", { class: "btn primary", type: "button", text: "Kirim ulang" });
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      await api(`/api/speaking/sessions/${id}/retry`, { method: "POST", body: {} });
      showResult(id);
    });
    body = h("div", { class: "pending" }, h("p", { class: "msg", text: s.error }), s.hint ? h("p", { class: "hint", text: s.hint }) : null, retry);
  } else body = feedbackView(s);

  const del = h("button", { class: "link-btn danger", type: "button", text: "Hapus sesi ini" });
  armedButton(del, async () => {
    await api(`/api/speaking/sessions/${id}`, { method: "DELETE" });
    history.pushState(null, "", "/speaking?view=history");
    show("history");
  });
  $("#s-main").replaceChildren(h("article", { class: "card essay-card" }, head, body,
    h("details", { class: "fb-block", open: s.status !== "done" }, h("summary", { text: "Jawabanmu dan rekamannya" }), h("div", { class: "fb-pad" }, answersView(s))),
    h("div", { class: "fb-foot" }, del)));
}

function answersView(s) {
  return h("ol", { class: "answer-list" }, s.answers.map((a, i) => {
    const words = (a.transcript.match(/\S+/g) || []).length;
    const wpm = !s.typed && a.seconds >= 5 ? Math.round((words / a.seconds) * 60) : null;
    return h("li", {},
      h("p", { class: "a-q", text: a.part === 2 ? a.question.split("\n")[0] : a.question }),
      h("p", { class: "hint", text: s.typed ? `Part ${a.part} · diketik · ${words} kata` : `Part ${a.part} · ${fmtClock(a.seconds)} · ${words} kata${wpm ? ` · ${wpm} kata/menit` : ""}` }),
      a.audio ? h("audio", { controls: true, preload: "none", src: `/api/speaking/sessions/${s.id}/audio/${i}` }) : null,
      h("p", { class: "a-t", text: a.transcript || "(tidak ada jawaban)" }));
  }));
}

function feedbackView(s) {
  const f = s.feedback;
  const target = bank.targetBand;
  const gap = target != null ? target - f.band : null;
  const verdict = gap == null ? "" : gap <= 0 ? "✓ Sudah di target" : `Kurang ${formatBand(gap)} dari target ${formatBand(target)}`;
  const addCard = async (v, btn) => {
    btn.disabled = true;
    try {
      await api("/api/cards", { method: "POST", body: { front: v.phrase, back: v.meaning, source: { kind: "manual", ref: "" } } });
      btn.textContent = "✓ Ditambahkan";
    } catch (err) {
      btn.textContent = err.message;
    }
  };
  return h("div", { class: "fb" },
    h("div", { class: "fb-hero" },
      h("div", {}, h("p", { class: "fb-band", text: formatBand(f.band) }), h("p", { class: "hint", text: "Band Speaking (estimasi, tanpa Pronunciation)" })),
      h("div", { class: "fb-hero-text" }, verdict ? h("p", { class: "fb-verdict", text: verdict }) : null, h("p", { text: f.summary }))),
    h("div", { class: "fb-criteria three" }, f.criteria.map((c) => h("div", { class: "crit" },
      h("div", { class: "crit-head" }, h("span", { class: "crit-name", text: c.name }), h("span", { class: "crit-band", text: String(c.band) })),
      h("div", { class: "bar", role: "img", "aria-label": `${c.band} dari 9` }, h("span", { style: `width:${(c.band / 9) * 100}%` })),
      h("p", { text: c.comment })))),
    h("div", { class: "fb-list pron" }, h("h3", { text: "Pronunciation: cek sendiri" }),
      h("p", { class: "hint", text: "Pronunciation tidak bisa dinilai dari teks. Dengarkan rekamanmu di bawah sambil memperhatikan hal-hal ini:" }),
      h("ul", {}, f.pronunciation.map((t) => h("li", { text: t })))),
    h("div", { class: "fb-two" },
      h("div", { class: "fb-list" }, h("h3", { text: "Sudah bagus" }), h("ul", { class: "ticks" }, f.strengths.map((t) => h("li", { text: t })))),
      h("div", { class: "fb-list" }, h("h3", { text: "Langkah berikutnya" }), h("ol", {}, f.nextSteps.map((t) => h("li", { text: t }))))),
    h("div", { class: "fb-improve" }, h("h3", { text: "Yang perlu diperbaiki" }),
      h("ol", { class: "improve-list" }, f.improvements.map((imp) => h("li", {},
        h("span", { class: "tag", text: { fc: "Fluency & Coherence", lr: "Lexical Resource", gra: "Grammar" }[imp.criterion] }),
        h("p", { class: "imp-quote" }, h("span", { class: "imp-icon", text: "✗" }), imp.quote),
        h("p", { class: "imp-fix" }, h("span", { class: "imp-icon", text: "✓" }), imp.fix),
        h("p", { class: "imp-why", text: imp.why }))))),
    h("div", { class: "fb-improve" }, h("h3", { text: "Kosakata untuk topik ini" }),
      h("ul", { class: "vocab" }, f.vocabulary.map((v) => {
        const btn = h("button", { class: "link-btn", type: "button", text: "+ Kartu" });
        btn.addEventListener("click", () => addCard(v, btn));
        return h("li", {}, h("span", { class: "v-phrase", text: v.phrase }), h("span", { class: "v-meaning", text: v.meaning }), btn);
      }))),
    ...f.betterAnswers.map((b) => h("details", { class: "fb-block", open: true },
      h("summary", { text: `Contoh jawaban lebih kuat: ${b.question.split("\n")[0]}` }),
      h("div", { class: "fb-pad" }, h("p", { class: "model", text: b.answer })))));
}

// ---------- history ----------
async function showHistory() {
  const { sessions } = await api("/api/speaking/sessions");
  if (!sessions.length) {
    $("#s-main").replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: "Belum ada latihan Speaking. Pilih Latihan untuk mulai." })));
    return;
  }
  const status = (x) => (x.status === "done" ? formatBand(x.band) : x.status === "pending" ? "dinilai…" : "gagal");
  $("#s-main").replaceChildren(h("section", { class: "card" },
    h("div", { class: "card-head" }, h("div", {}, h("h2", { text: "Riwayat Speaking" }), h("p", { class: "card-note", text: "Band di sini adalah estimasi Claude dari transkrip (tanpa Pronunciation)." }))),
    h("div", { class: "scroll" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", { text: "Tanggal" }), h("th", { text: "Latihan" }), h("th", { class: "num", text: "Jawaban" }), h("th", { class: "num", text: "Band" }))),
      h("tbody", {}, sessions.map((x) => h("tr", {},
        h("td", { class: "date", text: fmtDate(x.createdAt.slice(0, 10)) }),
        h("td", {}, h("a", { class: "t-title", href: `/speaking?session=${x.id}`, text: x.title })),
        h("td", { class: "num", text: String(x.answers) }),
        h("td", { class: "num", text: status(x) }))))))));
}

window.addEventListener("beforeunload", stopStream);
if (canSpeak) speechSynthesis.getVoices(); // starts loading the voice list
load().catch((err) => {
  $("#s-main").replaceChildren(h("div", { class: "card" }, h("p", { class: "empty pad-top", text: `Gagal memuat: ${err.message}` })));
});
