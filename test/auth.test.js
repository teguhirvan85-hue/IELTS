import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuth, createLimiter, makeAuthFile } from "../lib/auth.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ielts-auth-"));
}

test("outside access stays closed until a password is set", () => {
  const auth = createAuth(tempDir());
  assert.equal(auth.enabled(), false);
  assert.equal(auth.checkPassword("anything"), false);
  assert.equal(auth.valid("123.abc"), false);
});

test("password check and signed cookie", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "auth.json"), JSON.stringify(makeAuthFile("correct horse")));
  const auth = createAuth(dir);
  assert.equal(auth.enabled(), true);
  assert.equal(auth.checkPassword("correct horse"), true);
  assert.equal(auth.checkPassword("wrong"), false);
  assert.equal(auth.checkPassword(undefined), false);
  const { value } = auth.issue();
  assert.equal(auth.valid(value), true);
  assert.equal(auth.valid(value.replace(/.$/, (c) => (c === "0" ? "1" : "0"))), false);
  const [, sig] = value.split(".");
  assert.equal(auth.valid(`${Date.now() - 1000}.${sig}`), false);
});

test("a new password signs everyone out", () => {
  const dir = tempDir();
  const file = path.join(dir, "auth.json");
  fs.writeFileSync(file, JSON.stringify(makeAuthFile("first password")));
  const auth = createAuth(dir);
  const { value } = auth.issue();
  fs.writeFileSync(file, JSON.stringify(makeAuthFile("second password")));
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(file, later, later);
  assert.equal(auth.valid(value), false);
  assert.equal(auth.checkPassword("second password"), true);
});

test("limiter blocks after repeated failures", () => {
  const limiter = createLimiter({ tries: 3, minutes: 15 });
  for (let i = 0; i < 2; i++) limiter.fail("ip");
  assert.equal(limiter.blocked("ip"), 0);
  limiter.fail("ip");
  assert.ok(limiter.blocked("ip") > 0);
  assert.equal(limiter.blocked("other"), 0);
});

test("who may skip the password", async () => {
  const { isTrusted } = await import("../lib/auth.js");
  assert.equal(isTrusted({ host: "localhost:3232" }), true);
  assert.equal(isTrusted({ host: "127.0.0.1:3232" }), true);
  // Cloudflare tunnel, even when it claims to be local or on the tailnet
  assert.equal(isTrusted({ host: "abc.trycloudflare.com", "cf-connecting-ip": "1.2.3.4", "cf-ray": "x" }), false);
  assert.equal(isTrusted({ host: "localhost", "cf-ray": "x" }), false);
  assert.equal(isTrusted({ host: "mac.tail1.ts.net", "cf-connecting-ip": "1.2.3.4", "tailscale-user-login": "a@b" }), false);
  // Tailscale Serve: tailnet user named; Funnel: no user
  assert.equal(isTrusted({ host: "mac.tail1.ts.net", "tailscale-user-login": "someone@example.com" }), true);
  assert.equal(isTrusted({ host: "mac.tail1.ts.net" }), false);
  assert.equal(isTrusted({ host: "evil.example.com", "tailscale-user-login": "a@b" }), false);
});
