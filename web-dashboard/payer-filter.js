export function normalizePayer(value) {
  return String(value || "").trim();
}

export function matchesPayer(filter, value) {
  const payer = normalizePayer(value);
  if (filter === "ALL") return true;
  if (filter === "UNKNOWN") return !payer;
  return payer === normalizePayer(filter);
}
