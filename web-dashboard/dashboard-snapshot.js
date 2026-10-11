const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

export const canonicalSnapshotHash = (payload) => stable(payload);
export const shouldMarkSnapshotStale = (lastUpdatedAt, now = Date.now()) => !lastUpdatedAt || now - Number(lastUpdatedAt) > 15 * 60 * 1000;
