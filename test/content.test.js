import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkContent } from "../lib/check-content.js";

test("every lesson and drill passes the content checks", () => {
  const { errors, lessons, drills } = checkContent(fileURLToPath(new URL("../content", import.meta.url)));
  assert.deepEqual(errors, []);
  assert.ok(lessons > 0 && drills > 0);
});
