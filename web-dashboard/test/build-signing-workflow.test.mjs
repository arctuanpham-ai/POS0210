import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow build khôi phục khóa ký ổn định, không tự tạo khóa tạm", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /POS0210_KEYSTORE_BASE64/);
  assert.match(workflow, /POS0210_KEYSTORE_PASSWORD/);
  assert.match(workflow, /POS0210_KEY_ALIAS/);
  assert.match(workflow, /POS0210_KEY_PASSWORD/);
  assert.doesNotMatch(workflow, /Temporary CI signing key/);
  assert.doesNotMatch(workflow, /keytool -genkeypair/);
});
