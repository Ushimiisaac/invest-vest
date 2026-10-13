import Link from "next/link";
import { faqs } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { Badge, Button, Card } from "@/components/ui";
import { FaqAccordion, GoalSimulator, MiniCalc, PhoneMock, ProductTabs, Section } from "@/components/landing-sections";
import { BRAND, FEATURES, LIVE_PAYMENTS, PRODUCT } from "@/lib/config";
import { naira } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PRODUCTS = [
  {
    key: "safelock",
    label: "SafeLock",
    blurb:
      "Lock a lump sum for a fixed term, see the maturity date up front, and understand exactly what an early exit costs before you commit.",
    bullets: [
      `Terms from ${PRODUCT.safelockTiers[0].months} to ${PRODUCT.safelockTiers.at(-1)!.months} months`,
      `Minimum lock ${naira(PRODUCT.safelockMinKobo)}`,
      "Disclosed early-withdrawal penalty and net-of-WHT estimate",
      "Automatic maturity notification and payout to your Flex wallet",
    ],
    footnote:
      "Interest shown is an indicative estimate based on the published rate for your tier. It is not guaranteed and may change for new locks.",
  },
  {
    key: "target",
    label: "Target savings",
    blurb: "Named goals with deadlines, auto-funded contributions, progress bars and projected completion dates you can trust.",
    bullets: [
      "Create unlimited goals: school fees, rent, car, travel, emergency fund",
      "Daily, weekly or monthly contribution cadence",
      "Pause and resume without losing history",
      "Milestone nudges at 25 / 50 / 75 / 100 percent",
    ],
  },
  {
    key: "flex",
    label: "Flex wallet",
    blurb: "A flexible naira wallet you can fund and withdraw from at will, with a full audit trail on every movement.",
    bullets: [
      "Instant deposits by card, transfer or USSD via your payment provider",
      "Withdrawals to verified Nigerian bank accounts",
      "Daily limits that scale once KYC clears",
      "Every movement reconciled server-side, never from the browser",
    ],
  },
  {
    key: "groups",
    label: "Group savings",
    blurb: "Run a transparent ajo/thrift with friends, family or colleagues — with permissions and a dispute trail.",
    bullets: [
      "Invite by join code, cap membership, set per-member amounts",
      "Shared contribution ledger everyone can audit",
      "Owner approval required before group funds move",
      "Built-in dispute log for the awkward conversations",
    ],
  },
  {
    key: "auto",
    label: "Automated savings",
    blurb: "Consent-first automation. Define a rule once and let IncreaseVest move money on schedule from your Flex wallet.",
    bullets: [
      "Fixed amounts on a schedule, percentage-of-income and round-up style rules",
      "Hard daily caps and one-tap kill switch",
      "Missed-contribution alerts with funding shortcuts",
      "Explicit consent record with policy version stamped on each rule",
    ],
  },
  {
    key: "invest",
    label: "Investments",
    blurb: "Browse a product registry with risk tiers, fees, tenors and minimums — then track holdings and maturities in one desk.",
    bullets: [
      "Fixed income, treasury instruments, regulated funds and partner products",
      "Risk categories with plain-language explanations",
      "Application → confirmation → maturity → redemption workflow",
      "Downloadable statements and distribution history",
    ],
    footnote:
      "Only products with an active partner and regulatory approval are subscribable. Everything else is clearly marked simulated or waitlisted.",
  },
];

const PILLARS = [
  {
    icon: "🔒",
    title: "Security engineered in",
    body: "bcrypt password hashing, server-side sessions, HttpOnly cookies, TOTP multi-factor, device and session control, login history, and rate limits on every sensitive path.",
  },
  {
    icon: "🧾",
    title: "Reconcilable by default",
    body: "One ledger write-path for every kobo. Payment success is only ever confirmed by calling the provider from the server — a browser redirect proves nothing.",
  },
  {
    icon: "📈",
    title: "Honest numbers",
    body: "Estimates are labelled as estimates. Simulated figures are never blended with your real balance, and returns are never promised.",
  },
  {
    icon: "⚡",
    title: "Built for Nigeria",
    body: "Naira-first amounts, BVN/NIN-aware KYC, 10-digit account verification, NIP-style transfer flows, and low-data, mobile-first screens.",
  },
];

