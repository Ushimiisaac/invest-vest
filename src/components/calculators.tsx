"use client";

import { useMemo, useState } from "react";
import { GrowthChart, PlanComparisonBars } from "@/components/charts";
import { Alert, Badge, Button, Card, Input, Progress, Segmented, Select } from "@/components/ui";
import {
  comparePlans,
  compoundSeries,
  goalProjection,
  lockQuote,
  roundUpEstimate,
  simpleInterest,
  type Freq,
} from "@/lib/calculators";
import { addMonths, fmtDate, naira, toKobo } from "@/lib/utils";

type Tab = "goal" | "compound" | "interest" | "safelock" | "invest" | "compare" | "roundup";

const TABS: { value: Tab; label: string }[] = [
  { value: "goal", label: "Goal planner" },
  { value: "compound", label: "Compound growth" },
  { value: "interest", label: "Simple interest" },
  { value: "safelock", label: "SafeLock quote" },
  { value: "invest", label: "Investment return" },
  { value: "compare", label: "Plan comparison" },
  { value: "roundup", label: "Round-ups" },
];

function Num({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="text-[13px] font-medium">
      <span className="flex items-center justify-between">
        {label}
        {suffix ? <span className="text-[11px] muted">{suffix}</span> : null}
      </span>
      <Input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5" />
      {hint ? <span className="mt-1 block text-[11.5px] muted">{hint}</span> : null}
    </label>
  );
}

function Out({ label, value, tone }: { label: string; value: string; tone?: "brand" | "gold" }) {
  return (
    <div className={`rounded-xl border p-3.5 ${tone === "gold" ? "border-amber-300/50 bg-amber-50/60 dark:bg-amber-950/20" : "bg-[var(--surface-sunken)]"}`}>
      <p className="text-[11px] uppercase tracking-wide muted">{label}</p>
      <p className="tnum mt-1 text-[17px] font-bold">{value}</p>
    </div>
  );
}

