import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ------------------------------ money ------------------------------- */

export const KOBO = 100;

export function naira(koboValue: number | null | undefined, opts?: { compact?: boolean; sign?: boolean }) {
  const value = (koboValue ?? 0) / KOBO;
  const formatted = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: opts?.compact ? 0 : 2,
    maximumFractionDigits: opts?.compact ? 1 : 2,
    notation: opts?.compact ? "compact" : "standard",
  }).format(value);
  return opts?.sign && value > 0 ? `+${formatted}` : formatted;
}

export function toKobo(input: string | number | null | undefined): number {
  if (typeof input === "number") return Math.round(input * KOBO);
  if (!input) return 0;
  const cleaned = input.replace(/[^\d.]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? Math.round(n * KOBO) : 0;
}

export function bps(value: number): string {
  return `${(value / 100).toFixed(2)}%`;
}

export function pct(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 1000) / 10));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/* ------------------------------ dates ------------------------------- */

export function fmtDate(d: Date | string | null | undefined, style: "short" | "long" = "short") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-NG", {
    day: "2-digit",
    month: style === "short" ? "short" : "long",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${fmtDate(date)} · ${date.toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function fromNow(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, "minute"],
    [3_600_000, "hour"],
    [86_400_000, "day"],
    [604_800_000, "week"],
    [2_592_000_000, "month"],
    [31_536_000_000, "year"],
  ];
  if (abs < 60_000) return "just now";
  let chosen: Intl.RelativeTimeFormatUnit = "minute";
  let value = diff / 60_000;
  const seconds = abs / 1000;
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2592000, "week"],
    [31536000, "month"],
    [Infinity, "year"],
  ];
  for (const [limit, unit] of table) {
    if (seconds < limit) {
      chosen = unit;
      const divisor =
        unit === "second"
          ? 1000
          : unit === "minute"
            ? 60_000
            : unit === "hour"
              ? 3_600_000
              : unit === "day"
                ? 86_400_000
                : unit === "week"
                  ? 604_800_000
                  : unit === "month"
                    ? 2_592_000_000
                    : 31_536_000_000;
      value = Math.round(diff / divisor);
      break;
    }
  }
  void units;
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, chosen);
}

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-NG", { month: "short", year: "2-digit" });
}

/* --------------------------- misc helpers --------------------------- */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomRef(prefix = "SS") {
  const stamp = Date.now().toString(36).toUpperCase();
  let rand = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) rand += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${stamp}-${rand}`;
}

export function randomCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);
}

export function maskAccount(number: string) {
  if (number.length <= 4) return number;
  return `••••${number.slice(-4)}`;
}

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
}

export function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((acc, item) => acc + (pick(item) || 0), 0);
}

export function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function isPhone(value: string) {
  return /^(\+?234|0)[789][01]\d{8}$/.test(value.replace(/[\s-]/g, ""));
}

export function normalisePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.startsWith("234")) return `+${digits}`;
  return digits;
}

export function csv(rows: (string | number)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}
