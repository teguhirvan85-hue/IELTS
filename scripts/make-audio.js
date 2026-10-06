// Builds the audio for listening drills with macOS text-to-speech (`say`) and ffmpeg.
//   npm run audio              only drills whose script changed since the last run
//   npm run audio -- --force   every listening drill
// Each script line is spoken in its own voice, short silences go between lines, and the
// result is saved as content/audio/<drill-id>.m4a. content/audio/manifest.json remembers
// which script version each file was made from.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const contentDir = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(ROOT, "content"));
const RATE = 165; // words per minute: a little slower than the default, close to IELTS pace
const RATE_HZ = 22050;

// Pause after a line, in seconds: longer after the narrator, longest after
// "you have some time to look at questions …".
function pauseAfter(line) {
  if (typeof line.pause === "number") return line.pause;
  if (/some time to look at/i.test(line.text)) return 4;
  if (line.speaker === "Narrator") return 1.2;
  return 0.45;
}

async function silence(file, seconds) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `anullsrc=r=${RATE_HZ}:cl=mono`, "-t", String(seconds), "-c:a", "pcm_s16le", file]);
}

async function build(drill, outFile) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ielts-audio-${drill.id}-`));
  try {
    const list = [];
    const gaps = new Map();
    for (const [i, line] of drill.script.entries()) {
      const wav = path.join(tmp, `${String(i).padStart(3, "0")}.wav`);
      await run("say", ["-v", line.voice, "-r", String(RATE), "--file-format=WAVE", `--data-format=LEI16@${RATE_HZ}`, "-o", wav, line.text]);
      list.push(wav);
      const secs = pauseAfter(line);
      if (!gaps.has(secs)) {
        const g = path.join(tmp, `gap-${secs}.wav`);
        await silence(g, secs);
        gaps.set(secs, g);
      }
      list.push(gaps.get(secs));
    }
    const listFile = path.join(tmp, "list.txt");
    fs.writeFileSync(listFile, list.map((f) => `file '${f}'`).join("\n"));
    await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c:a", "aac", "-b:a", "64k", "-ac", "1", outFile]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const drillsDir = path.join(contentDir, "drills");
const audioDir = path.join(contentDir, "audio");
fs.mkdirSync(audioDir, { recursive: true });
const manifestFile = path.join(audioDir, "manifest.json");
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")) : {};

const drills = fs.readdirSync(drillsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(drillsDir, f), "utf8")))
  .filter((d) => d.skill === "listening" && Array.isArray(d.script));

let made = 0;
for (const drill of drills) {
  const hash = crypto.createHash("sha1").update(JSON.stringify({ script: drill.script, RATE })).digest("hex");
  const out = path.join(audioDir, `${drill.id}.m4a`);
  if (!force && manifest[drill.id] === hash && fs.existsSync(out)) continue;
  process.stdout.write(`${drill.id}: ${drill.script.length} lines… `);
  await build(drill, out);
  manifest[drill.id] = hash;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]);
  console.log(`${Math.round(Number(stdout))} s`);
  made++;
}
console.log(made ? `${made} audio file(s) made.` : "All audio is up to date.");
