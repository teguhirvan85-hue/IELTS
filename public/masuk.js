import { $, api, icon } from "/ui.js";

$("#login-mark").append(icon("logo"));
const next = new URLSearchParams(location.search).get("next");
// Only local paths, so the link can't send anyone elsewhere.
const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

$("#login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const button = form.querySelector("button");
  const msg = $("#login-msg");
  button.disabled = true;
  msg.hidden = true;
  try {
    await api("/api/masuk", { method: "POST", body: { password: form.password.value } });
    location.href = target;
  } catch (err) {
    msg.textContent = err.message;
    msg.hidden = false;
    form.password.select();
    button.disabled = false;
  }
});
