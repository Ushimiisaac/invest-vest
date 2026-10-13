import { cn } from "@/lib/utils";

/**
 * Original IncreaseVest mark: a rising stack of coins with an upward arrow.
 * Deliberately not derived from any third-party brand's logo or design assets.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} role="img" aria-label="IncreaseVest logo">
      <defs>
        <linearGradient id="ss-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2fbc87" />
          <stop offset="100%" stopColor="#086c51" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#ss-mark)" />
      <ellipse cx="20" cy="25.5" rx="11" ry="4" fill="#053529" opacity="0.55" />
      <ellipse cx="20" cy="20" rx="11" ry="4" fill="#cbf2e2" opacity="0.9" />
      <ellipse cx="20" cy="14.5" rx="11" ry="4" fill="#fbbf3c" />
      <path d="M14.5 12.6h11M20 9.4v6.4" stroke="#0b1220" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
    </svg>
  );
}

export function Wordmark({ className, name }: { className?: string; name: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-bold tracking-tight", className)}>
      <LogoMark className="size-8 shrink-0" />
      <span className="text-[17px]">{name}</span>
    </span>
  );
}