export function CalculatorSuite({ initialTab = "goal" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);

  // shared inputs
  const [target, setTarget] = useState("1200000");
  const [saved, setSaved] = useState("150000");
  const [per, setPer] = useState("40000");
  const [freq, setFreq] = useState<Freq>("monthly");
  const [months, setMonths] = useState(18);
  const [rate, setRate] = useState(8);
  const [inflation, setInflation] = useState(22);
  const [lockAmount, setLockAmount] = useState("500000");
  const [lockMonths, setLockMonths] = useState(12);
  const [lockRate, setLockRate] = useState(9);
  const [investAmount, setInvestAmount] = useState("1000000");
  const [investBps, setInvestBps] = useState(1350);
  const [investMonths, setInvestMonths] = useState(24);
  const [spend, setSpend] = useState("350000");
  const [purchases, setPurchases] = useState(46);
  const [roundTo, setRoundTo] = useState("500");

  const goal = useMemo(() => {
    const targetKobo = toKobo(target);
    const currentKobo = toKobo(saved);
    const contributionKobo = toKobo(per);
    const proj = goalProjection({ currentKobo, targetKobo, contributionKobo, frequency: freq, annualBps: (rate * 100) });
    const series = compoundSeries({ principalKobo: currentKobo, contributionKobo, frequency: freq, annualBps: rate * 100, months: Math.max(1, proj.months) });
    return { targetKobo, currentKobo, contributionKobo, proj, series };
  }, [target, saved, per, freq, rate, months]);

  const compound = useMemo(
    () =>
      compoundSeries({
        principalKobo: toKobo(saved),
        contributionKobo: toKobo(per),
        frequency: freq,
        annualBps: rate * 100,
        months,
        inflationBps: inflation * 100,
      }),
    [saved, per, freq, rate, months, inflation],
  );

  const interest = useMemo(() => simpleInterest({ principalKobo: toKobo(saved), annualBps: rate * 100, months }), [saved, rate, months]);
  const quote = useMemo(
    () => lockQuote({ amountKobo: toKobo(lockAmount), months: lockMonths, annualBps: lockRate * 100, penaltyBps: 200 }),
    [lockAmount, lockMonths, lockRate],
  );
  const invest = useMemo(() => {
    const principal = toKobo(investAmount);
    const years = investMonths / 12;
    const gross = Math.round(principal * (investBps / 10000) * years);
    const comp = Math.round(principal * (Math.pow(1 + investBps / 10000, years) - 1));
    const fee = Math.round((principal * 50) / 10000);
    return { principal, gross, compounded: comp, fee, net: principal + comp - fee, maturity: addMonths(new Date(), investMonths) };
  }, [investAmount, investBps, investMonths]);

  const roundups = useMemo(
    () => roundUpEstimate({ monthlySpendKobo: toKobo(spend), purchases: Number(purchases) || 0, roundToKobo: toKobo(roundTo) }),
    [spend, purchases, roundTo],
  );

  const comparison = useMemo(
    () =>
      comparePlans([
        { name: "Flex (3%)", principalKobo: toKobo(saved), contributionKobo: toKobo(per), frequency: freq, annualBps: 300, months },
        { name: `SafeLock (${lockRate}%)`, principalKobo: toKobo(saved), contributionKobo: toKobo(per), frequency: freq, annualBps: lockRate * 100, months },
        { name: `Investment (${(investBps / 100).toFixed(1)}%)`, principalKobo: toKobo(saved), contributionKobo: toKobo(per), frequency: freq, annualBps: investBps, months },
      ]),
    [saved, per, freq, months, lockRate, investBps],
  );

  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        options={TABS}
        className="no-scrollbar w-full justify-start overflow-x-auto"
      />

      {tab === "goal" ? (
        <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="space-y-4 p-5">
            <Num label="Goal target" value={target} onChange={setTarget} suffix="₦" />
            <Num label="Already saved" value={saved} onChange={setSaved} suffix="₦" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Num label={`Contribution (${freq})`} value={per} onChange={setPer} suffix="₦" />
              <label className="text-[13px] font-medium">
                Frequency
                <Select value={freq} onChange={(e) => setFreq(e.target.value as Freq)} className="mt-1.5">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </label>
            </div>
            <Num label="Assumed annual return" value={String(rate)} onChange={(v) => setRate(Number(v) || 0)} suffix="%" />
            <div className="grid gap-3 pt-1 sm:grid-cols-3">
              <Out label="Projected total" value={naira(goal.series.finalBalance)} tone="brand" />
              <Out label="Your deposits" value={naira(goal.series.totalContributions)} />
              <Out label="Indicative growth" value={naira(goal.series.totalInterest)} />
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold">Estimated completion</p>
                <p className="mt-1 text-[22px] font-bold tracking-tight">
                  {goal.proj.achieved ? fmtDate(goal.proj.completionDate, "long") : "More than 50 years at this rate"}
                </p>
                <p className="mt-1 text-[12.5px] muted">
                  {goal.proj.months > 0 ? `≈ ${goal.proj.months} months of ${freq} contributions` : "Goal already funded — consider a new target."}
                </p>
              </div>
              <Badge tone={goal.proj.achieved ? "brand" : "warning"}>{goal.proj.achieved ? "On track" : "Needs review"}</Badge>
            </div>
            <Progress value={Math.min(100, ((goal.currentKobo + goal.series.totalContributions) / Math.max(1, goal.targetKobo)) * 100)} className="mt-4" />
            <div className="mt-4 h-[240px]">
              <GrowthChart data={goal.series.series.map((p) => ({ label: p.label, balance: p.balance, contributions: p.contributions }))} />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "compound" ? (
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="space-y-4 p-5">
            <Num label="Starting balance" value={saved} onChange={setSaved} suffix="₦" />
            <Num label="Recurring deposit" value={per} onChange={setPer} suffix="₦" />
            <label className="text-[13px] font-medium">
              Deposit frequency
              <Select value={freq} onChange={(e) => setFreq(e.target.value as Freq)} className="mt-1.5">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </label>
            <label className="text-[13px] font-medium">
              Horizon: {months} months
              <input type="range" min={3} max={120} step={3} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-2.5 w-full" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Num label="Return" value={String(rate)} onChange={(v) => setRate(Number(v) || 0)} suffix="% p.a." />
              <Num label="Inflation" value={String(inflation)} onChange={(v) => setInflation(Number(v) || 0)} suffix="% p.a." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Out label="Balance" value={naira(compound.finalBalance)} tone="brand" />
              <Out label="Today's purchasing power" value={naira(compound.realValue)} tone="gold" />
            </div>
          </Card>
          <Card className="p-5">
            <GrowthChart data={compound.series.map((p) => ({ label: p.label, balance: p.balance, contributions: p.contributions }))} />
            <p className="mt-2 text-[12px] muted">
              Deposits {naira(compound.totalContributions)} · growth {naira(compound.totalInterest)}. Real-value line shows what the balance buys if inflation
              stays at {inflation}% — an assumption, not a forecast.
            </p>
          </Card>
        </div>
      ) : null}

      {tab === "interest" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <Num label="Principal" value={saved} onChange={setSaved} suffix="₦" />
            <div className="grid grid-cols-2 gap-4">
              <Num label="Rate" value={String(rate)} onChange={(v) => setRate(Number(v) || 0)} suffix="% p.a." />
              <Num label="Tenor" value={String(months)} onChange={(v) => setMonths(Math.max(1, Number(v) || 1))} suffix="months" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Out label="Interest earned" value={naira(interest.interest)} />
              <Out label="Total at maturity" value={naira(interest.total)} tone="brand" />
            </div>
          </Card>
          <Alert tone="info" title="Formula">
            Simple interest = principal × annual rate × (months ÷ 12). Interest is not reinvested, so it lags a compound plan over longer tenors. Use the
            compound tab to compare.
          </Alert>
        </div>
      ) : null}

      {tab === "safelock" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <Num label="Amount to lock" value={lockAmount} onChange={setLockAmount} suffix="₦" />
            <label className="text-[13px] font-medium">
              Lock period: {lockMonths} months
              <input type="range" min={3} max={36} step={3} value={lockMonths} onChange={(e) => setLockMonths(Number(e.target.value))} className="mt-2.5 w-full" />
            </label>
            <Num label="Indicative rate" value={String(lockRate)} onChange={(v) => setLockRate(Number(v) || 0)} suffix="% p.a." />
            <div className="grid grid-cols-2 gap-3">
              <Out label="Gross interest" value={naira(quote.gross)} />
              <Out label="Withholding tax (10%)" value={naira(quote.withholdingTax)} />
              <Out label="Net return" value={naira(quote.netReturn)} tone="gold" />
              <Out label="Maturity value" value={naira(quote.maturityValue)} tone="brand" />
            </div>
          </Card>
          <Card className="space-y-3 p-5">
            <p className="text-[13px] font-semibold">Withdrawal rules you should know</p>
            {[
              { k: "Maturity date", v: fmtDate(addMonths(new Date(), lockMonths), "long") },
              { k: "Early-exit penalty", v: naira(quote.earlyExitPenalty) },
              { k: "Funds available before maturity", v: "Principal only, after penalty" },
              { k: "Auto-roll at maturity", v: "Off — you decide" },
            ].map((r) => (
              <div key={r.k} className="flex items-center justify-between border-b border-dashed pb-2.5 text-[13px] last:border-0">
                <span className="muted">{r.k}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
            ))}
            <Alert tone="warning" title="Estimate, not an offer">
              Rates displayed here are user-entered assumptions. Your actual contract rate, fees and penalty terms are the ones shown at the moment you lock funds.
            </Alert>
          </Card>
        </div>
      ) : null}

      {tab === "invest" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <Num label="Investment amount" value={investAmount} onChange={setInvestAmount} suffix="₦" />
            <div className="grid grid-cols-2 gap-4">
              <Num label="Indicative yield" value={String(investBps / 100)} onChange={(v) => setInvestBps(Math.round((Number(v) || 0) * 100))} suffix="% p.a." />
              <Num label="Tenor" value={String(investMonths)} onChange={(v) => setInvestMonths(Math.max(1, Number(v) || 1))} suffix="months" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Out label="Compound growth" value={naira(invest.compounded)} />
              <Out label="Est. entry fee (0.5%)" value={naira(invest.fee)} />
              <Out label="Projected value" value={naira(invest.net)} tone="brand" />
              <Out label="Illustrative maturity" value={fmtDate(invest.maturity)} />
            </div>
          </Card>
          <Card className="p-5">
            <p className="text-[13px] font-semibold">What moves this number</p>
            <ul className="mt-3 space-y-2.5 text-[13px] muted">
              {[
                "Market prices — underlying assets can fall as well as rise.",
                "Fees — management, custody and entry/exit charges reduce net returns.",
                "Taxes — withholding tax applies to most Nigerian fixed-income distributions.",
                "Tenor — early redemption may attract penalties or a discount.",
                "Issuer credit — the risk that the issuer cannot pay as scheduled.",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand-500" />
                  {t}
                </li>
              ))}
            </ul>
            <Button href="/products" variant="outline" className="mt-5 w-full">
              Browse the product register
            </Button>
          </Card>
        </div>
      ) : null}

      {tab === "compare" ? (
        <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <Card className="space-y-4 p-5">
            <Num label="Starting balance" value={saved} onChange={setSaved} suffix="₦" />
            <Num label={`Deposit (${freq})`} value={per} onChange={setPer} suffix="₦" />
            <label className="text-[13px] font-medium">
              Frequency
              <Select value={freq} onChange={(e) => setFreq(e.target.value as Freq)} className="mt-1.5">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </label>
            <label className="text-[13px] font-medium">
              Horizon: {months} months
              <input type="range" min={6} max={120} step={6} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="mt-2.5 w-full" />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <Num label="Lock rate" value={String(lockRate)} onChange={(v) => setLockRate(Number(v) || 0)} suffix="% p.a." />
              <Num label="Invest rate" value={String(investBps / 100)} onChange={(v) => setInvestBps(Math.round((Number(v) || 0) * 100))} suffix="% p.a." />
            </div>
          </Card>
          <Card className="p-5">
            <PlanComparisonBars data={comparison.map((c) => ({ name: c.name, earnings: c.earnings, finalBalance: c.finalBalance }))} />
            <div className="mt-3 grid gap-2">
              {comparison.map((c) => (
                <div key={c.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-[13px]">
                  <span className="font-semibold">{c.name}</span>
                  <span className="tnum muted">
                    deposits {naira(c.totalContributions)} · growth {naira(c.earnings)} · <b className="text-[var(--text-strong)]">{naira(c.finalBalance)}</b>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "roundup" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4 p-5">
            <Num label="Monthly card spend" value={spend} onChange={setSpend} suffix="₦" />
            <div className="grid grid-cols-2 gap-4">
              <Num label="Transactions / month" value={String(purchases)} onChange={(v) => setPurchases(Number(v) || 0)} />
              <Num label="Round up to" value={roundTo} onChange={setRoundTo} suffix="₦" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Out label="Per month" value={naira(roundups.perMonth)} tone="brand" />
              <Out label="Per year" value={naira(roundups.perYear)} />
              <Out label="Per day" value={naira(roundups.perDay)} />
            </div>
          </Card>
          <Alert tone="warning" title="Round-ups need a card-rail partner">
            Real round-up capture requires a payment provider that reports the settled purchase amount back to us. Until that integration is live, this tab is a
            planning estimate and the in-app rule records simulated triggers — clearly labelled in your transaction history.
          </Alert>
        </div>
      ) : null}
    </div>
  );
}
