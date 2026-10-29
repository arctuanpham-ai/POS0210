// Biểu đồ kết hợp cho một món: cột = số phần bán mỗi ngày (bán lẻ + trong combo), đường = giá bán bình quân thực tế. Trả chuỗi SVG.
const W = 640, H = 260, L = 38, R = 52, T = 18, B = 34;

const niceMax = (v) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const compact = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k`.replace(".", ",") : String(Math.round(v)));

export const itemComboChart = (series, { name = "" } = {}) => {
  const n = series.length;
  if (!n) return "";
  const rawMax = Math.max(1, ...series.map((d) => d.retail + d.inCombo));
  // Trục số phần: bội của 4 (4 khoảng chia đều) để mọi vạch là số nguyên; lớn hơn thì làm tròn đẹp.
  const qtyMax = rawMax <= 40 ? Math.ceil(rawMax / 4) * 4 : niceMax(rawMax);
  const prices = series.filter((d) => d.avgPrice > 0).map((d) => d.avgPrice);
  const pMin0 = prices.length ? Math.min(...prices) : 0, pMax0 = prices.length ? Math.max(...prices) : 1;
  // Đường giá có khoảng đệm để giá không đổi vẫn nằm giữa biểu đồ, không dính mép.
  const pad = Math.max((pMax0 - pMin0) * 0.25, pMax0 * 0.08, 1000);
  const pLo = Math.max(0, Math.floor((pMin0 - pad) / 1000) * 1000), pHi = Math.ceil((pMax0 + pad) / 1000) * 1000;
  const iw = W - L - R, ih = H - T - B;
  const slot = iw / n, bw = Math.max(3, Math.min(26, slot * 0.62));
  const x = (i) => L + slot * i + slot / 2;
  const yq = (v) => T + ih - (v / qtyMax) * ih;
  const yp = (v) => T + ih - ((v - pLo) / Math.max(1, pHi - pLo)) * ih;
  const step = Math.ceil(n / 9);
  const parts = [];
  for (let g = 0; g <= 4; g++) {
    const v = (qtyMax / 4) * g, y = yq(v);
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#eadbc7" stroke-width="1"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#796758">${Math.round(v)}</text>`);
    const pv = pLo + ((pHi - pLo) / 4) * g;
    parts.push(`<text x="${W - R + 6}" y="${yq(v) + 4}" font-size="11" fill="#6e432d">${compact(pv)}</text>`);
  }
  series.forEach((d, i) => {
    const cx = x(i);
    if (!d.available) { parts.push(`<text x="${cx}" y="${T + ih - 4}" text-anchor="middle" font-size="10" fill="#b8a690">–</text>`); }
    else {
      const hr = (d.retail / qtyMax) * ih, hc = (d.inCombo / qtyMax) * ih;
      if (d.retail > 0) parts.push(`<rect x="${cx - bw / 2}" y="${T + ih - hr}" width="${bw}" height="${hr}" rx="2" fill="#c9a98c"><title>${d.dateKey.slice(8)}/${d.dateKey.slice(5, 7)}: ${d.retail} phần bán lẻ</title></rect>`);
      if (d.inCombo > 0) parts.push(`<rect x="${cx - bw / 2}" y="${T + ih - hr - hc}" width="${bw}" height="${hc}" rx="2" fill="#e8d8c5"><title>${d.dateKey.slice(8)}/${d.dateKey.slice(5, 7)}: ${d.inCombo} phần trong combo</title></rect>`);
    }
    if (i % step === 0 || i === n - 1) parts.push(`<text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="11" fill="#796758">${d.dateKey.slice(8)}/${d.dateKey.slice(5, 7)}</text>`);
  });
  // Đường giá nối các ngày có bán; ngày không bán thì đứt đoạn nối bằng nét mảnh.
  const pts = series.map((d, i) => (d.avgPrice > 0 ? [x(i), yp(d.avgPrice), d] : null)).filter(Boolean);
  if (pts.length > 1) parts.push(`<polyline points="${pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")}" fill="none" stroke="#6e432d" stroke-width="2" stroke-linejoin="round"/>`);
  for (const p of pts) parts.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="#fffcf7" stroke="#6e432d" stroke-width="2"><title>${p[2].dateKey.slice(8)}/${p[2].dateKey.slice(5, 7)}: giá bình quân ${new Intl.NumberFormat("vi-VN").format(p[2].avgPrice)}đ</title></circle>`);
  return `<svg class="item-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Số phần bán và giá bán bình quân theo ngày của ${String(name).replace(/[<>&"]/g, "")}" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>
<div class="item-legend"><span><i style="background:#c9a98c"></i>Bán lẻ (trục trái: phần)</span><span><i style="background:#e8d8c5"></i>Trong combo</span><span><i class="line"></i>Giá bình quân (trục phải: đồng)</span></div>`;
};

/** Đường đơn giản theo thời gian (giá vốn theo tuần). points: [{label, value|null}]; null = chưa đủ dữ liệu, đường đứt đoạn. fmt: định dạng số trên trục. */
export const lineChart = (points, { fmt = (v) => String(Math.round(v)), name = "" } = {}) => {
  const vals = points.filter((p) => p.value != null).map((p) => p.value);
  if (vals.length < 2) return "";
  const w = 640, h = 190, l = 52, r = 14, t = 16, b = 30;
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals);
  const pad = Math.max((hi0 - lo0) * 0.3, hi0 * 0.05, 1);
  const lo = Math.max(0, lo0 - pad), hi = hi0 + pad;
  const x = (i) => l + ((w - l - r) * i) / Math.max(1, points.length - 1);
  const y = (v) => t + (h - t - b) * (1 - (v - lo) / Math.max(1e-9, hi - lo));
  const parts = [];
  for (let g = 0; g <= 3; g++) {
    const v = lo + ((hi - lo) / 3) * g;
    parts.push(`<line x1="${l}" x2="${w - r}" y1="${y(v)}" y2="${y(v)}" stroke="#eadbc7"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#796758">${fmt(v)}</text>`);
  }
  let seg = [];
  const flush = () => { if (seg.length > 1) parts.push(`<polyline points="${seg.join(" ")}" fill="none" stroke="#6e432d" stroke-width="2" stroke-linejoin="round"/>`); seg = []; };
  points.forEach((p, i) => {
    if (p.value == null) { flush(); } else seg.push(`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
    parts.push(`<text x="${x(i)}" y="${h - 10}" text-anchor="middle" font-size="11" fill="#796758">${p.label}</text>`);
  });
  flush();
  points.forEach((p, i) => { if (p.value != null) parts.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.4" fill="#fffcf7" stroke="#6e432d" stroke-width="2"><title>${p.label}: ${fmt(p.value)}</title></circle>`); });
  return `<svg class="item-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${String(name).replace(/[<>&"]/g, "")}" preserveAspectRatio="xMidYMid meet">${parts.join("")}</svg>`;
};
