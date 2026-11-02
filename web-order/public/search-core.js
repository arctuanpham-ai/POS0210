/**
 * Tìm món trên trang đặt món: không phân biệt hoa thường và dấu ("ca phe" ra "Cà phê"), gõ liền ("banhmi"),
 * nhiều từ (mọi từ phải khớp), từ đồng nghĩa ("cf", "coffee" -> cà phê), ý định ("đồ uống", "đồ ăn"),
 * và sửa lỗi gõ sai 1 ký tự khi không có kết quả đúng.
 */

/** Bỏ dấu, hạ chữ thường, mọi ký tự không phải chữ-số thành một khoảng trắng. */
export const fold = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * keys: người dùng gõ gì (đã bỏ dấu); match: tìm gì trong tên món / mô tả / nhóm.
 * Từ khoá khớp theo ĐẦU TỪ (không khớp giữa từ) nên "ga" không dính "nga", "bo" không dính "bơ".
 */
const GROUPS = [
  { keys: ["ca phe", "cafe", "caphe", "cf", "cphe", "coffee", "cofee"], match: ["ca phe", "cafe", "coldbrew", "cold brew", "americano", "bac xiu"] },
  { keys: ["tra", "tea", "chai tra"], match: ["tra"] },
  { keys: ["nuoc ep", "ep", "juice", "nuoc trai cay", "sinh to"], match: ["nuoc ep", "sinh to"] },
  { keys: ["banh mi", "banhmi", "bmi", "sandwich", "sandwiches"], match: ["banh mi"] },
  { keys: ["com", "rice", "com trua", "an trua", "trua"], match: ["com"] },
  { keys: ["bun", "banh da", "pho", "mi nuoc", "noodle", "noodles"], match: ["bun", "banh da"] },
  { keys: ["bit tet", "bittet", "beefsteak", "steak", "bifteck", "beef steak"], match: ["bit tet", "beefsteak"] },
  { keys: ["sua chua", "yaourt", "yogurt", "yoghurt"], match: ["sua chua"] },
  { keys: ["cacao", "ca cao", "cocoa", "chocolate", "socola", "so co la"], match: ["cacao"] },
  { keys: ["matcha", "maccha", "tra xanh"], match: ["matcha"] },
  { keys: ["cheese", "pho mai", "phomai", "cheez", "kem cheese", "kem man"], match: ["cheese"] },
  { keys: ["khoai", "khoai tay", "french fries", "fries", "khoai chien"], match: ["khoai"] },
  { keys: ["hat", "hat dua", "hat huong duong", "snack", "an vat", "do an vat"], match: ["hat", "an vat"] },
  { keys: ["dua hau", "duahau", "watermelon"], match: ["dua hau"] },
  { keys: ["cam", "orange"], match: ["cam"] },
  { keys: ["chanh", "lemon", "lime"], match: ["chanh"] },
  { keys: ["nha dam", "aloe"], match: ["nha dam"] },
  { keys: ["ga", "chicken", "ga chien", "ga ran"], match: ["ga"] },
  { keys: ["bo", "bo sot tieu", "beef"], match: ["bo sot", "bo"] },
  { keys: ["trung", "egg", "op la"], match: ["trung", "op la"] },
  // Ý định: người dùng chưa biết gọi gì, chỉ biết muốn uống hay ăn.
  { keys: ["uong", "do uong", "nuoc uong", "nuoc", "khat", "uong gi", "thirsty", "drink", "drinks"], match: ["ca phe", "cafe", "tra", "nuoc ep", "sua chua", "cacao", "matcha", "coldbrew", "cold brew", "americano", "bac xiu", "sinh to", "do uong"] },
  { keys: ["an", "do an", "doi", "an gi", "an sang", "sang", "breakfast", "food"], match: ["an sang", "banh mi", "bun", "banh da", "com", "bit tet", "khoai", "trung", "an vat", "do an"] },
  { keys: ["combo", "set", "uu dai", "khuyen mai"], match: ["combo"] },
];

/** Gợi ý từ khoá hiện sẵn khi ô tìm trống. Chỉ hiện từ khoá còn ra kết quả trong menu hiện tại. */
export const KEYWORD_SUGGESTIONS = ["cà phê", "trà", "nước ép", "bánh mì", "cơm", "bún", "đồ uống", "đồ ăn", "cheese", "matcha", "combo"];

const startsWord = (haystack, needle) => needle !== "" && ` ${haystack}`.includes(` ${needle}`);
const words = (folded) => (folded ? folded.split(" ") : []);

/** Nạp sẵn các trường đã bỏ dấu của một món để không phải tính lại mỗi lần gõ. */
export function indexItem(item, categoryName = "") {
  const parts = Array.isArray(item?.parts) ? item.parts.map((p) => p?.name || "").join(" ") : "";
  const name = fold(item?.name);
  const rest = fold(`${item?.description || ""} ${parts}`);
  const category = fold(categoryName);
  return { item, name, rest, category, all: `${name} ${rest} ${category}`.trim() };
}

