// Khối giao diện phụ của trang phân tích món: chuỗi HTML thuần, nhận hàm định dạng từ app.js (h). Không đọc Firebase.
import { lineChart } from "./item-chart.js?v=20261029-13";

const empty = (text) => `<p class="muted empty-state">${text}</p>`;
const card = (title, body, sub = "") => `<section class="item-card"><h4>${title}</h4>${sub ? `<p class="item-sub">${sub}</p>` : ""}${body}</section>`;

/** Báo độ phủ dữ liệu bill để người xem biết số liệu dựa trên bao nhiêu bill. */
export const coverageNote = (info, h) => info
  ? `Dựa trên ${h.num(info.bills.length, 0)} bill có chi tiết món, ${h.shortDay(info.fromKey)} đến ${h.shortDay(info.toKey)}${info.billsNoItems ? ` (${info.billsNoItems} bill chưa đồng bộ món nên chưa tính)` : ""}${info.skippedSplit ? ` (bỏ ${info.skippedSplit} bill tách chung một phiên vì không chia được món cho từng bill)` : ""}.`
  : "";

export const pairsView = (stats, h, minBills = 8) => {
  if (!stats || stats.bills < minBills) return empty(`Món này mới có ${stats ? stats.bills : 0} bill trong kỳ, cần từ ${minBills} bill mới kết luận được món gọi kèm.`);
  const rows = stats.pairs.length
    ? `<table class="sales-table item-tbl"><thead><tr><th>Món gọi kèm</th><th>Cùng bill</th><th>Tỷ lệ</th><th>Độ hay đi cùng</th></tr></thead><tbody>${stats.pairs.map((p) => `<tr><td>${h.esc(p.name)}</td><td>${p.together}</td><td>${h.pct(p.support)}</td><td>${p.lift == null ? "—" : `<span class="lift ${p.lift >= 1.3 ? "up" : p.lift <= 0.8 ? "down" : ""}">${h.num(p.lift)}×</span>`}</td></tr>`).join("")}</tbody></table>`
    : empty("Chưa có món nào đi cùng từ 3 bill trở lên.");
  const kpi = [
    ["Có trong", `${stats.bills} bill`, `${h.pct(stats.share)} số bill`],
    ["Gọi một mình", h.pct(stats.aloneShare), `${stats.alone} bill chỉ có món này`],
    ["Bill có món này", stats.avgBillWith == null ? "—" : h.money(Math.round(stats.avgBillWith)), "trung bình / bill"],
    ["Bill không có món này", stats.avgBillWithout == null ? "—" : h.money(Math.round(stats.avgBillWithout)), "trung bình / bill"],
  ].map(([a, b, c]) => `<article class="metric"><p>${a}</p><strong>${b}</strong><small class="muted">${c}</small></article>`).join("");
  const tip = stats.pairs[0] && stats.pairs[0].lift >= 1.3 ? `<p class="item-tip">Khách gọi món này thường gọi thêm <b>${h.esc(stats.pairs[0].name)}</b> (${h.pct(stats.pairs[0].support)} số bill, hay đi cùng gấp ${h.num(stats.pairs[0].lift)} lần bình thường). Có thể thử ghép combo hai món.</p>` : "";
  return `<section class="summary-grid item-kpis">${kpi}</section>${card("Món gọi kèm", rows, "Độ hay đi cùng = tỷ lệ gọi kèm so với tỷ lệ món đó có mặt trong mọi bill. Trên 1× là hay đi cùng nhau.")}${tip}`;
};

