// Gói dữ liệu cho AI phân tích: một file Markdown gồm lời nhắc (prompt) sẵn + từ điển dữ liệu + các bảng CSV.
// Hàm thuần: không đọc Firebase, không có DOM. Thiếu dữ liệu ghi rỗng, KHÔNG ghi 0.

export const AI_SCOPES = [
  ["today", "Hôm nay"],
  ["month", "Tháng này"],
  ["sinceClose", "Từ lần chốt sổ gần nhất"],
  ["3m", "3 tháng gần nhất"],
  ["all", "Toàn bộ từ khai trương"],
];

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (ms) => { const d = new Date(Number(ms)); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const stamp = (ms) => { if (!ms) return ""; const d = new Date(Number(ms)); return `${dayKey(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Mốc thời gian của từng phạm vi. sinceClose: từ đầu tháng ngay sau tháng đã chốt gần nhất. */
export function scopeRange(scope, { now = Date.now(), lastClosedMonth = "", openingMonth = "" } = {}) {
  const d = new Date(now);
  const startOfMonth = (y, m) => new Date(y, m, 1).getTime();
  const label = (AI_SCOPES.find(([k]) => k === scope) || AI_SCOPES[1])[1];
  const opening = /^\d{4}-\d{2}$/.test(openingMonth) ? startOfMonth(Number(openingMonth.slice(0, 4)), Number(openingMonth.slice(5)) - 1) : new Date(2026, 8, 1).getTime();
  let from;
  if (scope === "today") from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  else if (scope === "3m") from = startOfMonth(d.getFullYear(), d.getMonth() - 2);
  else if (scope === "all") from = opening;
  else if (scope === "sinceClose" && /^\d{4}-\d{2}$/.test(lastClosedMonth)) from = startOfMonth(Number(lastClosedMonth.slice(0, 4)), Number(lastClosedMonth.slice(5)));
  else from = startOfMonth(d.getFullYear(), d.getMonth());
  return { id: scope, label: scope === "sinceClose" && !lastClosedMonth ? `${label} (chưa chốt tháng nào: dùng tháng này)` : label, from: Math.max(from, scope === "today" ? from : opening), to: now };
}

const cell = (v) => {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return "";
  const t = String(v);
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
export const csv = (header, rows) => [header.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
const block = (title, note, header, rows) => `### ${title}\n${note ? `${note}\n` : ""}\n\`\`\`csv\n${csv(header, rows)}\n\`\`\`\n`;

/** Lời nhắc mặc định: người dùng chỉ cần gửi file này cho AI. */
export function aiPrompt({ shopName, nowText, scopeLabel, lastCloseText }) {
  return `## HƯỚNG DẪN CHO AI (đọc trước)

Bạn là cố vấn vận hành và chiến lược cho **${shopName}**, một quán cà phê nhỏ ở Việt Nam do 2 cổ đông góp vốn chia đôi lợi nhuận. Dưới đây là dữ liệu xuất từ hệ thống bán hàng POS0210.

- Thời điểm xuất dữ liệu: **${nowText}** (giờ Việt Nam). Coi đây là "hiện tại".
- Phạm vi dữ liệu: **${scopeLabel}**.
- Lần chốt sổ chia tiền cổ đông gần nhất: **${lastCloseText}**.

Hãy phân tích và trả lời bằng tiếng Việt, ngắn gọn, có số liệu cụ thể, theo thứ tự:

1. **Tình hình hiện tại**: doanh thu, số bill, bill trung bình, chi phí, dòng tiền ròng của kỳ; so với cùng kỳ trước nếu có (ngày hôm qua, tuần trước, tháng trước). Tháng đang chạy chưa trọn: hãy quy đổi theo số ngày đã qua trước khi so sánh.
2. **Từ lần chốt sổ gần nhất đến nay**: đã kiếm thêm được bao nhiêu, chi gì lớn, có gì bất thường.
3. **So sánh các tháng**: xu hướng doanh thu, bill, bill trung bình, tỷ lệ nhập hàng / doanh thu, chi vận hành; tháng nào tốt/xấu và vì sao.
3b. **Kênh bán**: tỷ trọng và xu hướng tại quán / đặt món online / GrabFood / ShopeeFood / Xanh Ngon (mục 2c, 3b); app nào đáng giữ sau khi trừ chiết khấu, phí, thuế; tiền app đã về hay còn chờ; khách tại quán so với mang đi.
4. **Phân tích món**: top món theo số lượng và theo doanh thu (mục 4 là tại quán, mục 4b là mọi kênh, tách tại quán / mang đi; app chỉ bán một phần menu nên món vắng mặt trên app là bình thường, đừng coi là lỗi), món tăng/giảm, món bán chậm nên bỏ hoặc đổi, món nên đẩy (kết hợp giá vốn ở mục Menu nếu có: món lãi gộp tốt mà bán ít, món bán chạy mà lãi mỏng).
5. **Phân tích bill**: giờ cao điểm và giờ chết theo ngày trong tuần, thời gian khách ngồi, tỷ lệ tiền mặt / chuyển khoản, trả trước / trả sau, bill hoàn tiền, bill giảm giá.
6. **Chi phí và quỹ**: nhóm chi lớn nhất, chi bất thường, phiếu chờ duyệt, tiến độ hoàn vốn và ước tính thời gian còn lại.
7. **Đề xuất chiến lược kinh doanh** (3–5 việc, xếp theo tác động): giá bán, combo, khung giờ khuyến mãi, món mới, marketing tại chỗ.
8. **Đề xuất điều chỉnh vận hành** (3–5 việc): ca làm theo giờ cao điểm, nhập hàng, kiểm soát hao hụt, quy trình thu ngân.
9. **Cảnh báo dữ liệu**: chỗ nào thiếu, mâu thuẫn hoặc nghi nhập sai, cần quán kiểm tra lại.

Quy tắc đọc dữ liệu:
- Tiền là VND, số nguyên, không có dấu phân cách.
- Ô **trống** nghĩa là **không có dữ liệu**, KHÔNG phải 0. Ngày không có dòng nghĩa là POS chưa gửi số liệu hoặc quán nghỉ.
- Chỉ phiếu chi có trạng thái duyệt \`APPROVED\` mới được tính là chi phí. \`PENDING\`/\`REJECTED\` là chưa tính.
- "Ghi chép đầu tư ban đầu" (trước khai trương) không tính vào chi phí tháng; vốn ban đầu dùng một con số ở mục Vốn & hoàn vốn.
- Dòng tiền ròng tháng = doanh thu − chi vận hành (đã duyệt) − đầu tư bổ sung. Đây là số dùng để chia cổ đông.
- Doanh thu có hai nguồn: **số POS tự cộng** (snapshot, ghi tại một thời điểm, POS ghi lại tối đa ~10 phút/lần) và **từng bill**. Bill đóng SAU lúc POS ghi số tổng chưa nằm trong số tổng: đó là chênh lệch thời điểm, KHÔNG phải mất tiền. Mục "Đối chiếu doanh thu" đã tách sẵn phần này; chỉ cảnh báo lệch tiền với phần "chưa giải thích được" hoặc bill bị đánh dấu cần kiểm tra.
- tam_tinh là tổng giá món trước giảm giá; tong là số khách trả. giam_gia = tam_tinh − tong (giảm theo chương trình khuyến mãi / thẻ thành viên áp ở máy POS).
- **Nhiều kênh bán**: tại quán (POS), đặt món online (web riêng, KHÔNG nằm trong bill POS), GrabFood, ShopeeFood, Xanh Ngon. Doanh thu app food ở mục 2c/3b/5b là **tiền thực nhận về tài khoản** (đã trừ chiết khấu app, phí, quảng cáo ngoài đơn nếu có ghi riêng, thuế VAT/TNCN app giữ hộ); số liệu khấu trừ nằm ở mục 2b. Đơn app có trạng thái cần xem lại (chờ báo cáo hoặc huỷ/hoàn) KHÔNG tính vào doanh thu.
- Cột "dong_tien_rong" ở mục 2 = doanh thu tại quán + app food thực nhận + đơn online đã hoàn thành − chi phí. Các tháng đã chốt sổ cổ đông (mục 8) giữ số tại thời điểm chốt. Tổng doanh thu mọi kênh thực nhận nằm ở cột "tong_thuc_nhan" mục 2c.
- Món trên app có thể đặt tên khác quán; hệ thống đã quy đổi các tên đã biết (ví dụ "Bún gà Tô lớn" = "Bún gà 50"). Nghi ngờ tên lạ thì nêu ở phần cảnh báo dữ liệu.
- Nếu cần thêm dữ liệu để kết luận, hãy nói rõ cần gì.
`;
}

const DICTIONARY = `## TỪ ĐIỂN DỮ LIỆU

- **Theo tháng**: doanh_thu (bill đã thanh toán, tính theo ngày mở bill), so_bill, nhap_hang (phiếu mua nguyên liệu/bao bì đã duyệt), chi_van_hanh_khac (lương, điện, nước, sửa chữa… đã duyệt), dau_tu_bo_sung, dong_tien_rong, ti_le_nhap (nhap_hang / doanh_thu).
- **Theo ngày**: thu (CN, T2…T7), doanh_thu, so_bill, bill_tb, bill_theo_gio (giờ:số bill, theo giờ MỞ bill).
- **Món**: so_luong và doanh_thu của từng món trong phạm vi (doanh thu theo giá món, trước giảm giá bill).
- **Bill**: gio_mo, gio_dong, phut_ngoi, ban, tam_tinh (trước giảm), tong (khách trả), giam_gia, phuong_thuc (CASH tiền mặt / TRANSFER chuyển khoản), luong (prepaid trả trước / postpaid trả sau), hoan_tien.
- **Kênh bán** (2c, 3b, 5b): tai_quan (POS), online (web đặt món, tính khi đã thanh toán), grab / shopee / xanhngon (thực nhận sau chiết khấu, phí, thuế), tong_thuc_nhan = tổng các kênh. 4b: số phần theo kênh, mang_di = online + các app, combo đã tách thành món lẻ.
- **Phiếu chi**: ngay_mua, ma, loai (MATERIAL nhập hàng, MAINTENANCE sửa chữa, ADDITIONAL_INVESTMENT đầu tư bổ sung, OTHER_EXPENSE chi khác…), nguoi_chi, nguon_tien (PERSONAL tiền cá nhân cần hoàn / SHOP_CASH, SHOP_BANK quỹ quán), duyet, hoan_ung (NONE không cần hoàn, PENDING/APPROVED chờ hoàn, PAID đã hoàn, CONFIRMED người mua đã nhận), tong, noi_dung.
- **Thu chi khác**: chi phí nhập ở mục Thu chi khác hoặc trên máy POS (loai theo mã chi phí), và dòng tiền không phải chi phí (góp vốn, rút tiền, hoàn ứng…).
`;

const methodOf = (m) => (m === "CASH" ? "CASH" : m ? "TRANSFER" : "");

/** Ghép toàn bộ gói. Mọi mảng đã lọc sẵn theo phạm vi ở nơi gọi (trừ months/closings: luôn đủ để so sánh). */
export function buildAiPack(input) {
  const {
    now = Date.now(), shopName = "Quán 0210", scope, lastClose = null,
    months = [], daily = [], items = [], bills = [], receipts = [], otherCosts = [], movements = [],
    closings = [], payback = null, menu = [], partners = [], notes = [], reconcile = null, foodDays = [], foodNote = "", channelMonths = [], channelDays = [], channelItems = [], channelOrders = [], channelNote = "",
  } = input;
  const nowText = `${stamp(now)} (${WEEKDAYS[new Date(now).getDay()]})`;
  const lastCloseText = lastClose ? `tháng ${lastClose.monthKey}${lastClose.savedAt ? `, lưu lúc ${stamp(lastClose.savedAt)}` : ""}${Number.isFinite(lastClose.distributable) ? `, có thể chia ${lastClose.distributable}đ` : ""}` : "chưa chốt tháng nào";
  const billRevenue = bills.reduce((t, b) => t + (b.refund ? 0 : Number(b.total || 0)), 0);
  const dayRevenue = daily.reduce((t, d) => t + Number(d.revenue || 0), 0);
  const dayBills = daily.reduce((t, d) => t + Number(d.paidBills || 0), 0);
  const approved = receipts.filter((r) => r.review === "APPROVED");
  const spend = approved.reduce((t, r) => t + Number(r.total || 0), 0) + otherCosts.reduce((t, c) => t + Number(c.amount || 0), 0);
  const parts = [
    `# Dữ liệu ${shopName} cho AI phân tích\n\nXuất lúc ${nowText} · phạm vi: ${scope.label} (${stamp(scope.from)} → ${stamp(scope.to)}) · nguồn: POS0210 web quản lý.\n`,
    aiPrompt({ shopName, nowText, scopeLabel: `${scope.label} (${dayKey(scope.from)} → ${dayKey(scope.to)})`, lastCloseText }),
    DICTIONARY,
    reconcile ? `## 0. ĐỐI CHIẾU DOANH THU ${reconcile.monthKey} (số POS ↔ từng bill)\n\n- Số POS cộng: ${reconcile.snapRevenue ?? "chưa có"}đ · ${reconcile.snapBills ?? ""} bill, ghi lúc ${stamp(reconcile.snapAt)}\n- Cộng từng bill trên cloud: ${reconcile.cloudRevenue}đ · ${reconcile.cloudBills} bill\n- Chênh (bill − POS): ${reconcile.diff ?? ""}đ · ${reconcile.diffBills ?? ""} bill\n- Trong đó do bill đóng sau lúc POS ghi số tổng (bình thường): ${reconcile.explained}đ · ${reconcile.explainedBills} bill\n- **Chưa giải thích được: ${reconcile.unexplained ?? ""}đ · ${reconcile.unexplainedBills ?? ""} bill**\n${reconcile.suspects.length ? `\n\`\`\`csv\n${csv(["so_bill", "tong", "loai", "ly_do"], reconcile.suspects.map((x) => [x.billNo, x.total, x.kind, x.reason]))}\n\`\`\`\n(loai: late = đóng sau lúc POS ghi số; warn = cần kiểm tra; excluded = không tính; info = ghi chú)\n` : ""}` : "",
    `## 1. TÓM TẮT PHẠM VI\n\n- Doanh thu (snapshot ngày): ${daily.length ? `${dayRevenue}đ · ${dayBills} bill · ${daily.length} ngày có dữ liệu` : "không có snapshot ngày"}\n- Doanh thu theo bill đọc được: ${bills.length ? `${billRevenue}đ · ${bills.length} bill (trừ bill đã hoàn)` : "không đọc bill"}\n- Chi phí đã duyệt (phiếu chi + thu chi khác): ${spend}đ · ${approved.length} phiếu duyệt, ${receipts.length - approved.length} phiếu chưa duyệt\n${notes.map((n) => `- ${n}`).join("\n")}\n`,
    block("2. Theo tháng (đủ các tháng để so sánh)", "Tháng cuối là tháng đang chạy (chưa trọn).", ["thang", "doanh_thu", "so_bill", "bill_tb", "nhap_hang", "ti_le_nhap", "chi_van_hanh_khac", "dau_tu_bo_sung", "dong_tien_rong", "da_chot_so", "app_food_doanh_thu", "app_food_hoa_hong_phi", "app_food_thue_giu_ho", "app_food_thuc_nhan", "online_doanh_thu"],
      months.map((m) => [m.monthKey, m.revenue, m.paidBills, m.revenue && m.paidBills ? Math.round(m.revenue / m.paidBills) : null, m.purchases, m.revenue ? (m.purchases / m.revenue).toFixed(3) : null, m.otherOperating, m.investment, m.revenue === null || m.revenue === undefined ? null : m.revenue + (m.foodAccrual || 0) + (m.onlineRevenue || 0) - m.purchases - m.otherOperating - m.investment, m.closed ? "có" : "chưa", m.foodGross ?? null, m.foodFees ?? null, m.foodTax ?? null, m.foodAccrual ?? null, m.onlineRevenue ?? null])),
    block("2b. App food theo ngày bán (sổ đối soát từ file app, độc lập POS)", foodNote || "Doanh thu tính theo ngày bán; thuế VAT/TNCN do app giữ hộ không phải chi phí; tiền về theo ngày giải ngân.", ["ngay", "so_don", "doanh_thu", "hoa_hong", "phi_khac", "thue_giu_ho", "thuc_nhan"], foodDays.map((d) => [d.day, d.orders, d.gross, d.commission, d.other, d.vat + d.pit, d.received])),
    channelMonths.length ? block("2c. Doanh thu mọi kênh theo tháng (thực nhận)", channelNote || "Tại quán = số POS; online = đơn đã thanh toán; app food = tiền thực nhận. Đơn app cần xem lại không tính.", ["thang", "tai_quan", "online", "grab", "shopee", "xanhngon", "tong_thuc_nhan", "don_online", "don_app", "app_chua_ve_tk", "app_can_xem_lai"],
      channelMonths.map((m) => [m.monthKey, m.store, m.online, m.grab, m.shopee, m.xanhngon, m.total, m.onlineCount, m.appCount, m.unpaid, m.review])) : "",
    block("3. Theo ngày", "", ["ngay", "thu", "doanh_thu", "so_bill", "bill_tb", "bill_theo_gio"],
      daily.map((d) => [d.dateKey, WEEKDAYS[new Date(`${d.dateKey}T12:00:00`).getDay()], d.revenue, d.paidBills, d.averageBill, (Array.isArray(d.hourlyBills) ? d.hourlyBills : []).map((n, h) => (n ? `${h}h:${n}` : "")).filter(Boolean).join(" ")])),
    channelDays.length ? block("3b. Theo ngày theo kênh (thực nhận)", "Ô trống ở tai_quan = POS chưa gửi số ngày đó.", ["ngay", "thu", "tai_quan", "online", "grab", "shopee", "xanhngon", "tong_thuc_nhan", "don_tai_quan", "don_online", "don_app"],
      channelDays.map((d) => [d.day, WEEKDAYS[new Date(`${d.day}T12:00:00`).getDay()], d.storeAvailable ? d.STORE.revenue : "", d.ONLINE.revenue, d.GRAB.revenue, d.SHOPEE.revenue, d.XANHNGON.revenue, d.total, d.storeAvailable ? d.STORE.count : "", d.ONLINE.count, d.GRAB.count + d.SHOPEE.count + d.XANHNGON.count])) : "",
    block("4. Món bán tại quán trong phạm vi", "Chỉ tại quán (POS). Mọi kênh xem mục 4b. Sắp theo số lượng.", ["mon", "so_luong", "doanh_thu", "ti_trong_so_luong"],
      (() => { const total = items.reduce((t, i) => t + i.qty, 0); return items.slice().sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).map((i) => [i.name, i.qty, i.revenue, total ? (i.qty / total).toFixed(3) : null]); })()),
    channelItems.length ? block("4b. Món bán theo kênh (số phần)", "Combo đã tách thành món lẻ. mang_di = online + GrabFood + ShopeeFood + Xanh Ngon. App chỉ bán một phần menu: ô 0 trên app không có nghĩa là bán kém.", ["mon", "tai_quan", "online", "grab", "shopee", "xanhngon", "mang_di", "tong"],
      channelItems.map((i) => [i.name, i.by.STORE, i.by.ONLINE, i.by.GRAB, i.by.SHOPEE, i.by.XANHNGON, i.by.ONLINE + i.by.GRAB + i.by.SHOPEE + i.by.XANHNGON, i.qty])) : "",
    bills.length ? block("5. Bill", "Mỗi dòng một bill đã thanh toán (dữ liệu thật).", ["so_bill", "gio_mo", "gio_dong", "phut_ngoi", "ban", "tam_tinh", "tong", "giam_gia", "phuong_thuc", "luong", "hoan_tien", "tien_thanh_toan"],
      bills.slice().sort((a, b) => a.openedAt - b.openedAt).map((b) => [b.billNo, stamp(b.openedAt), stamp(b.closedAt), b.closedAt && b.openedAt ? Math.round((b.closedAt - b.openedAt) / 60000) : null, b.tableName, b.subtotal || null, b.total, b.subtotal ? Math.max(0, b.subtotal - b.total) : null, methodOf(b.method), b.flow, b.refund ? b.refund.amount : "", b.paymentMissing ? "THIEU_THANH_TOAN" : b.amountPaid])) : "### 5. Bill\nKhông đọc bill cho phạm vi này.\n",
    channelOrders.length ? block("5b. Đơn online và app food", "Mỗi dòng một đơn. thuc_nhan trống / trang_thai CAN_XEM_LAI = chưa tính vào doanh thu. khau_tru = chiết khấu + phí + thuế app giữ.", ["gio", "kenh", "ma", "gia_tri_don", "thuc_nhan", "khau_tru", "tien_ve_ngay", "trang_thai", "mon"],
      channelOrders.map((o) => [stamp(o.at), o.channel, o.code, o.value, o.received, o.deduct, o.payoutDay, o.status, o.items])) : "",
    block("6. Phiếu chi", "", ["ngay_mua", "ma", "loai", "nguoi_chi", "nguon_tien", "duyet", "hoan_ung", "tong", "noi_dung"],
      receipts.slice().sort((a, b) => a.at - b.at).map((r) => [stamp(r.at), r.code, r.kind, r.payer, r.fund, r.review, r.reimb, r.total, r.content])),
    block("7a. Chi phí nhập ở Thu chi khác / máy POS", "", ["ngay", "loai", "nguoi_chi", "so_tien", "ghi_chu"], otherCosts.slice().sort((a, b) => a.at - b.at).map((c) => [stamp(c.at), c.category, c.payer, c.amount, [c.supplierName, c.note].filter(Boolean).join(" · ")])),
    block("7b. Dòng tiền khác (không phải chi phí)", "PAYER_REIMBURSEMENT = thủ quỹ hoàn tiền cho người ứng (đã nằm trong phiếu chi, đừng cộng thêm vào chi phí).", ["ngay", "loai", "doi_tuong", "so_tien", "ghi_chu"], movements.slice().sort((a, b) => a.at - b.at).map((m) => [stamp(m.at), m.type, m.who, m.amount, m.note])),
    block("8. Đối soát quỹ & chia cổ đông đã lưu", partners.length ? `Cổ đông: ${partners.map((p) => `${p.name} ${p.percent}%`).join(", ")}.` : "", ["thang", "doanh_thu", "chi_van_hanh", "dau_tu", "dong_tien_rong", "quy_phai_co", "thuc_te", "chenh_lech", "co_the_chia", "luu_luc"],
      closings.slice().sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey))).map((c) => [c.monthKey, c.revenue, c.operating, c.investment, c.net, c.expected, c.actual, c.diff, c.distributable, stamp(c.savedAt)])),
    payback ? `### 9. Vốn & hoàn vốn\n\n- Vốn đầu tư ban đầu: ${payback.set ? `${payback.initial}đ` : "chưa nhập"}\n- Đã thu hồi (luỹ kế dòng tiền ròng): ${payback.recovered}đ\n- Còn phải thu hồi: ${payback.set ? `${payback.remaining}đ` : ""}\n- Tiến độ: ${payback.set ? `${payback.percent.toFixed(1)}%` : ""}\n` : "",
    menu.length ? block("10. Menu & giá vốn", "gia_von theo công thức và giá nhập gần nhất; trống = chưa đủ dữ liệu.", ["mon", "nhom", "gia_ban", "gia_von", "ti_le_gia_von"], menu.map((m) => [m.name, m.category, m.price, m.cost, m.cost && m.price ? (m.cost / m.price).toFixed(3) : null])) : "",
  ];
  return parts.filter(Boolean).join("\n");
}
