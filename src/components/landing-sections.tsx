"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Card, Input, Progress, Segmented, Select } from "@/components/ui";
import { compoundSeries, goalProjection, requiredContribution } from "@/lib/calculators";
import { naira, toKobo } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function GoalSimulator() {
  const [goal, setGoal] = useState("School fees");
  const [target, setTarget] = useState("600000");
  const [monthly, setMonthly] = useState("35000");
  const [years, setYears] = useState(2);
  const [rate, setRate] = useState(6);

  const targetKobo = toKobo(target);
  const monthlyKobo = toKobo(monthly);
  const months = years * 12;

  const projection = useMemo(
    () => goalProjection({ currentKobo: 0, targetKobo, contributionKobo: monthlyKobo, frequency: "monthly", annualBps: rate * 100 }),
    [targetKobo, monthlyKobo, rate],
  );
  const growth = useMemo(
    () => compoundSeries({ principalKobo: 0, contributionKobo: monthlyKobo, frequency: "monthly", annualBps: rate * 100, months }),
    [monthlyKobo, rate, months],
  );
  const needed = useMemo(
    () => requiredContribution({ currentKobo: 0, targetKobo, months, frequency: "monthly", annualBps: rate * 100 }),
    [targetKobo, months, rate],
  );
  const progressPct = Math.min(100, Math.round((growth.finalBalance / Math.max(1, targetKobo)) * 100));

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-[13px] font-medium sm:col-span-2">
            What are you saving for?
            <Select value={goal} onChange={(e) => setGoal(e.target.value)} className="mt-1.5">
              {["School fees", "Rent", "Laptop", "Car", "Travel", "Emergency fund", "Land"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </Select>
          </label>
          <label className="text-[13px] font-medium">
            Target amount (₦)
            <Input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1.5" />
          </label>
          <label className="text-[13px] font-medium">
            Monthly save (₦)
            <Input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="mt-1.5" />
          </label>
          <label className="text-[13px] font-medium">
            Timeline: {years} year{years > 1 ? "s" : ""}
            <input type="range" min={3} max={84} step={3} value={years * 12} onChange={(e) => setYears(Number(e.target.value) / 12)} className="mt-3 w-full" />
          </label>
          <label className="text-[13px] font-medium">
            Assumed annual return
            <Input type="number" value={rate} min={0} max={30} step={0.5} onChange={(e) => setRate(Number(e.target.value))} className="mt-1.5" />
          </label>
        </div>
        <p className="text-[12px] muted">
          Estimates only. Returns are assumed, not promised, and are never mixed with your actual account balance.
        </p>
        <Button href="/register" size="lg" className="w-full sm:w-auto">
          Start this goal free
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">{goal}</p>
          <p className="tnum mt-2 text-3xl font-bold">{naira(growth.finalBalance)}</p>
          <p className="mt-1 text-[13px] opacity-90">
            projected from {naira(monthlyKobo)}/mo · {naira(growth.totalContributions)} saved + {naira(growth.totalInterest)} growth
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-[11.5px] font-semibold opacity-90">
              <span>Against {naira(targetKobo)} target</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} tone="gold" className="mt-1.5 bg-white/25" />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y">
          {[
            { k: "Finish by", v: projection.achieved ? new Date(projection.completionDate).toLocaleDateString("en-NG", { month: "short", year: "numeric" }) : "Extend timeline" },
            { k: "Needed / month", v: naira(needed) },
            { k: "Total deposits", v: naira(growth.totalContributions) },
            { k: "Indicative growth", v: naira(growth.totalInterest) },
          ].map((row) => (
            <div key={row.k} className="p-4">
              <p className="text-[11px] uppercase tracking-wide muted">{row.k}</p>
              <p className="tnum mt-1 text-[15px] font-bold">{row.v}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function FaqAccordion({ items }: { items: { question: string; answer: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y overflow-hidden rounded-2xl border bg-[var(--surface-raised)]">
      {items.map((item, i) => (
        <div key={item.question}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
          >
            <span className="text-[14.5px] font-semibold">{item.question}</span>
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border transition-transform", open === i && "rotate-45 border-brand-500 text-brand-600")}>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            </span>
          </button>
          {open === i ? <p className="px-5 pb-5 text-[13.5px] leading-relaxed muted">{item.answer}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function ProductTabs({ products }: { products: { key: string; label: string; blurb: string; bullets: string[]; footnote?: string }[] }) {
  const [active, setActive] = useState(products[0]?.key ?? "");
  const current = products.find((p) => p.key === active) ?? products[0];
  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {products.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={cn(
              "shrink-0 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-all",
              active === p.key ? "border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200" : "bg-[var(--surface-raised)] muted hover:border-brand-300",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {current ? (
        <Card key={current.key} className="animate-fade-up mt-4 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-bold tracking-tight">{current.label}</h3>
            <Badge tone="brand">Configurable product</Badge>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed muted">{current.blurb}</p>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {current.bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-[13.5px]">
                <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-300" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {b}
              </li>
            ))}
          </ul>
          {current.footnote ? <p className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-3 text-[12px] muted">{current.footnote}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
  center,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20", className)}>
      <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
        {eyebrow ? <p className="text-[11.5px] font-bold uppercase tracking-[0.22em] text-brand-600 dark:text-brand-300">{eyebrow}</p> : null}
        <h2 className="mt-2.5 text-[26px] font-bold leading-[1.15] tracking-tight sm:text-[34px]">{title}</h2>
        {lead ? <p className="mt-3 text-[14.5px] leading-relaxed muted">{lead}</p> : null}
      </div>
      <div className={cn("mt-9", center && "mx-auto max-w-5xl")}>{children}</div>
    </section>
  );
}

export function PhoneMock({ rows }: { rows: { label: string; value: string; pct: number }[] }) {
  return (
    <div className="relative mx-auto w-[280px] rounded-[2.2rem] border-[10px] border-ink-900 bg-ink-900 shadow-[var(--shadow-float)]">
      <div className="overflow-hidden rounded-[1.5rem] bg-[var(--surface)]">
        <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-5 pb-6 pt-5 text-white">
          <div className="flex items-center justify-between text-[11px] opacity-80">
            <span>9:41</span>
            <span>IncreaseVest</span>
          </div>
          <p className="mt-4 text-[11px] uppercase tracking-widest opacity-80">Total savings</p>
          <p className="tnum text-[30px] font-bold leading-tight">₦1,284,500</p>
          <p className="text-[12px] opacity-90">+ ₦48,200 this month</p>
        </div>
        <div className="space-y-2.5 p-4">
          {rows.map((r) => (
            <div key={r.label} className="rounded-xl border bg-[var(--surface-raised)] p-3">
              <div className="flex justify-between text-[12px]">
                <span className="font-semibold">{r.label}</span>
                <span className="tnum muted">{r.value}</span>
              </div>
              <Progress value={r.pct} size="sm" className="mt-2" />
            </div>
          ))}
          <div className="rounded-xl border border-dashed border-brand-500/50 bg-brand-50/60 p-3 text-[12px] font-semibold text-brand-800 dark:bg-brand-900/25 dark:text-brand-200">
            AutoSave moved ₦25,000 today
          </div>
        </div>
      </div>
    </div>
  );
}

export function MiniCalc() {
  const [amount, setAmount] = useState("500000");
  const [months, setMonths] = useState(12);
  const [rate, setRate] = useState(9);
  const kobo = toKobo(amount);
  const gross = Math.round((kobo * (rate / 100) * months) / 12);
  const net = gross - Math.round(gross * 0.1);
  return (
    <Card className="p-5">
      <p className="text-[12px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">SafeLock preview</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-[12px] font-medium">
          Amount (₦)
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
        </label>
        <label className="text-[12px] font-medium">
          Months: {months}
          <input type="range" min={3} max={24} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-3 w-full" />
        </label>
        <label className="text-[12px] font-medium">
          Rate %
          <Input type="number" value={rate} min={0} max={25} step={0.5} onChange={(e) => setRate(Number(e.target.value))} className="mt-1" />
        </label>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { k: "Gross interest", v: naira(gross) },
          { k: "Less 10% WHT", v: naira(gross - net) },
          { k: "Payout at maturity", v: naira(kobo + net) },
        ].map((b) => (
          <div key={b.k} className="rounded-xl bg-[var(--surface-sunken)] p-3">
            <p className="text-[11px] muted">{b.k}</p>
            <p className="tnum mt-1 text-[14px] font-bold">{b.v}</p>
          </div>
        ))}
      </div>
      <Segmented
        className="mt-4"
        value="estimate"
        onChange={() => undefined}
        options={[
          { value: "estimate", label: "Estimate view" },
          { value: "terms", label: "Terms view" },
        ]}
      />
    </Card>
  );
}
