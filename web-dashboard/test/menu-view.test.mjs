import test from "node:test";
import assert from "node:assert/strict";
import { menuGroups, mergePlan, nameIssues, soldCombos, soldNotInMenu } from "../menu-view.js";

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

test("gộp món trùng: giữ món đang bán và bán nhiều, món kia ngừng bán + đổi tên, không đổi mã", () => {
  const p = mergePlan([{ id: "d", name: "Bún gà 40 ", productCode: "AN-010", active: true }, { id: "e", name: "bún  gà 40", productCode: "AN-011", active: true }], { e: 30, d: 4 });
  assert.equal(p.keep.id, "e");
  assert.deepEqual(p.writes, [
    { id: "e", data: { name: "bún gà 40", active: true } },
    { id: "d", data: { name: "bún gà 40 (gộp vào AN-011)", active: false, mergedInto: "e" } },
  ]);
  assert.ok(p.writes.every((w) => !("productCode" in w.data)));
});
test("gộp ưu tiên món đang bán dù món ngừng bán bán nhiều hơn", () => {
  const p = mergePlan([{ id: "a", name: "X", active: false }, { id: "b", name: "X", active: true }], { a: 100 });
  assert.equal(p.keep.id, "b");
});
import { nextProductCode, menuEditProblem } from "../menu-view.js";
test("mã món mới theo tiền tố nhóm, không trùng", () => {
  const items = [{ id: "1", categoryId: "c", productCode: "CF-001" }, { id: "2", categoryId: "c", productCode: "CF-007" }, { id: "3", categoryId: "t", productCode: "TR-002" }];
  assert.equal(nextProductCode(items, "c"), "CF-008");
  assert.equal(nextProductCode(items, "new"), "MN-001");
});
test("kiểm tra món sửa trên web", () => {
  const items = [{ id: "1", name: "Bạc xỉu", productCode: "CF-001", active: true }];
  assert.match(menuEditProblem({ id: "2", name: " bạc  xỉu", price: 30000, categoryId: "c" }, items), /Đã có món/);
  assert.match(menuEditProblem({ id: "2", name: "Mới", price: 30000, categoryId: "c", productCode: "CF-001" }, items), /đã thuộc/);
  assert.match(menuEditProblem({ id: "2", name: "Mới", price: 30200, categoryId: "c" }, items), /tròn 500/);
  assert.equal(menuEditProblem({ id: "1", name: "Bạc xỉu", price: 32000, categoryId: "c", productCode: "CF-001" }, items), "");
});

test("combo không bị báo thiếu trong menu, được liệt kê riêng", () => {
  const docs = { d1: { items: [{ itemId: "c1", name: "COMBO · Trà Ngon [1×Trà chanh + 1×Cơm gà]", qty: 10 }, { itemId: "c2", name: "COMBO · Cam Đẹp [1×Nước ép cam]", qty: 5 }] } };
  assert.deepEqual(soldNotInMenu(docs, items), []);
  assert.deepEqual(soldCombos(docs).map((c) => c.qty), [10, 5]);
});
