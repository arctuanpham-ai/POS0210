import test from "node:test";
import assert from "node:assert/strict";
import { UNKNOWN, buildSourceReport, channelOf } from "../source-report.js";

const NOW = Date.UTC(2026, 10, 3, 5, 0);
const mk = (status, total, src, extra = {}) => ({ name: "Khách", status, total, createdAt: NOW - 3_600_000, ...(src ? { src } : {}), ...extra });
const ads = (campaign, content) => ({ source: "facebook", medium: "paid_social", campaign, content });

test("channelOf: phân nhóm nguồn, đơn cũ không src là Không xác định", () => {
  assert.equal(channelOf(undefined), UNKNOWN);
  assert.equal(channelOf(ads("a")), "Facebook Ads");
  assert.equal(channelOf({ source: "facebook", medium: "organic_social" }), "Facebook tự nhiên");
  assert.match(channelOf({ source: "facebook", medium: "fbclid" }), /chưa rõ/);
  assert.equal(channelOf({ source: "qr", medium: "offline" }), "QR");
  assert.equal(channelOf({ source: "zalo.me", medium: "referral" }), "Khác: zalo.me");
});

test("doanh thu chỉ tính đơn đã thanh toán; đơn huỷ không thành doanh thu; đơn kiểm thử bị loại", () => {
  const r = buildSourceReport([
    mk("done", 50000, ads("com_trua", "p1")), mk("paid", 30000, ads("com_trua", "p1")),
    mk("cancelled", 99000, ads("com_trua", "p1")), mk("new", 20000, ads("com_trua", "p1")),
    mk("done", 40000, null), mk("done", 1, ads("x"), { name: "KIEM THU TU DONG" }),
  ], NOW, 1);
  const fb = r.channels.find((c) => c.key === "Facebook Ads");
  assert.deepEqual({ orders: fb.orders, paid: fb.paid, lost: fb.lost, revenue: fb.revenue, avg: fb.avg }, { orders: 4, paid: 2, lost: 1, revenue: 80000, avg: 40000 });
  assert.equal(r.channels.find((c) => c.key === UNKNOWN).revenue, 40000);
  assert.equal(r.total.orders, 5); assert.equal(r.total.revenue, 120000);
  assert.equal(r.campaigns.length, 1);
  assert.match(r.campaigns[0].key, /com_trua · p1/);
});

test("lọc theo khoảng ngày", () => {
  const old = mk("done", 10000, ads("a"), { createdAt: NOW - 5 * 86_400_000 });
  assert.equal(buildSourceReport([old], NOW, 1).total.orders, 0);
  assert.equal(buildSourceReport([old], NOW, 7).total.orders, 1);
});

test("không có dữ liệu: rỗng, không chia cho 0", () => {
  const r = buildSourceReport([], NOW, 7);
  assert.deepEqual(r.channels, []); assert.equal(r.total.revenue, 0);
});
