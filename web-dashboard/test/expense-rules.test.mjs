import test from "node:test";
import assert from "node:assert/strict";
import { classifyMaterial, groupCodeOrNull, materialCodeFor, normalizeQuantity, normalizeText, reviewItems, ruleIdFor, rulesToLearn, summarizeReview } from "../expense-rules.js";

test("chuẩn hoá bỏ dấu, đ→d, gộp khoảng trắng", () => {
  assert.equal(normalizeText("  Thịt   Ba Chỉ! "), "thit ba chi");
  assert.equal(normalizeText("Đường cát"), "duong cat");
});

test("khớp từ khoá mặc định, cụm dài thắng cụm ngắn", () => {
  assert.equal(classifyMaterial("Thịt heo ba chỉ").group, "THIT");
  assert.equal(classifyMaterial("Cà phê Robusta rang mộc").group, "CAPHE");
  assert.equal(classifyMaterial("Bánh mì que").group, "BANH");
  assert.equal(classifyMaterial("Ống hút giấy").group, "BAOBI");
  assert.equal(classifyMaterial("Nước rửa chén").group, "VESINH");
  assert.equal(classifyMaterial("Đá viên").group, "DA");
});

test("khớp theo từ nguyên vẹn, không khớp một phần của từ khác", () => {
  assert.equal(classifyMaterial("Gạo tẻ").group, "BUN"); // "ga" (gà) không được khớp một phần của "gao"
  assert.equal(classifyMaterial("Gà ta").group, "THIT");
  assert.equal(classifyMaterial("Sữa đặc Ông Thọ").group, "SUA"); // cụm "sữa đặc" dài hơn nên thắng
  assert.equal(classifyMaterial("Mè đen").status, "none");
});

test("từ dễ nhầm sau khi bỏ dấu là mơ hồ: bò/bơ", () => {
  const r = classifyMaterial("Bơ");
  assert.equal(r.status, "ambiguous");
  assert.deepEqual(r.groups.sort(), ["SUA", "THIT"]);
  assert.equal(classifyMaterial("Thịt bò").group, "THIT");
  assert.equal(classifyMaterial("Bơ lạt Tường An").group, "SUA");
});

test("tên không khớp trả none", () => {
  assert.equal(classifyMaterial("Xyz lạ").status, "none");
  assert.equal(classifyMaterial("").status, "none");
});

test("quy tắc đã học theo tên chính xác thắng quy tắc mặc định", () => {
  const learned = [{ name: "Chanh dây", group: "MUT" }];
  assert.equal(classifyMaterial("chanh day", learned).group, "MUT");
  assert.equal(classifyMaterial("chanh day", learned).status, "learned");
  assert.equal(classifyMaterial("Chanh tươi", learned).group, "RAU");
});

test("từ khoá do người dùng thêm thắng mặc định", () => {
  const learned = [{ name: "x", keyword: "quất", group: "MUT" }];
  assert.equal(classifyMaterial("Quất tươi", learned).group, "MUT");
});

test("mã vật tư ổn định: cùng tên cùng mã, khác tên khác mã, định dạng NHOM-12hex", () => {
  const a = materialCodeFor("THIT", "Thịt heo ba chỉ");
  assert.equal(a, materialCodeFor("THIT", "  thit HEO ba chi "));
  assert.notEqual(a, materialCodeFor("THIT", "Thịt heo nạc"));
  assert.match(a, /^THIT-[0-9A-F]{12}$/);
  assert.equal(ruleIdFor("Chanh dây"), ruleIdFor("chanh day"));
});

test("quy đổi đơn vị", () => {
  assert.deepEqual(normalizeQuantity(500, "gam"), { baseQty: 0.5, baseUnit: "kg" });
  assert.deepEqual(normalizeQuantity(250, "ml"), { baseQty: 0.25, baseUnit: "lít" });
  assert.deepEqual(normalizeQuantity(3, "chai"), { baseQty: 3, baseUnit: "chai" });
});

test("rulesToLearn: chỉ học khi khác gợi ý hoặc không có gợi ý rõ ràng", () => {
  const lines = [
    { materialName: "Thịt heo", expenseGroup: "Thịt, gia cầm" },
    { materialName: "Chanh dây", expenseGroup: "Siro, mứt, nguyên liệu bổ sung" },
    { materialName: "Bơ", expenseGroup: "Trứng, sữa, bơ" },
    { materialName: "Mè đen", expenseGroup: "Gia vị, nước dùng" },
    { materialName: "Hàng lạ", expenseGroup: "" },
  ];
  const learn = rulesToLearn(lines, []);
  assert.deepEqual(learn.map((r) => r.name).sort(), ["bo", "chanh day", "me den"]);
  const byName = Object.fromEntries(learn.map((r) => [r.name, r.group]));
  assert.equal(byName["thit heo"], undefined);
  assert.equal(byName["chanh day"], "MUT");
  assert.equal(byName["bo"], "SUA");
  assert.equal(byName["me den"], "GIAVI");
  assert.equal(byName["hang la"], undefined);
});