export const hoursView = (stats, h) => {
  if (!stats || stats.bills < 5) return empty("Chưa đủ bill để xem giờ bán của món này (cần từ 5 bill).");
  const total = stats.hours.reduce((t, v) => t + v, 0);
  if (!total) return empty("Chưa có giờ gọi món cho món này.");
  const first = stats.hours.findIndex((v) => v > 0), last = stats.hours.length - 1 - [...stats.hours].reverse().findIndex((v) => v > 0);
  const list = [];
  for (let hr = first; hr <= last; hr++) list.push({ label: `${String(hr).padStart(2, "0")}h`, value: stats.hours[hr], valueText: `${h.num(stats.hours[hr], 0)} phần · ${h.pct(stats.hours[hr] / total)}`, strong: stats.hours[hr] === Math.max(...stats.hours), tip: `${String(hr).padStart(2, "0")}:00 đến ${String(hr).padStart(2, "0")}:59` });
  const peak = stats.hours.indexOf(Math.max(...stats.hours));
  const slots = [["Sáng (trước 11h)", 0, 11], ["Trưa (11h đến 14h)", 11, 14], ["Chiều (14h đến 18h)", 14, 18], ["Tối (từ 18h)", 18, 24]].map(([n, a, b]) => [n, stats.hours.slice(a, b).reduce((t, v) => t + v, 0)]);
  const bestSlot = slots.reduce((a, b) => (b[1] > a[1] ? b : a));
  return `${card("Giờ khách gọi món", `<div class="hbar-chart">${h.hbar(list)}</div>`, "Tính theo giờ gửi món (lần gọi) của từng bill, gồm cả phần nằm trong combo.")}<p class="item-tip">Cao điểm lúc <b>${String(peak).padStart(2, "0")}h</b>. Khung giờ bán nhiều nhất: <b>${bestSlot[0]}</b> (${h.pct(bestSlot[1] / total)} số phần).</p>`;
};

export const channelView = ({ rows, stats, price, cost, note }, h) => {
  if (cost == null) return empty("Chưa tính được lãi theo kênh vì món chưa có công thức hoặc còn thiếu giá vật tư. Bổ sung ở tab Giá vốn.");
  const cell = (r, f) => (r.ok === false && r.margin === undefined ? "—" : f(r));
  const head = rows.map((r) => `<th>${r.label}</th>`).join("");
  const line = (label, f) => `<tr><td>${label}</td>${rows.map((r) => `<td>${cell(r, f)}</td>`).join("")}</tr>`;
  const table = `<table class="sales-table item-tbl"><thead><tr><th></th>${head}</tr></thead><tbody>
    ${line("Giá bán", (r) => h.money(Math.round(r.price)))}
    ${line("App giữ (phí, khuyến mãi)", (r) => (r.key === "STORE" ? "—" : `−${h.money(Math.round(r.fee))} · ${h.pct(r.feeRate)}`))}
    ${line("Còn lại", (r) => h.money(Math.round(r.net)))}
    ${line("Giá vốn", () => h.money(Math.round(cost)))}
    ${line("<b>Lãi gộp / phần</b>", (r) => `<b class="${r.margin < 0 ? "neg" : ""}">${h.money(Math.round(r.margin))}</b>`)}
    ${line("Biên lãi", (r) => h.pct(r.marginPct))}
    ${line("So với tại quán", (r) => (r.key === "STORE" ? "—" : `${r.vsStore >= 0 ? "+" : "−"}${h.money(Math.abs(Math.round(r.vsStore)))}`))}
    ${line("Giá nên đăng trên app", (r) => (r.key === "STORE" ? "—" : r.appPriceToMatch ? h.money(r.appPriceToMatch) : "—"))}
  </tbody></table>`;
  const warns = rows.filter((r) => r.key !== "STORE" && r.ok === false).map((r) => `${r.label}: ${r.reason}`);
  const tips = rows.filter((r) => r.key !== "STORE" && r.ok !== false && r.margin !== undefined).map((r) => `Bán qua ${r.label}, mỗi phần chỉ còn lãi <b>${h.money(Math.round(r.margin))}</b> (biên ${h.pct(r.marginPct)}), ${r.vsStore < 0 ? `thấp hơn tại quán ${h.money(Math.round(-r.vsStore))}` : "không thấp hơn tại quán"}. ${r.appPriceToMatch ? `Muốn lãi bằng tại quán, giá đăng trên app khoảng ${h.money(r.appPriceToMatch)}.` : ""}`);
  const mix = stats && (stats.channels.GRAB.bills || stats.channels.SHOPEE.bills)
    ? `<p class="item-sub">Đơn app nhập qua POS (đời cũ) có món này: Grab ${stats.channels.GRAB.qty} phần, Shopee ${stats.channels.SHOPEE.qty} phần. Đơn app mới chỉ có trong sổ đối soát, không có tên món, nên chưa tách được số phần bán qua app.</p>`
    : `<p class="item-sub">Đơn app trong sổ đối soát chỉ có mã đơn và tiền, không có tên món, nên chưa biết món này bán qua app bao nhiêu phần. Bảng trên cho biết lãi nếu bán qua từng kênh.</p>`;
  return `${card("Lãi một phần theo kênh bán", table, note)}${tips.map((t) => `<p class="item-tip">${t}</p>`).join("")}${warns.length ? `<p class="muted">${warns.join(" · ")}.</p>` : ""}${mix}`;
};

