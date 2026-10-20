"""Bản giả lập Firebase SDK (trong bộ nhớ) để chạy thử giao diện trang đặt món mà không cần mạng/Firebase thật."""

APP = "export const initializeApp = () => ({});"

AUTH = """
export const getAuth = () => ({});
export const onAuthStateChanged = (auth, cb) => { window.__mockAuthCb = cb; setTimeout(() => cb({ uid: window.__mockUid || 'guest1' }), 0); return () => {}; };
export const signInAnonymously = async () => ({ user: { uid: window.__mockUid || 'guest1' } });
"""

FIRESTORE = """
const ts = (ms) => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), nanoseconds: 0, __ms: ms });
const de = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v && v.__ms !== undefined ? ts(v.__ms) : v]));
const ser = (docs) => JSON.stringify(docs, (k, v) => (v && v.__ms !== undefined ? { __ms: v.__ms } : v));
let saved = {};
try { saved = JSON.parse(sessionStorage.getItem('mockdocs') || '{}'); } catch {}
const S = (window.__mock = window.__mock || { docs: Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, de(v)])), listeners: new Map(), batches: [], denyNext: 0, now: () => Date.now() });
window.__persist = () => sessionStorage.setItem('mockdocs', ser(S.docs));
const resolve = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v && v.__ts ? ts(S.now()) : v]));
const snapDoc = (p) => ({ id: p.split('/').pop(), exists: () => p in S.docs, data: () => S.docs[p] });
const notify = (p) => { for (const l of S.listeners.get(p) || []) l.next(snapDoc(p)); };
window.__mockSet = (p, data) => { S.docs[p] = de(data); window.__persist(); notify(p); };
export const initializeFirestore = () => ({});
export const getFirestore = () => ({});
export const collection = (db, ...segs) => ({ type: 'col', path: segs.join('/') });
export const doc = (db, ...segs) => ({ type: 'doc', path: segs.join('/'), id: segs[segs.length - 1] });
export const getDoc = async (ref) => snapDoc(ref.path);
export const getDocs = async (q) => {
  const out = [];
  for (const p of Object.keys(S.docs)) {
    if (p.startsWith(q.path + '/') && p.slice(q.path.length + 1).indexOf('/') === -1) {
      const d = S.docs[p];
      if (q.filters && !q.filters.every((f) => d[f.f] === f.v)) continue;
      out.push(snapDoc(p));
    }
  }
  return { docs: out, empty: out.length === 0 };
};
export const where = (f, op, v) => ({ kind: 'where', f, op, v });
export const limit = (n) => ({ kind: 'limit', n });
export const query = (col, ...cs) => ({ ...col, filters: cs.filter((c) => c.kind === 'where').map((c) => ({ f: c.f, v: c.v })) });
export const serverTimestamp = () => ({ __ts: true });
export const increment = (n) => ({ __inc: n });
export const setDoc = async (ref, data) => { (window.__stats = window.__stats || []).push({ path: ref.path, data }); };
export const onSnapshot = (ref, next, err) => {
  const set = S.listeners.get(ref.path) || S.listeners.set(ref.path, new Set()).get(ref.path);
  const l = { next }; set.add(l);
  setTimeout(() => next(snapDoc(ref.path)), 0);
  return () => set.delete(l);
};
export const writeBatch = () => {
  const ops = [];
  return {
    set(ref, data) { ops.push([ref.path, data]); },
    update(ref, data) { ops.push([ref.path, data, true]); },
    async commit() {
      if (S.denyNext > 0) { S.denyNext -= 1; const e = new Error('denied'); e.code = 'permission-denied'; throw e; }
      for (const [p, d, merge] of ops) { S.docs[p] = merge ? { ...(S.docs[p] || {}), ...resolve(d) } : resolve(d); S.batches.push([p, S.docs[p]]); window.__persist(); notify(p); }
    },
  };
};
"""
