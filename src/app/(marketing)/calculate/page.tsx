import type { Metadata } from "next";
import { Button } from "@/components/ui";
import { Section } from "@/components/landing-sections";
import { CalculatorSuite } from "@/components/calculators";

export const metadata: Metadata = { title: "Financial calculators" };

export default async function CalculatePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const allowed = ["goal", "compound", "interest", "safelock", "invest", "compare", "roundup"] as const;
  const initial = (allowed as readonly string[]).includes(tab ?? "") ? (tab as (typeof allowed)[number]) : "goal";
  return (
    <Section
      eyebrow="Planning tools"
      title="Financial calculators"
      lead="Goal completion, compound growth, simple interest, SafeLock quotes, investment returns, round-ups and side-by-side plan comparison. Every figure here is an estimate built from assumptions you control — never a promise, and never mixed with your real balance."
    >
      <CalculatorSuite initialTab={initial} />
      <div className="mt-8 flex flex-wrap gap-3">
        <Button href="/register" size="lg">Save these numbers to a real plan</Button>
        <Button href="/legal/risk" variant="ghost" size="lg">Read the risk disclosure</Button>
      </div>
    </Section>
  );
}