/** Một từ gõ vào -> danh sách cách tìm (chính nó + từ đồng nghĩa). */
function alternativesFor(token, wholeQuery) {
  const alts = new Set([token]);
  for (const g of GROUPS) {
    if (g.keys.includes(token) || (wholeQuery && g.keys.includes(wholeQuery))) for (const m of g.match) alts.add(m);
  }
  return [...alts];
}

const compact = (folded) => folded.replace(/ /g, "");

/** Điểm của một món với truy vấn; 0 = không khớp. Mọi từ phải khớp (AND), mỗi từ khớp một trong các cách tìm (OR). */
function scoreEntry(entry, tokens, wholeQuery) {
  let total = 0;
  const allCompact = compact(entry.all);
  for (const token of tokens) {
    let best = 0;
    for (const alt of alternativesFor(token, tokens.length === 1 ? "" : wholeQuery)) {
      const isOriginal = alt === token;
      if (startsWord(entry.name, alt)) best = Math.max(best, isOriginal ? 6 : 4);
      else if (startsWord(entry.category, alt)) best = Math.max(best, isOriginal ? 3 : 2);
      else if (startsWord(entry.rest, alt)) best = Math.max(best, isOriginal ? 2 : 1);
      else if (isOriginal && token.length >= 3 && compact(entry.name).includes(token)) best = Math.max(best, 3);
    }
    // Gõ liền không cách: "banhmitrung" -> bánh mì trứng.
    if (!best && tokens.length === 1 && token.length >= 4 && allCompact.includes(token)) best = 2;
    if (!best) return 0;
    total += best;
  }
  // Tên món khớp đúng nguyên cụm thì lên đầu.
  if (entry.name === wholeQuery) total += 10;
  else if (entry.name.startsWith(wholeQuery)) total += 3;
  return total;
}

/** Khoảng cách sửa (Levenshtein) giới hạn: dừng sớm khi vượt max. */
export function editDistance(a, b, max = 1) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Từ gõ sai 1 ký tự so với đầu từ nào đó của món ("capuchino" chịu, "tra xnah" -> "tra xanh"). */
function fuzzyEntry(entry, tokens) {
  const pool = words(entry.all);
  return tokens.every((token) => {
    if (pool.some((w) => w.startsWith(token))) return true;
    if (token.length < 3) return false;
    // Từ 3 ký tự: so với cả từ; từ 4 ký tự trở lên: so cả với phần đầu từ (gõ dở và sai một ký tự).
    return pool.some((w) => editDistance(token, w, 1) <= 1 || (token.length >= 4 && editDistance(token, w.slice(0, token.length), 1) <= 1));
  });
}

/**
 * @param entries kết quả của indexItem cho từng món
 * @returns {{items:Array, fuzzy:boolean, tokens:string[]}} items theo độ khớp giảm dần, cùng điểm thì giữ thứ tự menu
 */
export function searchEntries(entries, query) {
  const wholeQuery = fold(query);
  const tokens = words(wholeQuery);
  if (!tokens.length) return { items: entries.map((e) => e.item), fuzzy: false, tokens };
  const scored = entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry, tokens, wholeQuery) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (scored.length) return { items: scored.map((x) => x.entry.item), fuzzy: false, tokens };
  const near = entries.filter((entry) => fuzzyEntry(entry, tokens)).map((e) => e.item);
  return { items: near, fuzzy: near.length > 0, tokens };
}

/**
 * Gợi ý khi đang gõ: tên món khớp (tối đa `limit`) và tên nhóm khớp.
 * @returns {Array<{type:"dish"|"category", text:string}>}
 */
export function suggestions(entries, categoryNames, query, limit = 6) {
  const wholeQuery = fold(query);
  if (!wholeQuery) return [];
  const { items } = searchEntries(entries, query);
  const out = [];
  const seen = new Set();
  for (const name of categoryNames) {
    const f = fold(name);
    if (f && startsWord(f, wholeQuery) && !seen.has(f)) { seen.add(f); out.push({ type: "category", text: String(name).trim() }); }
  }
  for (const item of items) {
    const text = String(item.name || "").trim();
    const f = fold(text);
    if (!f || seen.has(f)) continue;
    seen.add(f);
    out.push({ type: "dish", text });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Từ khoá gợi ý sẵn mà menu hiện tại còn ra ít nhất một món. */
export const usableKeywords = (entries, max = 8) =>
  KEYWORD_SUGGESTIONS.filter((kw) => {
    const r = searchEntries(entries, kw);
    return r.items.length > 0 && !r.fuzzy;
  }).slice(0, max);
