import test from "node:test";
import assert from "node:assert/strict";
import { menuCsv } from "../menu-export.js";

test("menu CSV: theo thứ tự nhóm, giữ món tắt, bọc ký tự đặc biệt", () => {
  const cats = [{ id: "c2", name: "Đồ uống", sortOrder: 2 }, { id: "c1", name: "Đồ ăn", sortOrder: 1 }];
  const items = [
    { id: "a", categoryId: "c2", name: "Cà phê sữa", price: 29000, sortOrder: 1, active: true },
    { id: "b", categoryId: "c1", name: "Cơm gà, xé", price: 59000, sortOrder: 1, active: false, description: 'gà "ta"' },
  ];
  const lines = menuCsv(items, cats).replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "nhom,ten_mon,gia,dang_ban,ma_mon,mo_ta");
  assert.equal(lines[1], 'Đồ ăn,"Cơm gà, xé",59000,false,,"gà ""ta"""');
  assert.equal(lines[2], "Đồ uống,Cà phê sữa,29000,true,,");
});

test("bỏ món đã xoá hẳn trên máy POS", () => {
  const lines = menuCsv([{ id: "x", deleted: true, active: false }, { id: "a", name: "Trà đá", price: 5000, categoryId: "c" }], [{ id: "c", name: "Trà" }]).trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^Trà,Trà đá,5000/);
});
