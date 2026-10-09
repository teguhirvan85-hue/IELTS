// Small helpers shared by the dashboard and the log page.

export const $ = (sel, root = document) => root.querySelector(sel);

// Element builder. Text always goes in as textContent, never as HTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Gagal (${res.status}).`);
  return data;
}

const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export const fmtDay = (iso) => (iso ? dayFmt.format(parseISO(iso)) : "—");
export const fmtDate = (iso) => (iso ? fullFmt.format(parseISO(iso)) : "—");

// Two-step delete: first click arms the button, second click within 4 s confirms.
export function armedButton(btn, onConfirm) {
  let timer = null;
  const label = btn.textContent;
  btn.addEventListener("click", () => {
    if (btn.classList.contains("armed")) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    btn.classList.add("armed");
    btn.textContent = "Yakin hapus?";
    timer = setTimeout(() => {
      btn.classList.remove("armed");
      btn.textContent = label;
    }, 4000);
  });
}

// ---------- app navigation (one definition for every page) ----------
// Pages carry <nav class="appnav" data-page="…">; this fills it in as a floating glass
// sidebar on wide screens and a bottom tab bar on phones, plus a small top bar on phones
// with the profile switcher and the "log a test" button.

const ICONS = {
  logo: '<path d="M4 17.5 9.5 12l4 3L20 7.5"/><path d="M15.5 7.5H20V12"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  learn: '<path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v13c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-13c-3.8 0-6.3.5-8 2Z"/><path d="M12 6.5v13"/>',
  writing: '<path d="M14.5 5.5 18.5 9.5"/><path d="M4 20l1-4.5L15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L8.5 19 4 20Z"/>',
  journal: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  cards: '<rect x="3.5" y="7.5" width="13" height="12" rx="2.5"/><path d="M7.5 4.5h10.5a2.5 2.5 0 0 1 2.5 2.5v9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  speaking: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  headphones: '<path d="M4 15.5v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4.5" height="6.5" rx="2"/><rect x="16" y="14" width="4.5" height="6.5" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
};
export function icon(name) {
  const el = document.createElement("span");
  el.className = "icon";
  el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`; // fixed markup above
  return el;
}

const NAV = [
  { key: "dashboard", href: "/", label: "Dashboard" },
  { key: "learn", href: "/learn", label: "Materi" },
  { key: "writing", href: "/writing", label: "Writing" },
  { key: "speaking", href: "/speaking", label: "Speaking" },
  { key: "journal", href: "/journal", label: "Jurnal" },
  { key: "cards", href: "/cards", label: "Kartu" },
];

// ---------- light / dark ----------
// Light by default; dark only when chosen here. The choice is kept on this device, and a
// one-line script in each page's <head> applies it before the first paint.
const THEME_KEY = "ielts-theme";
const themeButtons = [];
const isDark = () => document.documentElement.dataset.theme === "dark";
function paintTheme(b) {
  const dark = isDark();
  b.button.setAttribute("aria-checked", String(dark));
  b.button.replaceChildren(icon(dark ? "sun" : "moon"), ...(b.label ? [h("span", { text: dark ? "Mode terang" : "Mode gelap" })] : []));
  b.button.title = dark ? "Ganti ke mode terang" : "Ganti ke mode gelap";
}
export function setTheme(theme) {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The page still switches; it just won't be remembered.
  }
  themeButtons.forEach(paintTheme);
}
// `label`: a sidebar row with text; otherwise a round icon button.
export function themeToggle({ label = false, className = label ? "nav-item" : "btn icon-only" } = {}) {
  const button = h("button", { class: className, type: "button", role: "switch", "aria-label": "Mode gelap" });
  button.addEventListener("click", () => setTheme(isDark() ? "light" : "dark"));
  const entry = { button, label };
  themeButtons.push(entry);
  paintTheme(entry);
  return button;
}

// The profile button shows who is studying and opens the "who's studying?" screen.
const profileButtons = [];
function profilePicker() {
  const avatar = h("span", { class: "avatar", "aria-hidden": "true" });
  const name = h("span", { class: "profile-name" });
  profileButtons.push({ avatar, name });
  return h("a", { class: "profile", href: "/pilih", title: "Ganti profil" }, avatar, name, icon("chevron"));
}

function renderNav() {
  const nav = document.querySelector("nav.appnav");
  if (!nav) return;
  const page = nav.dataset.page;
  const brand = () => h("a", { class: "brand", href: "/" }, h("span", { class: "brand-mark" }, icon("logo")), h("span", { text: "IELTS Coach" }));
  const settings = page === "dashboard"
    ? h("button", { class: "nav-item", type: "button", id: "open-settings" }, icon("settings"), h("span", { text: "Pengaturan" }))
    : h("a", { class: "nav-item", href: "/?settings=1" }, icon("settings"), h("span", { text: "Pengaturan" }));
  nav.replaceChildren(
    h("div", { class: "nav-head" }, brand(), profilePicker()),
    h("div", { class: "nav-items" }, NAV.map((item) =>
      h("a", { class: "nav-item", href: item.href, "aria-current": item.key === page ? "page" : null }, icon(item.key), h("span", { text: item.label })))),
    h("div", { class: "nav-foot" },
      h("a", { class: "btn primary nav-add", href: "/log", "aria-current": page === "log" ? "page" : null }, icon("plus"), h("span", { text: "Catat hasil tes" })),
      themeToggle({ label: true }),
      settings));
  const mobileSettings = page === "dashboard"
    ? h("button", { class: "btn icon-only", type: "button", "aria-label": "Pengaturan", onclick: () => document.getElementById("open-settings")?.click() }, icon("settings"))
    : h("a", { class: "btn icon-only", href: "/?settings=1", "aria-label": "Pengaturan" }, icon("settings"));
  nav.after(h("div", { class: "mobilebar" }, brand(), profilePicker(), themeToggle(), mobileSettings,
    h("a", { class: "btn primary icon-only", href: "/log", "aria-label": "Catat hasil tes" }, icon("plus"))));
  fillProfiles();
}

async function fillProfiles() {
  try {
    const { active, profiles } = await api("/api/profiles");
    const index = Math.max(0, profiles.findIndex((p) => p.id === active));
    const current = profiles[index];
    for (const { avatar, name } of profileButtons) {
      avatar.textContent = (current.name.trim()[0] || "?").toUpperCase();
      avatar.className = `avatar c${index % 4}`;
      name.textContent = current.name;
    }
  } catch {
    // The page still works without the profile name.
  }
}

// Called after a profile is renamed in Pengaturan.
export function renameCurrentProfile(newName) {
  for (const { avatar, name } of profileButtons) {
    name.textContent = newName;
    avatar.textContent = (newName.trim()[0] || "?").toUpperCase();
  }
}

renderNav();
