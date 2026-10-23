export function humanSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function dateLabel(seconds: number | null): string {
  return seconds ? new Date(seconds * 1000).toLocaleString() : "—";
}

export function parentPath(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  if (separator === "\\" && /^[A-Za-z]:\\*$/.test(path)) return `${path.slice(0, 2)}\\`;
  const clean = path.replace(/[\\/]+$/, "");
  const index = clean.lastIndexOf(separator);
  if (index < 0) return clean;
  if (index === 0) return separator;
  if (separator === "\\" && index === 2 && clean[1] === ":") return clean.slice(0, 3);
  return clean.slice(0, index);
}

export function readList(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]") as string[]; }
  catch { return []; }
}
