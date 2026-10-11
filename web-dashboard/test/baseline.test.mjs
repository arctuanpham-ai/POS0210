import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("recovered dashboard keeps its login and dashboard roots", async () => {
  const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
  await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(page, /id="login-view"/);
  assert.match(page, /id="dashboard-view"/);
  assert.match(page, /src="app\.js"/);
});