export const costTrendView = ({ trend, price, info, current }, h) => {
  if (!trend) return empty("Món chưa có công thức nên chưa theo dõi được giá vốn.");
  const pts = trend.points.map((p) => ({ label: h.shortDay(h.dateKeyOf(p.at)), value: p.total }));
  const chart = trend.usable ? `<div class="item-chart-wrap">${lineChart(pts, { fmt: (v) => h.compact(Math.round(v)), name: "Giá vốn một phần theo tuần" })}</div>` : empty("Chưa đủ lịch sử phiếu mua để vẽ xu hướng: cần ít nhất hai mốc tuần có đủ giá mọi vật tư trong công thức.");
  let sum = "";
  if (trend.change) {
    const c = trend.change;
    sum = `<p class="item-tip">Giá vốn một phần ${c.pct == null ? "" : c.pct > 0.005 ? "<b>tăng</b>" : c.pct < -0.005 ? "<b>giảm</b>" : "gần như <b>không đổi</b>"}: ${h.money(Math.round(c.from))} (${h.shortDay(h.dateKeyOf(c.fromAt))}) → ${h.money(Math.round(c.to))} (${h.shortDay(h.dateKeyOf(c.toAt))})${c.pct == null ? "" : `, ${c.pct >= 0 ? "+" : ""}${h.pct(c.pct)}`}.${price > 0 ? ` Chiếm ${h.pct(c.to / price)} giá niêm yết.` : ""}</p>`;
  }
  const drivers = trend.drivers.length ? card("Vật tư làm giá vốn đổi nhiều nhất", `<table class="sales-table item-tbl"><thead><tr><th>Vật tư</th><th>Trước</th><th>Nay</th><th>Chênh</th></tr></thead><tbody>${trend.drivers.map((d) => `<tr><td>${h.esc(d.name)}</td><td>${h.money(Math.round(d.from))}</td><td>${h.money(Math.round(d.to))}</td><td class="${d.delta > 0 ? "neg" : "pos"}">${d.delta > 0 ? "+" : "−"}${h.money(Math.abs(Math.round(d.delta)))}</td></tr>`).join("")}</tbody></table>`, "Tiền vật tư trong một phần theo công thức, tại mốc đầu và mốc cuối.") : "";
  const parts = current && current.rows?.length ? card("Cơ cấu giá vốn hiện tại", `<div class="hbar-chart">${h.hbar(current.rows.filter((r) => r.cost != null).sort((a, b) => b.cost - a.cost).map((r, i) => ({ label: r.name, value: r.cost, valueText: `${h.money(Math.round(r.cost))} · ${h.pct(r.cost / current.total)}`, strong: i === 0, tip: r.name })))}</div>`) : "";
  return `${chart}${sum}${drivers}${parts}<p class="muted">Mỗi mốc tuần chỉ dùng phiếu mua đã có đến mốc đó (giá bình quân 30 ngày trước mốc), nên đường này cho thấy giá vốn thật sự đã đổi ra sao khi giá nhập đổi. Phiếu mua được đọc từ đầu tháng trước.</p>`;
};

