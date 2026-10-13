/**
 * Pure financial maths. Client-safe: never import the database or node modules here.
 * All money figures are integers in kobo. Rates are annual basis points (bps).
 */

export type Freq = "daily" | "weekly" | "monthly";

export const PERIODS_PER_YEAR: Record<Freq, number> = { daily: 365, weekly: 52, monthly: 12 };

export const FREQ_LABEL: Record<Freq, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
};

export type Point = {
  label: string;
  contributions: number;
  interest: number;
  balance: number;
};

/** Future value of a lump sum + recurring deposits with compounding. */
export function compoundSeries(opts: {
  principalKobo: number;
  contributionKobo: number;
  frequency: Freq;
  annualBps: number;
  months: number;
  inflationBps?: number;
}): { series: Point[]; finalBalance: number; totalContributions: number; totalInterest: number; realValue: number } {
  const { principalKobo, contributionKobo, frequency, annualBps, months } = opts;
  const perYear = PERIODS_PER_YEAR[frequency];
  const cycles = Math.max(1, Math.round((months / 12) * perYear));
  const ratePerCycle = annualBps / 10000 / perYear;
  const monthsPerCycle = 12 / perYear;

  let balance = Math.max(0, Math.round(principalKobo));
  let contributions = balance;
  const series: Point[] = [];
  let step = 0;
  for (let m = 0; m <= months; m += Math.max(1, Math.round(monthsPerCycle))) {
    if (step > 0) {
      const interest = Math.round(balance * ratePerCycle);
      balance += interest;
      contributions += Math.max(0, Math.round(contributionKobo));
      balance += Math.max(0, Math.round(contributionKobo));
    }
    series.push({
      label: `M${m}`,
      contributions,
      interest: balance - contributions,
      balance,
    });
    step += 1;
    if (series.length > 400) break;
  }
  const inflation = (opts.inflationBps ?? 0) / 10000;
  const years = months / 12;
  const realValue = Math.round(balance / Math.pow(1 + inflation, Math.max(0, years)));
  return {
    series,
    finalBalance: balance,
    totalContributions: contributions,
    totalInterest: Math.max(0, balance - contributions),
    realValue,
  };
}

export function simpleInterest(opts: { principalKobo: number; annualBps: number; months: number }) {
  const interest = Math.round((opts.principalKobo * (opts.annualBps / 10000) * opts.months) / 12);
  return { interest, total: opts.principalKobo + interest };
}

/** Locked-savings (SafeLock style) quote — return is indicative, never guaranteed. */
export function lockQuote(opts: {
  amountKobo: number;
  months: number;
  annualBps: number;
  penaltyBps?: number;
}) {
  const gross = Math.round((opts.amountKobo * (opts.annualBps / 10000) * opts.months) / 12);
  const withholding = Math.round(gross * 0.1); // 10% WHT on interest (Nigeria) — indicative
  const net = Math.max(0, gross - withholding);
  const penalty = Math.round((net * (opts.penaltyBps ?? 0)) / 10000);
  return {
    gross,
    withholdingTax: withholding,
    netReturn: net,
    maturityValue: opts.amountKobo + net,
    earlyExitPenalty: penalty,
    effectiveAnnualBps: opts.annualBps,
  };
}

/** How long until a goal completes if contributions continue. */
export function goalProjection(opts: {
  currentKobo: number;
  targetKobo: number;
  contributionKobo: number;
  frequency: Freq;
  annualBps?: number;
  start?: Date;
}) {
  const { currentKobo, targetKobo, contributionKobo, frequency } = opts;
  const annualBps = opts.annualBps ?? 0;
  const start = opts.start ?? new Date();
  if (currentKobo >= targetKobo) {
    return { months: 0, completionDate: start, contributionsNeeded: 0, shortfall: 0, achieved: true };
  }
  if (contributionKobo <= 0) {
    const far = new Date(start);
    far.setFullYear(far.getFullYear() + 50);
    return { months: 600, completionDate: far, contributionsNeeded: 0, shortfall: targetKobo, achieved: false };
  }
  const perYear = PERIODS_PER_YEAR[frequency];
  const ratePerCycle = annualBps / 10000 / perYear;
  let balance = currentKobo;
  let cycles = 0;
  const maxCycles = perYear * 60;
  while (balance < targetKobo && cycles < maxCycles) {
    balance = balance * (1 + ratePerCycle) + contributionKobo;
    cycles += 1;
  }
  const months = Math.ceil((cycles / perYear) * 12);
  const completionDate = new Date(start);
  completionDate.setMonth(completionDate.getMonth() + months);
  const contributionsNeeded = Math.max(0, targetKobo - currentKobo);
  return { months, completionDate, contributionsNeeded, shortfall: contributionsNeeded, achieved: balance >= targetKobo };
}

/** Suggested contribution needed to hit a goal by a date. */
export function requiredContribution(opts: {
  currentKobo: number;
  targetKobo: number;
  months: number;
  frequency: Freq;
  annualBps?: number;
}) {
  const perYear = PERIODS_PER_YEAR[opts.frequency];
  const cycles = Math.max(1, Math.round((opts.months / 12) * perYear));
  const rate = (opts.annualBps ?? 0) / 10000 / perYear;
  const gap = Math.max(0, opts.targetKobo - opts.currentKobo);
  if (rate === 0) return Math.ceil(gap / cycles);
  const fvFactor = (Math.pow(1 + rate, cycles) - 1) / rate;
  return Math.ceil((gap * (1 + rate)) / Math.max(1e-9, fvFactor));
}

export function comparePlans(plans: { name: string; principalKobo: number; contributionKobo: number; frequency: Freq; annualBps: number; months: number }[]) {
  return plans.map((plan) => {
    const res = compoundSeries({
      principalKobo: plan.principalKobo,
      contributionKobo: plan.contributionKobo,
      frequency: plan.frequency,
      annualBps: plan.annualBps,
      months: plan.months,
    });
    return {
      name: plan.name,
      months: plan.months,
      annualBps: plan.annualBps,
      totalContributions: res.totalContributions,
      earnings: res.totalInterest,
      finalBalance: res.finalBalance,
      yieldPct: res.totalContributions > 0 ? (res.totalInterest / res.totalContributions) * 100 : 0,
    };
  });
}

/** Round-up simulator: how much ₦ drops into savings if every purchase rounds to the next ₦100/₦500/₦1000. */
export function roundUpEstimate(opts: { monthlySpendKobo: number; purchases: number; roundToKobo: number }) {
  const averageTopUp = opts.roundToKobo / 2;
  const perMonth = Math.round(averageTopUp * Math.max(0, opts.purchases));
  return { perMonth, perYear: perMonth * 12, perDay: Math.round(perMonth / 30) };
}
