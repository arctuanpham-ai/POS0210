import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
// Trình duyệt giữ file JS cũ theo URL: mọi import nội bộ phải cùng một số phiên bản với app.js trong index.html,
// nếu không, đổi một file mà quên đổi số là điện thoại chạy lẫn bản cũ / mới và cả trang chết.
test("mọi import nội bộ dùng chung số phiên bản với index.html", () => {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const v = /app\.js\?v=([0-9-]+)/.exec(html)[1];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const src = readFileSync(join(dir, f), "utf8");
    for (const m of src.matchAll(/from "\.\/([a-z-]+\.js)(\?v=([0-9-]+))?"/g)) assert.equal(m[3], v, `${f} import ${m[1]} dùng phiên bản ${m[3] || "(không có)"} khác ${v}`);
  }
});
