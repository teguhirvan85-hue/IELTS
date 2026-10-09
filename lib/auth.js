// Access from outside the Mac through a public tunnel needs one shared password. The Mac
// itself and devices on the Tailscale network don't.
//
// <data>/auth.json holds a scrypt hash of the password and a secret that signs the login
// cookie; `npm run password` writes it. Setting a new password makes a new secret, which
// signs everyone out. Without the file, outside access stays closed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AUTH_COOKIE = "ielts_auth";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Who may skip the password. The server only listens on 127.0.0.1, so every request comes
// from this Mac: the browser on the Mac itself, cloudflared (which always adds
// cf-connecting-ip and cf-ray), or Tailscale Serve. Serve names the tailnet user in
// Tailscale-User-Login and drops that header from incoming requests; Funnel (public)
// traffic never gets it.
export function isTrusted(headers) {
  if (headers["cf-connecting-ip"] || headers["cf-ray"]) return false;
  const host = String(headers.host || "").toLowerCase().replace(/:\d+$/, "");
  if (LOCAL_HOSTS.has(host)) return true;
  return host.endsWith(".ts.net") && Boolean(headers["tailscale-user-login"]);
}

const SESSION_DAYS = 30;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") };
}

export function makeAuthFile(password) {
  return { ...hashPassword(password), secret: crypto.randomBytes(32).toString("hex"), updatedAt: new Date().toISOString() };
}

export function createAuth(dataDir) {
  const file = path.join(dataDir, "auth.json");
  let cache = { mtime: -1, value: null };

  // Read again whenever the file changes, so a new password works without a restart.
  function config() {
    let mtime;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {
      return null;
    }
    if (mtime !== cache.mtime) {
      try {
        cache = { mtime, value: JSON.parse(fs.readFileSync(file, "utf8")) };
      } catch {
        cache = { mtime, value: null };
      }
    }
    return cache.value;
  }

  const sign = (secret, expires) => crypto.createHmac("sha256", secret).update(`ielts:${expires}`).digest("hex");
  const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  return {
    enabled: () => Boolean(config()),
    checkPassword(password) {
      const c = config();
      if (!c || typeof password !== "string" || !password) return false;
      return same(hashPassword(password, c.salt).hash, c.hash);
    },
    // A signed expiry date: nothing to store on the server.
    issue() {
      const expires = Date.now() + SESSION_DAYS * 86400000;
      return { value: `${expires}.${sign(config().secret, expires)}`, maxAge: SESSION_DAYS * 86400 };
    },
    valid(token) {
      const c = config();
      const m = /^(\d{13})\.([0-9a-f]{64})$/.exec(token || "");
      if (!c || !m || Number(m[1]) < Date.now()) return false;
      return same(sign(c.secret, m[1]), m[2]);
    },
  };
}

// Slows down password guessing: after 8 wrong tries from one address, wait 15 minutes.
export function createLimiter({ tries = 8, minutes = 15 } = {}) {
  const fails = new Map();
  return {
    blocked(key) {
      const f = fails.get(key);
      if (!f) return 0;
      if (f.until && f.until > Date.now()) return Math.ceil((f.until - Date.now()) / 60000);
      if (f.until) fails.delete(key);
      return 0;
    },
    fail(key) {
      const f = fails.get(key) || { count: 0, until: 0 };
      f.count += 1;
      if (f.count >= tries) Object.assign(f, { count: 0, until: Date.now() + minutes * 60000 });
      fails.set(key, f);
    },
    clear(key) {
      fails.delete(key);
    },
  };
}
