import test from "node:test";
import assert from "node:assert/strict";
import { topSellers } from "../top-banner.js";

const now = new Date(2026, 9, 16, 20);
const docs = {
  "2026-10-16": { items: [{ itemId: "a", name: "Cà phê muối", qty: 12, revenue: 360000 }, { itemId: "b", name: "Bạc xỉu", qty: 9, revenue: 270000 }] },
  "2026-10-12": { items: [{ itemId: "b", name: "Bạc xỉu", qty: 20, revenue: 600000 }] },
  "2026-10-02": { items: [{ itemId: "c", name: "Trà đào", qty: 40, revenue: 1200000 }] },
};
test("mỗi kỳ ra món đứng đầu riêng", () => {
  const [d, w, m] = topSellers(docs, now);
  assert.equal(d.name, "Cà phê muối"); assert.equal(d.lead, 3); assert.equal(d.runnerUp, "Bạc xỉu");
  assert.equal(w.name, "Bạc xỉu"); assert.equal(w.qty, 29);
  assert.equal(m.name, "Trà đào"); assert.equal(m.label, "Tháng 10");
});
test("không có dữ liệu thì name rỗng", () => {
  const [d] = topSellers({}, now);
  assert.equal(d.name, ""); assert.equal(d.days, 0);
});
