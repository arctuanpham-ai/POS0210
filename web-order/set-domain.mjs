// Đổi tên miền trong thẻ Open Graph của trang đặt món.  Dùng:  node set-domain.mjs https://datmon.tenquan.vn
import { readFileSync, writeFileSync } from "node:fs";
const input = process.argv[2];
if (!input || !/^https:\/\/[a-z0-9.-]+\/?$/i.test(input)) { console.error("Cách dùng: node set-domain.mjs https://ten-mien-cua-ban.vn"); process.exit(1); }
const origin = input.replace(/\/$/, "");
const file = new URL("./public/index.html", import.meta.url);
const html = readFileSync(file, "utf8")
  .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${origin}/$2`)
  .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${origin}/assets/og.png$2`)
  .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${origin}/assets/og.png$2`);
writeFileSync(file, html);
console.log(`Đã đặt og:url và og:image theo ${origin}`);
