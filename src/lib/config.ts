/**
 * IncreaseVest — central, configurable brand + product configuration.
 * Nothing here is hard-coded into components: swap the env vars (or the admin
 * settings panel values persisted in `app_settings`) and the whole product rebrands.
 */

export type FeatureKey =
  | "safelock"
  | "targetSavings"
  | "regularSavings"
  | "flexWallet"
  | "autoSavings"
  | "groupSavings"
  | "investments"
  | "referrals"
  | "kyc"
  | "chatbot"
  | "cards"
  | "roundups";

export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "IncreaseVest",
  tagline:
    process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Increase every naira. Vest in your future.",
  legalName: process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME ?? "IncreaseVest Technologies Ltd",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "hello@increasevest.ng",
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "+234 700 000 0000",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  currency: "NGN",
  currencyMinorUnit: 100,
  rcNumber: process.env.NEXT_PUBLIC_BRAND_RC ?? "RC 0000000",
};

/** Terms/privacy versions — bump to force re-consent across the platform. */
export const POLICY_VERSION = process.env.NEXT_PUBLIC_POLICY_VERSION ?? "2026.01";

export const FEATURES: Record<FeatureKey, boolean> = {
  safelock: true,
  targetSavings: true,
  regularSavings: true,
  flexWallet: true,
  autoSavings: true,
  groupSavings: true,
  investments: true,
  referrals: true,
  kyc: true,
  chatbot: true,
  cards: false,
  roundups: process.env.FEATURE_ROUNDUPS === "1",
};

export const PRODUCT = {
  minDepositKobo: 100_00, // ₦100
  maxDepositKobo: 50_000_000_00,
  minTransferKobo: 100_00,
  dailyWithdrawalLimitKobo: 5_000_000_00, // ₦5,000,000
  withdrawalLimitUnverifiedKobo: 500_000_00, // ₦500,000 until KYC passes
  minGoalKobo: 1_000_00,
  withdrawalFeeKobo: 100_00, // flat N50 transfer fee placeholder (0.25% below)
  withdrawalFeeBps: 25,
  floatInterestBps: 300, // Flex wallet ~3% p.a. indicative
  groupFeeBps: 0,
  safelockTiers: [
    { months: 3, bps: 500 },
    { months: 6, bps: 700 },
    { months: 12, bps: 900 },
    { months: 18, bps: 1000 },
    { months: 24, bps: 1150 },
  ],
  safelockMinKobo: 10_000_00,
  safelockPenaltyBps: 200, // 2% of accrued interest on early exit
  minLockMonthsForInterest: 3,
};

export const KYC = {
  provider: process.env.KYC_PROVIDER ?? "simulated",
  autoVerify: process.env.KYC_AUTO_VERIFY === "1",
};

export const SECURITY = {
  sessionDays: 14,
  rememberDays: 30,
  maxFailedLogins: 6,
  lockoutMinutes: 15,
  loginRateLimit: { limit: 8, windowMs: 60_000 },
  writeRateLimit: { limit: 40, windowMs: 60_000 },
  tokenTtlMinutes: 60,
};

export const PROVIDERS = {
  paystackSecret: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackWebhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET ?? "",
  flutterwaveSecret: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
  flutterwaveWebhookSecret: process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "",
  resendKey: process.env.RESEND_API_KEY ?? "",
  twilioSid: process.env.TWILIO_ACCOUNT_SID ?? "",
};

/** Live money movement is disabled unless a real provider secret exists. */
export const LIVE_PAYMENTS =
  PROVIDERS.paystackSecret.length > 10 || PROVIDERS.flutterwaveSecret.length > 10;

export function paymentModeLabel(): { label: string; live: boolean; hint: string } {
  if (PROVIDERS.paystackSecret.length > 10)
    return { label: "Paystack (live)", live: true, hint: "Card, bank transfer and USSD rails active." };
  if (PROVIDERS.flutterwaveSecret.length > 10)
    return { label: "Flutterwave (live)", live: true, hint: "Card and bank transfer rails active." };
  return {
    label: "Simulation mode",
    live: false,
    hint: "No payment provider secret is configured, so deposits are simulated and never move real money.",
  };
}
