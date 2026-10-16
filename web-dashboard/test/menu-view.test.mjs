import test from "node:test";
import assert from "node:assert/strict";
import { menuGroups, nameIssues, soldNotInMenu } from "../menu-view.js";

const cats = [{ id: "c2", name: "Trà", sortOrder: 2 }, { id: "c1", name: "Cà phê", sortOrder: 1 }];
const items = [
  { id: "a", name: "Bạc xỉu", categoryId: "c1", sortOrder: 2, price: 30000 },
  { id: "b", name: "Cà phê muối", categoryId: "c1", sortOrder: 1, price: 35000 },
  { id: "c", name: "Trà đào", categoryId: "c2", price: 40000 },
  { id: "d", name: "Bún gà 40 ", categoryId: "zz", price: 40000 },
  { id: "e", name: "bún  gà 40", categoryId: "zz", price: 40000 },
  { id: "x", name: "Đã xoá", deleted: true },
];
test("nhóm theo thứ tự, món mất nhóm vào Khác", () => {
  const g = menuGroups(items, cats);
  assert.deepEqual(g.map((x) => x.name), ["Cà phê", "Trà", "Khác"]);
  assert.deepEqual(g[0].items.map((m) => m.id), ["b", "a"]);
});
test("phát hiện trùng tên và khoảng trắng thừa", () => {
  const r = nameIssues(items);
  assert.equal(r.duplicates.length, 1); assert.equal(r.duplicates[0].items.length, 2);
  assert.deepEqual(r.spacing.map((m) => m.id).sort(), ["d", "e"]);
});
test("món bán ra không có trong menu", () => {
  const r = soldNotInMenu({ d1: { items: [{ itemId: "a", name: "Bạc xỉu", qty: 3 }, { itemId: "zz", name: "Cơm gà", qty: 4 }] }, d2: { items: [{ itemId: "zz2", name: "cơm gà", qty: 1 }] } }, items);
  assert.deepEqual(r, [{ name: "Cơm gà", qty: 5 }]);
});
