#!/usr/bin/env node
// Sets the password for opening IELTS Coach from outside this Mac (tunnel or Tailscale).
// Run it yourself in Terminal: npm run password
// Only a scrypt hash is stored, in data/auth.json. A new password signs everyone out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeAuthFile } from "../lib/auth.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");
const file = path.join(dataDir, "auth.json");

// Reads a line without echoing it.
function ask(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      console.error("Jalankan perintah ini langsung di Terminal.");
      process.exit(1);
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    // A paste arrives as one chunk, so go through it character by character.
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const first = await ask("Password baru (minimal 8 karakter): ");
if (first.length < 8) {
  console.error("Terlalu pendek. Tidak ada yang diubah.");
  process.exit(1);
}
const again = await ask("Ulangi password: ");
if (again !== first) {
  console.error("Tidak sama. Tidak ada yang diubah.");
  process.exit(1);
}

fs.mkdirSync(dataDir, { recursive: true });
const tmp = `${file}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(makeAuthFile(first), null, 2), { mode: 0o600 });
fs.renameSync(tmp, file);
console.log("✓ Password tersimpan. Akses dari luar Mac sekarang memakai password ini.");
