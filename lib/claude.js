// Runs the Claude Code CLI that is installed and logged in on this Mac (`claude -p`), so the
// app needs no API key: each request counts against the user's own Claude plan, the same
// way Thumbnail Studio writes its post text. No tools are enabled; Claude only reads the
// prompt and answers in the given JSON schema.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export class ClaudeError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

function claudeBin() {
  if (process.env.IELTS_COACH_CLAUDE_BIN) return process.env.IELTS_COACH_CLAUDE_BIN;
  const local = path.join(os.homedir(), ".local", "bin", "claude");
  return existsSync(local) ? local : "claude";
}

// The CLI must not inherit settings meant for another Claude session (this service may
// itself be started from one); its own login token and config dir are kept.
function cliEnv() {
  const keep = new Set(["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CONFIG_DIR"]);
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (keep.has(key) || !(key === "CLAUDECODE" || key.startsWith("CLAUDE_") || key.startsWith("ANTHROPIC_"))) env[key] = value;
  }
  env.PATH = [path.join(os.homedir(), ".local", "bin"), env.PATH].filter(Boolean).join(path.delimiter);
  return env;
}

export function runClaude({ system, prompt, schema, timeoutMs = 4 * 60_000 }) {
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--system-prompt", system,
    "--tools", "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--setting-sources", "",
    "--no-session-persistence",
  ];
  if (process.env.IELTS_COACH_MODEL) args.unshift("--model", process.env.IELTS_COACH_MODEL);

  return new Promise((resolve, reject) => {
    // The prompt goes in on stdin, so text that starts with "-" is never read as a flag.
    const child = spawn(claudeBin(), args, { env: cliEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ClaudeError("Claude terlalu lama menjawab (lebih dari 4 menit).", "Coba lagi sebentar lagi."));
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT"
        ? new ClaudeError("Claude Code tidak ditemukan di Mac ini.", "Install Claude Code, lalu jalankan `claude auth login` di Terminal.")
        : err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch {
        return reject(new ClaudeError(`Claude Code berhenti tanpa jawaban yang bisa dibaca (exit ${code}). ${stderr.slice(0, 200)}`.trim()));
      }
      if (result.is_error || result.subtype !== "success") {
        const message = String(result.result ?? result.subtype ?? "unknown error");
        if (/not logged in|\/login|authenticat/i.test(message)) {
          return reject(new ClaudeError("Claude Code di Mac ini belum login.", "Buka Terminal, jalankan `claude auth login`, lalu kirim ulang."));
        }
        return reject(new ClaudeError(`Claude: ${message.slice(0, 300)}`));
      }
      if (!result.structured_output) return reject(new ClaudeError("Jawaban Claude tidak sesuai format. Coba kirim ulang."));
      resolve(result.structured_output);
    });
    child.stdin.end(prompt);
  });
}