test("rà soát: ok, mismatch, ambiguous, unmatched, tỷ lệ đúng", () => {
  const receipts = [{ id: "r1", purchaseDate: 1, items: [
    { materialName: "Thịt heo", materialGroup: "Thịt, gia cầm", qty: 1, unitPrice: 100 },
    { materialName: "Cà phê hạt", materialGroup: "Trà, nguyên liệu pha trà", qty: 1, unitPrice: 200 },
    { materialName: "Bơ", materialGroup: "Trứng, sữa, bơ", qty: 1, unitPrice: 50 },
    { materialName: "Mè đen", materialGroup: "Gia vị, nước dùng", qty: 1, unitPrice: 30 },
  ] }, { id: "r2", status: "DELETED", items: [{ materialName: "Thịt", materialGroup: "Rau, củ, quả" }] }];
  const rows = reviewItems(receipts, []);
  assert.deepEqual(rows.map((r) => r.status), ["ok", "mismatch", "ambiguous", "unmatched"]);
  const s = summarizeReview(rows);
  assert.equal(s.total, 4);
  assert.equal(s.ok, 1);
  assert.equal(s.okRate, 0.25);
  assert.equal(summarizeReview([]).okRate, null);
  assert.equal(groupCodeOrNull("Cà phê"), "CAPHE");
  assert.equal(groupCodeOrNull("không có"), null);
});

import { buildSummaryLines, detailGap, detailLevelSummary, detailRequired, isSummaryReceipt, validateSummaryReceipt } from "../expense-rules.js";

test("phiếu tổng: dòng đúng khuôn Android và mang cờ SUMMARY_LINE", () => {
  const lines = buildSummaryLines([{ group: "THIT", amount: 300000 }, { group: "Rau, củ, quả", amount: 200000, note: " chợ " }], (i) => `L${i}`);
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.equal(line.qty, 1);
    assert.equal(line.unit, "lần");
    assert.equal(line.qty * line.unitPrice, line.amount); // Android kiểm tra SL × đơn giá = thành tiền
    assert.equal(line.kind, "SUMMARY_LINE");
    assert.equal(line.materialCode, "");
  }
  assert.equal(lines[0].materialName, "Tổng hợp · Thịt, gia cầm");
  assert.equal(lines[1].note, "chợ");
  assert.equal(lines[0].id, "L0");
});

test("phiếu tổng: kiểm tra hợp lệ", () => {
  assert.equal(validateSummaryReceipt({ purchaseDate: 0, lines: [] }).ok, false);
  assert.equal(validateSummaryReceipt({ purchaseDate: 1, lines: [] }).error, "Phiếu chưa có dòng nào");
  assert.equal(validateSummaryReceipt({ purchaseDate: 1, lines: [{ group: "", amount: 10 }] }).error, "Dòng 1: hãy chọn nhóm");
  assert.equal(validateSummaryReceipt({ purchaseDate: 1, lines: [{ group: "THIT", amount: 0 }] }).ok, false);
  assert.equal(validateSummaryReceipt({ purchaseDate: 1, lines: [{ group: "THIT", amount: 10.5 }] }).ok, false);
  const ok = validateSummaryReceipt({ purchaseDate: 1, lines: [{ group: "THIT", amount: 100 }, { group: "RAU", amount: 50 }] });
  assert.equal(ok.ok, true);
  assert.equal(ok.total, 150);
});

test("nhận diện phiếu tổng và bỏ qua khi rà soát phân loại", () => {
  const summary = { id: "s1", detailLevel: "SUMMARY", total: 500, items: [{ materialName: "Tổng hợp · Thịt, gia cầm", materialGroup: "Rau, củ, quả", kind: "SUMMARY_LINE" }] };
  const legacy = { id: "l1", items: [{ materialName: "Thịt heo", materialGroup: "Thịt, gia cầm" }] };
  assert.equal(isSummaryReceipt(summary), true);
  assert.equal(isSummaryReceipt({ items: [{ kind: "SUMMARY_LINE" }] }), true);
  assert.equal(isSummaryReceipt(legacy), false);
  assert.equal(reviewItems([summary, legacy], []).length, 1);
});

test("chênh lệch khi chi tiết hoá và ngày mốc", () => {
  assert.deepEqual(detailGap(500000, 500000), { difference: 0, matches: true });
  assert.deepEqual(detailGap(500000, 480000), { difference: -20000, matches: false });
  assert.equal(detailRequired(100, null), false);
  assert.equal(detailRequired(100, NaN), false);
  assert.equal(detailRequired(100, 0), false);
  assert.equal(detailRequired(99, 100), false);
  assert.equal(detailRequired(100, 100), true);
});

test("thống kê mức chi tiết", () => {
  const s = detailLevelSummary([
    { id: "a", total: 100, detailLevel: "SUMMARY" },
    { id: "b", total: 40, items: [{ materialName: "x" }] },
    { id: "c", total: 999, status: "DELETED", detailLevel: "SUMMARY" },
  ]);
  assert.deepEqual(s, { total: 2, summaryCount: 1, itemizedCount: 1, summaryAmount: 100, itemizedAmount: 40 });
});