export const compareView = (A, B, h) => {
  if (!B) return empty("Chọn món thứ hai để so sánh.");
  const cols = [A, B];
  const best = (vals, high = true) => { const ok = vals.map((v, i) => [v, i]).filter(([v]) => v != null && Number.isFinite(v)); if (ok.length < 2 || ok[0][0] === ok[1][0]) return -1; return (high ? ok.reduce((a, b) => (b[0] > a[0] ? b : a)) : ok.reduce((a, b) => (b[0] < a[0] ? b : a)))[1]; };
  const row = (label, vals, fmt, high = true) => { const w = best(vals, high); return `<tr><td>${label}</td>${vals.map((v, i) => `<td class="${w === i ? "win" : ""}">${v == null ? "—" : fmt(v)}</td>`).join("")}</tr>`; };
  const g = (f) => cols.map((c) => { try { return f(c.a); } catch { return null; } });
  const table = `<table class="sales-table item-tbl cmp"><thead><tr><th></th><th>${h.esc(A.name)}</th><th>${h.esc(B.name)}</th></tr></thead><tbody>
    ${row("Số phần bán lẻ", g((a) => a.retail), (v) => h.num(v, 0))}
    ${row("Phần làm ra (cả combo)", g((a) => a.totalMade), (v) => h.num(v, 0))}
    ${row("Doanh thu bán lẻ", g((a) => a.revenue), (v) => h.money(Math.round(v)))}
    ${row("Tỷ trọng doanh thu", g((a) => a.share), (v) => h.pct(v))}
    ${row("Giá bán bình quân", g((a) => a.avgPrice), (v) => h.money(Math.round(v)))}
    ${row("Phần bán mỗi ngày có bán", g((a) => a.perSoldDay), (v) => h.num(v))}
    ${row("Xu hướng", g((a) => a.trend?.pct), (v) => `${v >= 0 ? "+" : ""}${h.pct(v)}`)}
    ${row("Giá vốn / phần", g((a) => a.profit?.unitCost), (v) => h.money(Math.round(v)), false)}
    ${row("% giá vốn", g((a) => a.profit?.costPct), (v) => h.pct(v), false)}
    ${row("Lãi gộp / phần", g((a) => a.profit?.unitMargin), (v) => h.money(Math.round(v)))}
    ${row("Biên lãi", g((a) => a.profit?.marginPct), (v) => h.pct(v))}
    ${row("Tổng lãi gộp bán lẻ", g((a) => a.profit?.grossProfit), (v) => h.money(Math.round(v)))}
    <tr><td>Phân loại</td>${cols.map((c) => `<td>${c.a.quadrant ? h.esc(c.a.quadrant.label) : "—"}</td>`).join("")}</tr>
  </tbody></table>`;
  const sA = A.a, sB = B.a;
  const notes = [];
  if (sA.profit && sB.profit) {
    const hi = sA.profit.unitMargin >= sB.profit.unitMargin ? [A, B] : [B, A];
    notes.push(`Mỗi phần <b>${h.esc(hi[0].name)}</b> lãi hơn ${h.esc(hi[1].name)} ${h.money(Math.abs(Math.round(sA.profit.unitMargin - sB.profit.unitMargin)))}.`);
    if (sA.profit.grossProfit !== sB.profit.grossProfit) { const top = sA.profit.grossProfit > sB.profit.grossProfit ? A : B; notes.push(`Cả kỳ, <b>${h.esc(top.name)}</b> đem về nhiều lãi gộp hơn (${h.money(Math.round(Math.abs(sA.profit.grossProfit - sB.profit.grossProfit)))} chênh lệch).`); }
  } else notes.push("Chưa so sánh được lợi nhuận vì một trong hai món chưa đủ giá vốn.");
  return `<div class="item-chart-wrap cmp-wrap">${table}</div>${notes.map((n) => `<p class="item-tip">${n}</p>`).join("")}<p class="muted">Ô đậm là bên tốt hơn ở từng dòng. Cùng kỳ, cùng cách tính với trang Tổng quan.</p>`;
};
