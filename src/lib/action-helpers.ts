export type ActionState = {
  ok: boolean;
  error?: string;
  field?: string;
  notice?: string;
  data?: Record<string, string | number | boolean | null>;
};

export const IDLE: ActionState = { ok: false };

export function field(v: FormData, key: string): string {
  const raw = v.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

export function num(v: FormData, key: string, fallback = 0): number {
  const raw = field(v, key);
  if (!raw) return fallback;
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export function checked(v: FormData, key: string): boolean {
  return v.get(key) === "on" || v.get(key) === "true" || v.get(key) === "1";
}
