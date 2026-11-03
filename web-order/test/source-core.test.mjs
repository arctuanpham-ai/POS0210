import test from "node:test";
import assert from "node:assert/strict";
import { ATTR_TTL_MS, attributionForOrder, buildUtmUrl, cleanTag, parseTouch, updateAttribution, visitDocId, visitSource } from "../public/source-core.js";
import { buildOrderDoc, ORDER_KEYS } from "../public/order-core.js";

const T0 = Date.UTC(2026, 10, 3, 3, 0);
const FB = "?utm_source=facebook&utm_medium=paid_social&utm_campaign=com_trua&utm_content=post_01";

test("parseTouch: đọc đủ 5 tham số UTM", () => {
  const t = parseTouch(`${FB}&utm_term=ca_phe`, "", "datmon0210.web.app");
  assert.deepEqual({ ...t }, { source: "facebook", medium: "paid_social", campaign: "com_trua", content: "post_01", term: "ca_phe", strong: true });
});

test("parseTouch: không UTM, không nơi giới thiệu -> null (không coi là trực tiếp)", () => {
  assert.equal(parseTouch("", "", "datmon0210.web.app"), null);
  assert.equal(parseTouch("?foo=1", "https://datmon0210.web.app/x", "datmon0210.web.app"), null);
});

test("parseTouch: Facebook / Google / site khác chỉ là nguồn đoán (weak)", () => {
  assert.deepEqual({ ...parseTouch("", "https://l.facebook.com/l.php?u=x", "h") }, { source: "facebook", medium: "referral", campaign: "", content: "", term: "", strong: false });
  assert.equal(parseTouch("", "https://www.google.com/", "h").source, "google");
  assert.equal(parseTouch("?fbclid=abc123", "", "h").medium, "fbclid");
  assert.equal(parseTouch("", "https://zalo.me/abc", "h").source, "zalo.me");
});

test("UTM không hợp lệ hoặc quá dài bị làm sạch / cắt", () => {
  const long = "a".repeat(200);
  const t = parseTouch(`?utm_source=Face Book<script>&utm_campaign=${long}`, "", "h");
  assert.equal(t.source, "face_bookscript");
  assert.equal(t.campaign.length, 40);
  assert.equal(cleanTag("  Cơm Trưa! "), "com_trua", "bỏ dấu tiếng Việt, không làm mất chữ");
  assert.equal(cleanTag("Chiến dịch Đặt trực tiếp"), "chien_dich_dat_truc_tiep");
  assert.equal(parseTouch("?utm_campaign=x", "", "h").source, "(not_set)");
  assert.equal(parseTouch("?utm_source=%%%", "", "h"), null);
});

test("khách vào từ Facebook Ads rồi đặt ngay: đơn mang đủ nguồn, chiến dịch, nội dung, thời điểm", () => {
  const stored = updateAttribution(null, parseTouch(FB, "", "h"), T0);
  const src = attributionForOrder(stored, T0 + 60_000);
  assert.equal(src.source, "facebook"); assert.equal(src.medium, "paid_social");
  assert.equal(src.campaign, "com_trua"); assert.equal(src.content, "post_01"); assert.equal(src.at, T0);
  assert.equal(src.first.campaign, "com_trua");
});

test("đóng trang quay lại trong 7 ngày: vẫn giữ nguồn; quá 7 ngày thì hết", () => {
  const stored = updateAttribution(null, parseTouch(FB, "", "h"), T0);
  const later = T0 + 6 * 86_400_000;
  assert.equal(attributionForOrder(updateAttribution(stored, null, later), later).campaign, "com_trua");
  const expired = T0 + ATTR_TTL_MS + 1000;
  assert.equal(attributionForOrder(stored, expired), null);
  assert.equal(updateAttribution(stored, null, expired), null);
});

test("URL không UTM / reload / chuyển trang không ghi đè nguồn hợp lệ", () => {
  const stored = updateAttribution(null, parseTouch(FB, "", "h"), T0);
  assert.equal(updateAttribution(stored, parseTouch("", "", "h"), T0 + 1000), stored);
  assert.equal(updateAttribution(stored, parseTouch(FB, "", "h"), T0 + 5000), stored, "cùng chiến dịch: giữ mốc thời gian đầu");
  const weak = updateAttribution(stored, parseTouch("", "https://l.facebook.com/", "h"), T0 + 9000);
  assert.equal(weak.last.campaign, "com_trua", "nguồn đoán không đè nguồn có UTM");
});

test("hai chiến dịch khác nhau: nguồn gần nhất cập nhật, nguồn đầu tiên giữ nguyên", () => {
  const a = updateAttribution(null, parseTouch("?utm_source=facebook&utm_medium=paid_social&utm_campaign=loi_ich_dat_truc_tiep&utm_content=v1", "", "h"), T0);
  const b = updateAttribution(a, parseTouch(FB, "", "h"), T0 + 86_400_000);
  const src = attributionForOrder(b, T0 + 86_400_000);
  assert.equal(src.campaign, "com_trua"); assert.equal(src.first.campaign, "loi_ich_dat_truc_tiep");
});

test("đơn không có nguồn (trình duyệt khác / chưa từng có UTM): không thêm trường src, đúng 17 trường", () => {
  assert.equal(attributionForOrder(null, T0), null);
  const base = { code: "ABC234", uid: "u", value: { name: "A", phone: "0912345678", mode: "pickup", address: "", table: "", note: "" }, lines: [{ id: "m1", name: "X", qty: 1, note: "", price: 1000 }], pricing: null };
  assert.equal(Object.keys({ ...buildOrderDoc(base), createdAt: 1 }).length, ORDER_KEYS.length);
  assert.ok(!("src" in buildOrderDoc(base)));
  const withSrc = buildOrderDoc({ ...base, src: { source: "facebook", at: T0 } });
  assert.equal(Object.keys({ ...withSrc, createdAt: 1 }).length, ORDER_KEYS.length + 1);
});

test("buildUtmUrl: link quảng cáo thật", () => {
  const url = buildUtmUrl("https://datmon0210.web.app/", { source: "facebook", medium: "paid_social", campaign: "com_trua", content: "Post 01" });
  assert.equal(url, "https://datmon0210.web.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=com_trua&utm_content=post_01");
});

test("lượt vào theo nguồn: nguồn không xác định, mã tài liệu ổn định và khác nhau theo chiến dịch", () => {
  assert.deepEqual(visitSource(null), { source: "unknown", medium: "", campaign: "", content: "" });
  const a = visitSource(parseTouch(FB, "", "h")), b = visitSource(parseTouch("?utm_source=facebook&utm_medium=paid_social&utm_campaign=khac", "", "h"));
  assert.match(visitDocId("20261103", a), /^20261103~[0-9a-f]{8}$/);
  assert.equal(visitDocId("20261103", a), visitDocId("20261103", { ...a }));
  assert.notEqual(visitDocId("20261103", a), visitDocId("20261103", b));
  assert.notEqual(visitDocId("20261103", a), visitDocId("20261104", a));
});
