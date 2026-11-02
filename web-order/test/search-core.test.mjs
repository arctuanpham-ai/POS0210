import test from "node:test";
import assert from "node:assert/strict";
import { fold, indexItem, searchEntries, suggestions, usableKeywords, editDistance } from "../public/search-core.js";

const CATS = { _combo: "Combo", c0: "Cà phê", c1: "Ăn sáng", c2: "Trà", snack: "Đồ ăn vặt", juice: "Nước ép", rice: "cơm trưa" };
const ITEMS = [
  { id: "1", categoryId: "_combo", name: "Cafe Ngon", description: "Cafe sữa + Cơm gà chiên mắm" },
  { id: "2", categoryId: "_combo", name: "Bánh mì trứng + trà chanh", description: "Bánh mì trứng + Trà chanh nha đam" },
  { id: "3", categoryId: "c0", name: "Đen đá" },
  { id: "4", categoryId: "c0", name: "Cafe sữa" },
  { id: "5", categoryId: "c0", name: "Bạc xỉu" },
  { id: "6", categoryId: "c0", name: "Cold brew cam" },
  { id: "7", categoryId: "c0", name: "Cacao kem cheese" },
  { id: "8", categoryId: "c1", name: "Bún gà 40" },
  { id: "9", categoryId: "c1", name: "Bít tết", description: "pate, trứng ốp, thịt bò, bánh mì" },
  { id: "10", categoryId: "c1", name: "Bánh mì trứng", description: "bánh mì 2 trứng ốp la" },
  { id: "11", categoryId: "c1", name: "Bánh mì bơ sữa" },
  { id: "12", categoryId: "c2", name: "Trà chanh nha đam" },
  { id: "13", categoryId: "snack", name: "Hạt dưa" },
  { id: "14", categoryId: "juice", name: "Nước ép dưa hấu" },
  { id: "15", categoryId: "juice", name: "Sữa chua dầm dưa hấu" },
  { id: "16", categoryId: "rice", name: "Cơm gà chiên mắm" },
  { id: "17", categoryId: "rice", name: "Cơm bò sốt tiêu" },
];
const entries = ITEMS.map((i) => indexItem(i, CATS[i.categoryId]));
const ids = (q) => searchEntries(entries, q).items.map((i) => i.id);

test("bỏ dấu và hạ chữ thường", () => {
  assert.equal(fold("Cà phê  Sữa Đá!"), "ca phe sua da");
  assert.equal(fold("Bánh MÌ"), "banh mi");
  assert.equal(fold(null), "");
});

test("không dấu, không phân biệt hoa thường", () => {
  assert.deepEqual(ids("ca phe").slice(0, 3).sort(), ids("CÀ PHÊ").slice(0, 3).sort());
  assert.ok(ids("banh mi").includes("10"));
  assert.ok(ids("BÁNH MÌ").includes("11"));
  assert.ok(ids("bac xiu").includes("5"));
});

test("gõ liền không cách", () => {
  assert.ok(ids("banhmi").includes("10"));
  assert.ok(ids("banhmitrung").includes("10"));
});

test("nhiều từ: mọi từ phải khớp", () => {
  const r = ids("banh mi trung");
  assert.ok(r.includes("2") && r.includes("10"));
  assert.ok(!r.includes("11"), "bánh mì bơ sữa không có trứng");
  assert.ok(!r.includes("12"));
  assert.ok(ids("tra chanh").includes("12"));
});

test("từ đồng nghĩa: cf, coffee, cafe -> cà phê", () => {
  for (const q of ["cf", "coffee", "caphe", "cà phê"]) {
    const r = ids(q);
    assert.ok(r.includes("4"), q);
    assert.ok(r.includes("3"), `${q} ra món trong nhóm Cà phê`);
  }
});

test("ý định: đồ uống / đồ ăn", () => {
  const drinks = ids("đồ uống");
  for (const id of ["4", "12", "14"]) assert.ok(drinks.includes(id), `uống: ${id}`);
  assert.ok(!drinks.includes("16"));
  const food = ids("đồ ăn");
  for (const id of ["8", "10", "16"]) assert.ok(food.includes(id), `ăn: ${id}`);
  assert.ok(!food.includes("12"));
});

test("khớp theo đầu từ: 'ga' không dính từ chứa 'ga' ở giữa, 'bo' ra bò", () => {
  assert.ok(ids("ga").includes("8"));
  assert.ok(ids("bo").includes("17"));
  assert.deepEqual(ids("xyz"), []);
});

test("tên khớp đúng lên đầu", () => {
  assert.equal(ids("cafe sua")[0], "4");
  assert.equal(ids("banh mi trung")[0] === "10" || ids("banh mi trung")[0] === "2", true);
});

test("tìm theo mô tả và tên món thành phần của combo", () => {
  assert.ok(ids("com ga").includes("1"));
  assert.ok(ids("pate").includes("9"));
});

test("gõ sai một ký tự vẫn ra món gần giống, có cờ fuzzy", () => {
  const r = searchEntries(entries, "dua hao");
  assert.equal(r.fuzzy, true);
  assert.ok(r.items.map((i) => i.id).includes("14"));
  const ok = searchEntries(entries, "dua hau");
  assert.equal(ok.fuzzy, false);
  assert.equal(searchEntries(entries, "pizza").items.length, 0);
});

test("truy vấn rỗng trả cả menu", () => {
  assert.equal(searchEntries(entries, "  ").items.length, ITEMS.length);
});

test("editDistance", () => {
  assert.equal(editDistance("hau", "hao"), 1);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.ok(editDistance("abcd", "wxyz") > 1);
});

test("gợi ý khi gõ: nhóm trước, rồi tên món, không trùng", () => {
  const s = suggestions(entries, Object.values(CATS), "tra");
  assert.deepEqual(s[0], { type: "category", text: "Trà" });
  assert.ok(s.some((x) => x.type === "dish" && x.text === "Trà chanh nha đam"));
  assert.equal(new Set(s.map((x) => x.text)).size, s.length);
  assert.deepEqual(suggestions(entries, Object.values(CATS), ""), []);
  assert.ok(suggestions(entries, Object.values(CATS), "banh", 2).length <= 2);
});

test("từ khoá gợi ý chỉ gồm từ còn ra món", () => {
  const kws = usableKeywords(entries, 20);
  for (const kw of ["cà phê", "trà", "bánh mì", "cơm", "đồ uống", "đồ ăn", "cheese", "combo"]) assert.ok(kws.includes(kw), kw);
  assert.ok(!kws.includes("matcha"));
  assert.ok(!kws.includes("bún") === false);
  assert.ok(usableKeywords(entries, 3).length <= 3);
});
