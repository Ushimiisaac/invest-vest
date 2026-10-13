"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* -------------------------------- spinner ------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 animate-spin", className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* -------------------------------- button ------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-[0_10px_24px_-14px_rgb(11_138_101/0.9)] disabled:bg-brand-600/60",
  secondary:
    "bg-ink-900 text-white hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100",
  ghost: "bg-transparent text-[var(--text-strong)] hover:bg-[var(--surface-sunken)]",
  outline: "border bg-[var(--surface-raised)] text-[var(--text-strong)] hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  gold: "bg-gold-400 text-ink-900 hover:bg-gold-300",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl",
  icon: "h-9 w-9 rounded-lg justify-center",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  href,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  href?: string;
} & ComponentProps<"button">) {
  const classes = cn(
    "inline-flex items-center justify-center font-semibold transition-all duration-150 select-none",
    "disabled:cursor-not-allowed disabled:opacity-60 active:translate-y-px",
    variants[variant],
    sizes[size],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes}>
        {loading ? <Spinner /> : null}
        {children}
      </Link>
    );
  }
  return (
    <button className={classes} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/* --------------------------------- card -------------------------------- */

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cn("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHead({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b px-5 py-4", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            {icon}
          </span>
        ) : null}
        <div>
          <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>
          {subtitle ? <p className="mt-1 text-[13px] muted leading-snug">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------- inputs ------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="flex items-center gap-1 text-[13px] font-medium">
          {label}
          {required ? <span className="text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[12px] font-medium text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border bg-[var(--surface-raised)] px-3.5 text-sm placeholder:text-[var(--text-muted)] transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-500/12 disabled:opacity-60";

export function Input({ className, invalid, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(inputBase, "h-11", invalid && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/12", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputBase, "min-h-28 py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(inputBase, "h-11 appearance-none pr-9", className)} {...rest}>
        {children}
      </select>
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-3.5 size-4 muted">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-3", disabled ? "opacity-60" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-brand-600 bg-brand-600" : "border-[var(--border-soft)] bg-[var(--surface-sunken)]",
        )}
      >
        <span
          className={cn(
            "size-4.5 translate-x-0.5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-[1.35rem]",
          )}
        />
      </button>
      {label || description ? (
        <span className="leading-snug">
          {label ? <span className="block text-sm font-medium">{label}</span> : null}
          {description ? <span className="block text-[12px] muted">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-xl border bg-[var(--surface-sunken)] p-1", className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          type="button"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all",
            value === opt.value
              ? "bg-[var(--surface-raised)] shadow-sm"
              : "muted hover:text-[var(--text-strong)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- badges ------------------------------- */

type Tone = "brand" | "neutral" | "gold" | "danger" | "info" | "warning";
const tones: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:border-brand-800",
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-muted)] border-transparent",
  gold: "bg-gold-300/25 text-amber-700 border-amber-200 dark:text-gold-300 dark:border-amber-500/30",
  danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  info: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-900",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold capitalize",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  tone = "brand",
  size = "md",
  className,
}: {
  value: number;
  tone?: "brand" | "gold" | "info";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const pctValue = Math.max(0, Math.min(100, value));
  const bar =
    tone === "gold" ? "bg-gold-400" : tone === "info" ? "bg-sky-500" : "bg-gradient-to-r from-brand-500 to-brand-400";
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]", size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(pctValue)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700", bar)} style={{ width: `${pctValue}%` }} />
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border px-4 py-3 text-[13px] leading-relaxed", tones[tone], className)} role="status">
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="opacity-95">{children}</div>
    </div>
  );
}

/* -------------------------------- modals ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-fade-up relative w-full rounded-t-2xl border bg-[var(--surface-raised)] shadow-[var(--shadow-float)] outline-none sm:rounded-2xl",
          width,
        )}
      >
        <div className="flex items-start justify-between gap-6 border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-[13px] muted">{description}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 muted hover:bg-[var(--surface-sunken)]" aria-label="Close dialog">
            <svg viewBox="0 0 24 24" className="size-4">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------- toasts ------------------------------- */

type Toast = { id: number; tone: "success" | "error" | "info" | "warning"; title: string; body?: string };
const ToastCtx = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 5200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2" aria-live="polite" aria-atomic="true">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "animate-toast pointer-events-auto rounded-xl border bg-[var(--surface-raised)] p-3.5 shadow-[var(--shadow-float)]",
              t.tone === "success" && "border-l-4 border-l-brand-500",
              t.tone === "error" && "border-l-4 border-l-rose-500",
              t.tone === "warning" && "border-l-4 border-l-amber-500",
              t.tone === "info" && "border-l-4 border-l-sky-500",
            )}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body ? <p className="mt-1 text-[12.5px] muted leading-snug">{t.body}</p> : null}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ misc blocks ---------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon ? (
        <span className="grid size-12 place-items-center rounded-2xl bg-[var(--surface-sunken)] text-brand-600 dark:text-brand-300">
          {icon}
        </span>
      ) : null}
      <div>
        <p className="text-[15px] font-semibold">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-sm text-[13px] muted leading-relaxed">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">{eyebrow}</p> : null}
        <h1 className="mt-1 truncate text-[22px] font-bold tracking-tight sm:text-[26px]">{title}</h1>
        {description ? <div className="mt-1.5 max-w-2xl text-[13.5px] muted leading-relaxed">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "brand",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-medium uppercase tracking-wide muted">{label}</p>
        {icon ? <span className={cn("grid size-8 place-items-center rounded-lg border text-[13px]", tones[tone])}>{icon}</span> : null}
      </div>
      <p className="tnum mt-2 text-[22px] font-bold leading-tight tracking-tight sm:text-[25px]">{value}</p>
      {hint ? <p className="mt-1 text-[12px] muted">{hint}</p> : null}
    </Card>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-dashed bg-[var(--surface-sunken)] px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:border-brand-500"
    >
      <span className="min-w-0">
        {label ? <span className="block text-[11px] uppercase tracking-wide muted">{label}</span> : null}
        <span className="block truncate font-mono text-[12.5px]">{value}</span>
      </span>
      <span className="shrink-0 rounded-md bg-[var(--surface-raised)] px-2 py-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

export function Row({ label, value, mono }: { label: ReactNode; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed py-2.5 text-[13.5px] last:border-0">
      <span className="muted">{label}</span>
      <span className={cn("text-right font-semibold", mono && "tnum font-mono text-[12.5px]")}>{value}</span>
    </div>
  );
}

export function useActionPending() {
  const [pending, setPending] = useState(false);
  return { pending, run: async <T,>(fn: () => Promise<T>) => { setPending(true); try { return await fn(); } finally { setPending(false); } } };
}
