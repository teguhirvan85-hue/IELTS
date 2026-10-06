// JSON file storage: data/db.json holds one entry per learner profile (settings, logged
// tests, drill results, journal, flashcards, essays) plus the engnovate test layouts that
// all profiles share. Writes go through a temp file + rename so a crash never leaves half
// a file.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const DEFAULT_SETTINGS = { examDate: null, targetBand: null, module: null, minutesPerDay: 45, role: null };

function emptyProfile(id, name) {
  return { id, name, createdAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS }, attempts: [], drillAttempts: [], mistakes: {}, cards: [], essays: [], speaking: [], plan: {} };
}

// Fills in fields added in later versions, so older profiles keep working.
function normalizeProfile(p) {
  const base = emptyProfile(p.id, p.name || "Profil");
  const given = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null));
  return { ...base, ...given, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}) } };
}

export function createStore(dataDir) {
  const file = path.join(dataDir, "db.json");
  const trashFile = path.join(dataDir, "trash.json");
  fs.mkdirSync(dataDir, { recursive: true });

  let db = { version: 2, profiles: {}, tests: {} };
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.profiles) {
      db = { ...db, ...saved };
    } else {
      // Version 1 had a single learner at the top level: it becomes the first profile.
      fs.copyFileSync(file, path.join(dataDir, "db.v1-backup.json"));
      const p1 = normalizeProfile({
        id: "p1", name: "Saya", settings: saved.settings, attempts: saved.attempts, drillAttempts: saved.drillAttempts,
        mistakes: saved.mistakes, cards: saved.cards,
      });
      db = { version: 2, profiles: { p1 }, tests: saved.tests || {} };
    }
  }
  for (const id of Object.keys(db.profiles)) db.profiles[id] = normalizeProfile(db.profiles[id]);
  if (!Object.keys(db.profiles).length) db.profiles.p1 = emptyProfile("p1", "Saya");

  function save() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  // Deleted items are kept in data/trash.json (last 500), so nothing is lost for good.
  // entry names its kind and profile: { profile, attempt } or { profile, card }.
  function trash(entry) {
    let list = [];
    try {
      list = JSON.parse(fs.readFileSync(trashFile, "utf8"));
    } catch {}
    list.push({ deletedAt: new Date().toISOString(), ...entry });
    fs.writeFileSync(trashFile, JSON.stringify(list.slice(-500), null, 2));
  }

  return {
    dir: dataDir,
    get db() {
      return db;
    },
    // The profile a request works on: the one named in its cookie, else the first.
    profile(id) {
      return db.profiles[id] || Object.values(db.profiles)[0];
    },
    addProfile(name) {
      const id = "p" + crypto.randomBytes(4).toString("hex");
      db.profiles[id] = emptyProfile(id, name);
      return db.profiles[id];
    },
    save,
    trash,
  };
}
