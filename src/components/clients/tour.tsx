"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Progress } from "@/components/ui";

const STEPS = [
  { href: "/wallet?tab=deposit", title: "Fund the Flex wallet", body: "Open the deposit tab and simulate a ₦25,000 top-up — it credits through the same verified path as production.", cta: "Fund wallet" },
  { href: "/savings?new=1", title: "Create your first goal", body: "Name it, set a target and a cadence. Switch on automation to see scheduled pulls work.", cta: "New goal" },
  { href: "/safelock", title: "Lock money with SafeLock", body: "Pick a term, read the maturity date and the early-exit penalty, then lock — and try an early withdrawal to see the rules apply.", cta: "Open SafeLock" },
  { href: "/wallet?tab=withdraw", title: "Request a payout", body: "Add a beneficiary (10-digit NUBAN resolves an account name), then request a withdrawal with your second factor.", cta: "Withdraw" },
  { href: "/rules", title: "Set a savings rule", body: "Create a salary-day sweep, then press “Run due transfers now” to execute the schedule on the spot.", cta: "Automation" },
  { href: "/invest", title: "Explore the investment desk", body: "Model a treasury bill, watch the application confirm, then redeem it at maturity into your wallet.", cta: "Investments" },
  { href: "/groups", title: "Join or start a group", body: "Create a thrift group and check the transparent ledger, approvals and dispute log.", cta: "Group savings" },
  { href: "/calculate", title: "Use the calculators", body: "Goal completion, compound growth, SafeLock quotes and plan comparison — with inflation-adjusted real value.", cta: "Calculators" },
  { href: "/settings?tab=security", title: "Lock the account down", body: "Enable two-factor, review sessions and devices, then finish identity verification in the next tab.", cta: "Security" },
  { href: "/support", title: "Ask the assistant", body: "Search help articles, read the education library, or open a ticket. It will never ask for a password or OTP.", cta: "Help centre" },
];

export function ProductTour() {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem("ss-tour-done");
    const wantsTour = new URLSearchParams(window.location.search).has("tour");
    if (wantsTour || !seen) setVisible(true);
  }, []);

  if (!visible) return null;
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const dismiss = () => {
    localStorage.setItem("ss-tour-done", "1");
    setVisible(false);
  };

  return (
    <Card className="overflow-hidden border-brand-500/40">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            Guided tour · step {index + 1} of {STEPS.length}
          </p>
          <h2 className="mt-1.5 text-[17px] font-bold">{step.title}</h2>
          <p className="mt-1 text-[13px] leading-relaxed muted">{step.body}</p>
          <Progress value={((index + 1) / STEPS.length) * 100} size="sm" className="mt-3" />
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" href={step.href}>{step.cta}</Button>
          <Button size="sm" variant="outline" onClick={() => setIndex((i) => (i + 1) % STEPS.length)}>
            Next step
          </Button>
          <button onClick={dismiss} className="text-[12.5px] font-semibold muted hover:text-[var(--text-strong)]">
            Skip tour
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-t bg-[var(--surface-sunken)] px-5 py-2.5">
        {STEPS.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            onClick={() => setIndex(i)}
            className={`rounded-lg px-2 py-1 text-[11.5px] font-semibold ${i === index ? "bg-brand-600 text-white" : "muted hover:text-[var(--text-strong)]"}`}
          >
            {s.title}
          </Link>
        ))}
      </div>
    </Card>
  );
}
