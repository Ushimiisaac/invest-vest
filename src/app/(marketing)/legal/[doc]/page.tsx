import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { Section } from "@/components/landing-sections";
import { BRAND, POLICY_VERSION, PRODUCT } from "@/lib/config";
import { naira } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DOCS: Record<string, { title: string; intro: string; sections: [string, string][] }> = {
  terms: {
    title: "Terms of use",
    intro: `These terms govern your use of ${BRAND.name}. They are written to be readable; where they limit our liability, we have tried to say so plainly. Version ${POLICY_VERSION}.`,
    sections: [
      ["Your account", "You must provide accurate details, keep your credentials private and enable two-factor authentication if you hold material balances. You are responsible for activity under your account until you notify us of a compromise."],
      ["Savings plans", "Flex wallet balances are withdrawable on demand within your limits. SafeLock and any plan with a maturity date are subject to the terms shown at the moment of locking, including early-exit penalties. We never change the terms of money already locked."],
      ["Group savings", "Groups are member-organised. We record contributions, membership and decisions transparently, and we require owner approval for group payouts where the group rules say so. We are not a party to the underlying agreement between members."],
      ["Deposits and payouts", "Money is credited only after the payment provider confirms settlement on our servers. A browser redirect or an app 'success' screen is never treated as proof of payment. Failed or reversed payments are reflected in your ledger."],
      ["Fees", "Fees are disclosed before you confirm each transaction. We do not charge for opening a plan, and we do not charge hidden maintenance fees."],
      ["Suspension", "We may suspend an account for fraud, money-laundering red flags, or a valid regulatory order. You keep access to your own funds subject to applicable law, and you can request reinstatement review."],
      ["Liability", "To the extent permitted by law, our liability for the platform is limited to the fees you paid us in the preceding twelve months. Nothing in these terms excludes liability for fraud or wilful misconduct."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    intro: "We collect the minimum needed to operate a regulated money product, we do not sell your data, and we tell you exactly what we keep.",
    sections: [
      ["What we store", "Identity details, contact details, ledger transactions, device and session metadata, consent records with timestamps, and support correspondence. Financial-account identifiers such as BVN or NIN are stored hashed; we retain only the last four digits for support matching."],
      ["Lawful basis", "Performance of a contract for your accounts and transactions; legal obligation for KYC, AML and tax records; legitimate interest for fraud prevention; consent for marketing and for any automatic transfer rule."],
      ["Sharing", "Payment providers, identity-verification providers, custodian and investment partners, and regulators where legally required. Every processor is under a written data-processing agreement."],
      ["Retention", "Transaction and KYC records are kept for five years after account closure to satisfy AML obligations. Marketing preferences are deleted within 30 days of withdrawal."],
      ["Your rights", "Access, correction, deletion of non-mandatory data, objection to processing, and a portable export of your ledger. Ask via the support desk and we will verify identity before releasing anything."],
      ["Security", "bcrypt password hashing, server-side sessions in HttpOnly cookies, TOTP-based second factor, TLS in transit, encrypted storage at rest, least-privilege admin roles and a full internal audit log."],
    ],
  },
  fees: {
    title: "Fees & charges",
    intro: "There is no account fee. Everything that can cost you money is listed here and shown again before you confirm the transaction.",
    sections: [
      ["Deposits", `Card and transfer charges are set by the payment provider and are shown on the checkout screen. Minimum deposit ${naira(PRODUCT.minDepositKobo)}.`],
      ["Payouts", `A ${naira(PRODUCT.withdrawalFeeKobo, { compact: true })} flat or 0.25% transfer fee per payout, whichever is higher, covers bank-rail cost.`],
      ["SafeLock", `No management fee. Early exit before maturity costs ${(PRODUCT.safelockPenaltyBps / 100).toFixed(2)}% of accrued interest. 10% withholding tax applies to interest under Nigerian law.`],
      ["Flex wallet", `${(PRODUCT.floatInterestBps / 100).toFixed(2)}% per annum indicative on eligible balances. No fee to hold or move internally.`],
      ["Investments", `Each product publishes its own entry fee, management fee and exit terms in the register. Simulated products cost nothing because nothing real is bought.`],
      ["Group savings", `No platform fee for groups in this configuration (${(PRODUCT.groupFeeBps / 100).toFixed(2)}%).`],
    ],
  },
  risk: {
    title: "Risk disclosure",
    intro: "Read this before you invest. It is not boilerplate — it is the honest version.",
    sections: [
      ["No guarantees", "Savings interest shown in the app and indicative returns shown for investment products are estimates. They are not promises, they are not locked unless a contract says so, and they may not be achieved."],
      ["Capital at risk", "Investment value can fall as well as rise. You may get back less than you put in, especially for medium and high-risk products."],
      ["Liquidity risk", "Fixed tenor products generally cannot be redeemed early, and early redemption — where permitted — may be discounted or penalised."],
      ["Credit and issuer risk", "A partner or issuer may fail to pay on schedule. We publish the partner name and licence reference for every live product; where a product is simulated, no real issuer exists at all."],
      ["Currency, rate and inflation risk", "Naira-denominated returns can lose purchasing power. Use the calculators, which include an inflation assumption so you can see the real-value line."],
      ["Simulated versus live", "Anything marked simulated exists for testing and education. It never appears mixed with your actual balance and can never be redeemed for real money."],
      ["Not investment advice", `${BRAND.name} provides technology and product information. It is not a licensed investment adviser in this configuration. For personal advice, consult a licensed adviser.`],
    ],
  },
  security: {
    title: "Security centre",
    intro: "How your money and your data are protected — the controls that are actually implemented in this product.",
    sections: [
      ["Authentication", "bcrypt (cost 11) password hashing, account lockout after repeated failures, rate limiting on login, reset and verification endpoints, and server-side sessions with rotating expiry."],
      ["Second factor", "TOTP authenticator apps with single-use recovery codes. Payouts and beneficiary changes require a second factor every time."],
      ["Money movement", "Deposits are only credited after the provider's API confirms settlement. Webhooks are validated with HMAC signatures. Idempotency keys prevent double-credit on retries and duplicate submissions."],
      ["Ledger integrity", "A single write path posts every balance change and its transaction row together, with an atomic conditional update that cannot produce a negative balance."],
      ["Device and session control", "See every active session and device, revoke any of them, and review your login history with IP and outcome."],
      ["Data protection", "Identity identifiers are hashed with a server-side secret. Support staff cannot see raw values. Admin state changes are written to an audit log."],
      ["Incident response", "Report suspicious activity through the support desk with the word 'security' in the subject. We will never ask you for a password, PIN, OTP or full card number."],
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: DOCS[doc]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const content = DOCS[doc];
  if (!content) notFound();
  return (
    <>
      <Section eyebrow={`${BRAND.name} · version ${POLICY_VERSION}`} title={content.title} lead={content.intro}>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            {content.sections.map(([heading, body], i) => (
              <Card key={heading} className="p-5">
                <p className="text-[11.5px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-300">{String(i + 1).padStart(2, "0")}</p>
                <h2 className="mt-1 text-[16px] font-bold">{heading}</h2>
                <p className="mt-2 text-[14px] leading-relaxed muted">{body}</p>
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            <Card className="p-5">
              <p className="text-[13px] font-bold">Other documents</p>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {Object.entries(DOCS).map(([key, value]) => (
                  <li key={key}>
                    <Link href={`/legal/${key}`} className={key === doc ? "font-bold text-brand-600 dark:text-brand-300" : "muted hover:text-[var(--text-strong)]"}>
                      {value.title}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="neutral">{BRAND.rcNumber}</Badge>
                <Badge tone="brand">Version {POLICY_VERSION}</Badge>
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-[13px] font-bold">Questions about this document?</p>
              <p className="mt-1.5 text-[12.5px] muted">Write to {BRAND.supportEmail} or open a support ticket. Keep account numbers out of email.</p>
              <Button href="/support?tab=new" size="sm" className="mt-3 w-full">Contact support</Button>
            </Card>
          </div>
        </div>
      </Section>
    </>
  );
}