const STEPS = [
  { n: "01", title: "Create your account", body: "Email + phone with verification, then set a strong password and optional 2FA." },
  { n: "02", title: "Fund the Flex wallet", body: "Card, bank transfer or USSD through Paystack/Flutterwave-style rails, verified server-side." },
  { n: "03", title: "Open plans & rules", body: "Lock money, name a goal, join a group, or automate a contribution schedule." },
  { n: "04", title: "Track, withdraw, repeat", body: "Progress analytics, maturity alerts, receipts and downloadable statements." },
];

export default async function LandingPage() {
  const faqRows = await db
    .select()
    .from(faqs)
    .where(eq(faqs.category, "general"))
    .orderBy(asc(faqs.sortOrder))
    .limit(6)
    .catch(() => [] as { question: string; answer: string }[]);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow pointer-events-none absolute inset-0" />
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-[0.35]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-8 pt-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-16 lg:pt-20">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{LIVE_PAYMENTS ? "Live payment rails" : "Sandbox rails · simulation"}</Badge>
              <Badge tone="gold">Naira first</Badge>
              {FEATURES.investments ? <Badge tone="info">Investment desk open</Badge> : null}
            </div>
            <h1 className="mt-5 text-[38px] font-extrabold leading-[1.05] tracking-tight sm:text-[54px]">
              Save with discipline.
              <br />
              <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-gold-500 bg-clip-text text-transparent">
                Invest with clarity.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed muted">{BRAND.tagline} One account for locked savings, goals, thrift groups, a flexible wallet, and an investment register you can actually audit.</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button href="/api/auth/demo" size="lg" variant="gold">
                ✨ Explore instantly — one-click demo account
              </Button>
              <Button href="/register" size="lg">
                Create free account
              </Button>
              <Button href="/calculate" size="lg" variant="outline">
                Try the calculators
              </Button>
            </div>
            <p className="mt-3 text-[12.5px] muted">
              The demo button opens a pre-funded account with simulated money — no email, no password, no card. Prefer to just look?{" "}
              <Link href="/demo" className="font-semibold text-brand-600 underline dark:text-brand-300">
                Browse the read-only dashboard
              </Link>{" "}
              with no signup at all.
            </p>
            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
              {[
                { k: "Locks from", v: "3 months" },
                { k: "Min. deposit", v: naira(PRODUCT.minDepositKobo) },
                { k: "Hidden fees", v: "None" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-[11px] uppercase tracking-wide muted">{s.k}</dt>
                  <dd className="mt-1 text-[15px] font-bold">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative">
            <PhoneMock
              rows={[
                { label: "School fees", value: "₦420k / ₦600k", pct: 70 },
                { label: "SafeLock · 12m", value: "₦500k", pct: 45 },
                { label: "Lagos rent", value: "₦1.2m / ₦1.8m", pct: 66 },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Products */}
      <Section
        id="products"
        eyebrow="The product suite"
        title="Seven savings and investment engines, one ledger"
        lead="Every product below is a real module of this platform — configurable from the admin desk, and switched off when a feature isn't ready for your market."
      >
        <ProductTabs products={PRODUCTS} />
      </Section>

      {/* Calculators */}
      <Section
        id="calculate"
        eyebrow="Plan before you commit"
        title="Put a number on the plan you keep postponing"
        lead="Adjust the sliders and watch the projection move. Same maths engine that powers the in-app calculators — with the same disclaimers."
      >
        <Card className="p-5 sm:p-7">
          <GoalSimulator />
        </Card>
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Card className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-[17px] font-bold">Full calculator suite</h3>
              <p className="mt-1.5 text-[13.5px] muted leading-relaxed">
                Compound growth, simple interest, goal completion estimates, required-contribution maths, SafeLock quotes and side-by-side plan comparisons.
              </p>
            </div>
            <Button href="/calculate">Open calculators</Button>
          </Card>
          <MiniCalc />
        </div>
      </Section>

      {/* Invest */}
      <Section
        id="invest"
        eyebrow="Investment desk"
        title="A register, not a promise"
        lead="Products carry risk levels, fees, tenors, minimums and regulatory status. Simulated instruments stay labelled simulated, so nobody mistakes a demo yield for a payout."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { t: "Fixed income", d: "Tenured notes and bonds with scheduled distributions.", risk: "Low–medium" },
            { t: "Treasury bills", d: "Government short-term paper, discount-to-face structure.", risk: "Low" },
            { t: "Regulated funds", d: "Partner funds with published fees and SEC-style oversight.", risk: "Medium" },
            { t: "Commercial paper", d: "Corporate short-tenor debt with issuer disclosure.", risk: "Medium–high" },
            { t: "Money market", d: "Liquidity-first sleeve with daily valuation.", risk: "Low" },
            { t: "Simulated sleeves", d: "Education and testing instruments. Never real money.", risk: "Demo only" },
          ].map((p) => (
            <Card key={p.t} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold">{p.t}</h3>
                <Badge tone={p.risk.includes("Demo") ? "neutral" : "info"}>{p.risk}</Badge>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed muted">{p.d}</p>
            </Card>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button href="/products" variant="secondary">
            Browse the product register
          </Button>
          <Button href="/legal/risk" variant="ghost">
            Read the risk disclosure
          </Button>
        </div>
      </Section>

      {/* How it works */}
      <Section id="how" eyebrow="How it works" title="From sign-up to statement in four steps" center>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n}>
              <Card className="h-full p-5">
                <span className="text-[12px] font-black tracking-widest text-brand-600 dark:text-brand-300">{s.n}</span>
                <h3 className="mt-2 text-[15px] font-bold">{s.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed muted">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      {/* Security */}
      <Section
        id="security"
        eyebrow="Trust"
        title="Money software deserves money-grade engineering"
        lead="Controls are not marketing copy — they are implemented in this codebase and visible to admins in the audit trail."
        className="rounded-3xl border bg-[var(--surface-raised)]/60"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.title} className="flex gap-4 rounded-2xl border bg-[var(--surface-raised)] p-5">
              <span className="text-2xl leading-none" aria-hidden>
                {p.icon}
              </span>
              <div>
                <h3 className="text-[15px] font-bold">{p.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed muted">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Testimonials + stats */}
      <Section eyebrow="Why people stay" title="Small habits, boringly consistent, obviously secure">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              q: "I finally have one place for rent, school fees and my thrift contribution — and the maturity alerts mean I never discover a deadline late.",
              n: "Amaka O.",
              r: "Pharmacist, Enugu",
            },
            {
              q: "The group ledger ended the spreadsheet arguments in our family savings circle. Everyone sees the same contribution history.",
              n: "Tunde A.",
              r: "Logistics lead, Lagos",
            },
            {
              q: "Labeling simulated yields as simulated is the reason I trusted it enough to fund it. No salesy promises.",
              n: "Zainab M.",
              r: "Product designer, Abuja",
            },
          ].map((t) => (
            <Card key={t.n} className="flex h-full flex-col justify-between p-6">
              <p className="text-[14px] leading-relaxed">“{t.q}”</p>
              <div className="mt-5 border-t pt-4">
                <p className="text-[13px] font-bold">{t.n}</p>
                <p className="text-[12px] muted">{t.r}</p>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="Questions" title="Straight answers" center>
        <FaqAccordion
          items={
            faqRows.length
              ? faqRows
              : [
                  {
                    question: "Is my money insured?",
                    answer:
                      "IncreaseVest is a technology platform. Funds held in savings plans are custodied through licensed partners; insurance and custody details are published per product and per jurisdiction before you fund anything.",
                  },
                  { question: "Can I withdraw any time?", answer: "Flex wallet funds are withdrawable to a verified bank account within your limits. Locked plans follow their disclosed maturity rules and early-exit penalties, which are shown before you lock." },
                  { question: "How are returns calculated?", answer: "Indicative returns use the published rate for the product, prorated for the tenor, net of withholding tax where applicable. They are estimates, not guarantees." },
                  { question: "What does it cost?", answer: "Opening an account and creating goals is free. Provider fees on card/transfer deposits and bank-transfer payouts are shown at the point of the transaction." },
                  { question: "Do you need a BVN?", answer: "Identity verification uses a BVN or NIN reference; the identifier is hashed, never stored in plain text, and only the last four characters are kept for support." },
                  { question: "Is there a mobile app?", answer: "The web product is fully responsive and installs like an app on phones; the API surface is ready for native clients." },
                ]
          }
        />
      </Section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-ink-900 px-6 py-14 text-center text-white sm:px-14">
          <div className="grid-lines pointer-events-none absolute inset-0 opacity-20" />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
              Your future self is already waiting for the transfer
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[14.5px] opacity-90">
              Open a {BRAND.name} account in under two minutes. No card required to start planning.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button href="/register" size="lg" variant="gold">
                Create free account
              </Button>
              <Link href="/help" className="inline-flex h-12 items-center rounded-xl border border-white/30 px-6 text-[15px] font-semibold hover:bg-white/10">
                Talk to support
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
