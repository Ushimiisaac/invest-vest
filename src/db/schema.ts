import { randomUUID } from "node:crypto";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* IncreaseVest data model                                               */
/*                                                                     */
/* All monetary values are stored as integers in KOBO (1 NGN = 100     */
/* kobo) to eliminate floating point drift. Rates are stored as        */
/* basis points (bps): 100 bps = 1.00%.                                */
/* ------------------------------------------------------------------ */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const kobo = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

const ts = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: false }).notNull().defaultNow();

/* ---------------------------- identity ---------------------------- */

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: text("role").notNull().default("user"), // user | admin | support
    status: text("status").notNull().default("pending"), // pending|active|suspended|closed
    suspensionReason: text("suspension_reason"),
    emailVerified: boolean("email_verified").notNull().default(false),
    phoneVerified: boolean("phone_verified").notNull().default(false),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    totpSecret: text("totp_secret"),
    recoveryCodes: jsonb("recoveryCodes"), // string[]
    kycStatus: text("kyc_status").notNull().default("unverified"), // unverified|pending|verified|rejected
    referralCode: text("referral_code"),
    referredBy: text("referred_by"),
    avatarColor: text("avatar_color").notNull().default("#0f9d76"),
    failedLogins: bigint("failed_logins", { mode: "number" }).notNull().default(0),
    lockedUntil: timestamp("locked_until", { mode: "date", withTimezone: false }),
    lastLoginAt: ts("last_login_at"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    uniqueIndex("users_referral_code_idx").on(t.referralCode),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false }).notNull(),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("sessions_token_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // verify_email | verify_phone | reset_password | magic
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: false }).notNull(),
    usedAt: timestamp("used_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("auth_tokens_hash_idx").on(t.tokenHash),
  ],
);

export const loginHistory = pgTable(
  "login_history",
  {
    id: id(),
    userId: text("user_id"),
    email: text("email"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    outcome: text("outcome").notNull(), // success | bad_password | unknown_user | mfa_required | locked | mfa_failed
    createdAt: ts("created_at"),
  },
  (t) => [
    index("login_history_user_idx").on(t.userId),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    lastSeenAt: ts("last_seen_at"),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: false }),
  },
  (t) => [
    index("devices_user_idx").on(t.userId),
  ],
);

export const consents = pgTable(
  "consents",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // terms | privacy | data_processing | auto_debit | investments
    version: text("version").notNull(),
    granted: boolean("granted").notNull().default(true),
    ip: text("ip"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("consents_user_idx").on(t.userId),
  ],
);

export const kycRecords = pgTable(
  "kyc_records",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("nigeria_identity"),
    legalName: text("legal_name"),
    dob: text("dob"),
    idType: text("id_type"), // bvn | nin | pasport | drivers
    idNumberHash: text("id_number_hash"),
    idNumberLast4: text("id_number_last4"),
    status: text("status").notNull().default("pending"), // pending|verified|rejected
    provider: text("provider").notNull().default("simulated"),
    providerRef: text("provider_ref"),
    riskFlags: jsonb("riskFlags"),
    rejectionReason: text("rejection_reason"),
    submittedAt: ts("submitted_at"),
    reviewedAt: timestamp("reviewed_at", { mode: "date", withTimezone: false }),
    reviewedBy: text("reviewed_by"),
  },
  (t) => [
    uniqueIndex("kyc_records_user_idx").on(t.userId),
  ],
);

/* ----------------------------- money ------------------------------ */

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // flex | target | regular | safelock | group
    name: text("name").notNull(),
    icon: text("icon").notNull().default("piggy"),
    color: text("color").notNull().default("#0f9d76"),
    purpose: text("purpose"),
    balanceKobo: kobo("balance_kobo"),
    targetKobo: kobo("target_kobo"),
    contributionKobo: kobo("contribution_kobo"),
    frequency: text("frequency"), // daily | weekly | monthly
    status: text("status").notNull().default("active"), // active|paused|completed|matured|closed
    autoDebit: boolean("auto_debit").notNull().default(false),
    interestBps: bigint("interest_bps", { mode: "number" }).notNull().default(0),
    lockMonths: bigint("lock_months", { mode: "number" }).notNull().default(0),
    penaltyBps: bigint("penalty_bps", { mode: "number" }).notNull().default(0),
    startDate: timestamp("start_date", { mode: "date", withTimezone: false }),
    maturityDate: timestamp("maturity_date", { mode: "date", withTimezone: false }),
    nextDueAt: timestamp("next_due_at", { mode: "date", withTimezone: false }),
    lastTopUpAt: timestamp("last_top_up_at", { mode: "date", withTimezone: false }),
    groupId: text("group_id"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId, t.kind, t.status),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
    type: text("type").notNull(),
    // deposit|withdrawal|contribution|transfer_in|transfer_out|interest|penalty|reward|investment|payout|reversal
    direction: text("direction").notNull(), // credit | debit
    amountKobo: kobo("amount_kobo"),
    status: text("status").notNull().default("pending"), // pending|successful|failed|reversed
    reference: text("reference").notNull(),
    description: text("description"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    meta: jsonb("meta"),
    createdAt: ts("created_at"),
    settledAt: timestamp("settled_at", { mode: "date", withTimezone: false }),
  },
  (t) => [
    uniqueIndex("transactions_ref_idx").on(t.reference),
    index("transactions_user_idx").on(t.userId, t.createdAt),
  ],
);

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
    provider: text("provider").notNull().default("demo"), // paystack|flutterwave|demo|bank_transfer
    channel: text("channel").notNull().default("card"), // card|bank|ussd|transfer
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key"),
    amountKobo: kobo("amount_kobo"),
    feeKobo: kobo("fee_kobo"),
    status: text("status").notNull().default("pending"), // pending|success|failed|reversed
    purpose: text("purpose").notNull().default("deposit"), // deposit|funding
    checkoutUrl: text("checkout_url"),
    providerRef: text("provider_ref"),
    creditedTxId: text("credited_tx_id"),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("payment_intents_ref_idx").on(t.reference),
    uniqueIndex("payment_intents_idem_idx").on(t.idempotencyKey),
  ],
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bankName: text("bank_name").notNull(),
    bankCode: text("bank_code"),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    verified: boolean("verified").notNull().default(false),
    verificationSource: text("verification_source").notNull().default("simulated"),
    isDefault: boolean("is_default").notNull().default(false),
    status: text("status").notNull().default("active"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("bank_accounts_user_idx").on(t.userId),
  ],
);

export const withdrawalRequests = pgTable(
  "withdrawal_requests",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id"),
    bankAccountId: text("bank_account_id"),
    amountKobo: kobo("amount_kobo"),
    feeKobo: kobo("fee_kobo"),
    reference: text("reference").notNull(),
    status: text("status").notNull().default("pending"), // pending|approved|processing|paid|rejected|failed
    riskFlags: jsonb("riskFlags"),
    rejectionReason: text("rejection_reason"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("withdrawal_ref_idx").on(t.reference),
    index("withdrawal_user_idx").on(t.userId, t.status),
  ],
);

export const savingsRules = pgTable(
  "savings_rules",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // fixed|percentage_income|roundup|reminder
    name: text("name").notNull(),
    accountId: text("account_id"),
    amountKobo: kobo("amount_kobo"),
    percentageBps: bigint("percentage_bps", { mode: "number" }).notNull().default(0),
    frequency: text("frequency").notNull().default("weekly"),
    capKobo: kobo("cap_kobo"),
    active: boolean("active").notNull().default(true),
    consentVersion: text("consent_version"),
    lastRunAt: timestamp("last_run_at", { mode: "date", withTimezone: false }),
    nextRunAt: timestamp("next_run_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("savings_rules_user_idx").on(t.userId),
  ],
);

/* --------------------------- group savings ------------------------ */

export const savingsGroups = pgTable(
  "savings_groups",
  {
    id: id(),
    name: text("name").notNull(),
    joinCode: text("join_code").notNull(),
    description: text("description"),
    ownerId: text("owner_id").notNull(),
    targetKobo: kobo("target_kobo"),
    perMemberKobo: kobo("per_member_kobo"),
    frequency: text("frequency").notNull().default("monthly"),
    maxMembers: bigint("max_members", { mode: "number" }).notNull().default(12),
    minContributionsBeforeWithdraw: bigint(
      "min_contributions_before_withdraw",
      { mode: "number" },
    ).notNull().default(1),
    requireOwnerApproval: boolean("require_owner_approval").notNull().default(true),
    disputePolicy: text("dispute_policy"),
    status: text("status").notNull().default("active"),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("groups_code_idx").on(t.joinCode),
  ],
);

export const savingsGroupMembers = pgTable(
  "savings_group_members",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => savingsGroups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner|member|viewer
    status: text("status").notNull().default("active"), // active|left|removed
    contributionKobo: kobo("contribution_kobo"),
    joinedAt: ts("joined_at"),
  },
  (t) => [
    uniqueIndex("group_member_uniq_idx").on(t.groupId, t.userId),
  ],
);

export const groupActions = pgTable(
  "group_actions",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => savingsGroups.id, { onDelete: "cascade" }),
    requesterId: text("requester_id").notNull(),
    type: text("type").notNull().default("withdraw"), // withdraw|dispute|edit
    amountKobo: kobo("amount_kobo"),
    status: text("status").notNull().default("pending"), // pending|approved|rejected
    note: text("note"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("group_actions_group_idx").on(t.groupId, t.status),
  ],
);

/* --------------------------- investments -------------------------- */

export const investmentProducts = pgTable(
  "investment_products",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(), // fixed_income|treasury|fund|commercial_paper|simulated
    issuer: text("issuer"),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    riskLevel: text("risk_level").notNull().default("low"), // low|medium|high
    indicativeReturnBps: bigint("indicative_return_bps", { mode: "number" }).notNull().default(0),
    feeBps: bigint("fee_bps", { mode: "number" }).notNull().default(0),
    minKobo: kobo("min_kobo"),
    maxKobo: kobo("max_kobo"),
    tenorMonths: bigint("tenor_months", { mode: "number" }).notNull().default(12),
    liquidity: text("liquidity").notNull().default("at_maturity"),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("simulated"), // active|simulated|inactive|waitlist
    regulatoryNote: text("regulatory_note").notNull().default(""),
    disclaimer: text("disclaimer").notNull().default(""),
    partnerName: text("partner_name"),
    licenceRef: text("licence_ref"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("investment_products_slug_idx").on(t.slug),
  ],
);

export const investmentHoldings = pgTable(
  "investment_holdings",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => investmentProducts.id, {
      onDelete: "restrict",
    }),
    principalKobo: kobo("principal_kobo"),
    indicativeReturnBps: bigint("indicative_return_bps", { mode: "number" }).notNull().default(0),
    feeKobo: kobo("fee_kobo"),
    status: text("status").notNull().default("active"), // active|matured|redeemed|cancelled
    startAt: timestamp("start_at", { mode: "date", withTimezone: false }),
    maturityAt: timestamp("maturity_at", { mode: "date", withTimezone: false }),
    accruedKobo: kobo("accrued_kobo"),
    paidKobo: kobo("paid_kobo"),
    applicationRef: text("application_ref").notNull(),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("holdings_ref_idx").on(t.applicationRef),
    index("holdings_user_idx").on(t.userId, t.status),
  ],
);

/* ------------------------- notifications -------------------------- */

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("general"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    severity: text("severity").notNull().default("info"), // info|success|warning|danger
    link: text("link"),
    channels: jsonb("channels"), // ["in_app","email","sms"]
    readAt: timestamp("read_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    channels: jsonb("channels"), // { deposits: {in_app:true,email:true,sms:false}, ... }
    quietHours: jsonb("quietHours"),
    updatedAt: ts("updated_at"),
  },
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: id(),
    channel: text("channel").notNull(), // email | sms | push
    to: text("to").notNull(),
    subject: text("subject"),
    body: text("body").notNull().default(""),
    status: text("status").notNull().default("queued"), // queued|sent|skipped|failed
    provider: text("provider").notNull().default("console"),
    createdAt: ts("created_at"),
  },
  (t) => [index("outbox_created_idx").on(t.createdAt)],
);

/* -------------------------- referrals ----------------------------- */

export const referralCampaigns = pgTable(
  "referral_campaigns",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    rewardKobo: kobo("reward_kobo"),
    referrerRewardKobo: kobo("referrer_reward_kobo"),
    requirement: text("requirement").notNull().default("kyc_and_first_deposit"),
    minFirstDepositKobo: kobo("min_first_deposit_kobo"),
    fraudWindowDays: bigint("fraud_window_days", { mode: "number" }).notNull().default(14),
    startsAt: timestamp("starts_at", { mode: "date", withTimezone: false }),
    endsAt: timestamp("ends_at", { mode: "date", withTimezone: false }),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at"),
  },
);

export const referrals = pgTable(
  "referrals",
  {
    id: id(),
    referrerId: text("referrer_id").notNull(),
    refereeId: text("referee_id").notNull(),
    campaignId: text("campaign_id"),
    status: text("status").notNull().default("signed_up"), // invited|signed_up|verified|qualified|rewarded|rejected
    firstDepositKobo: kobo("first_deposit_kobo"),
    qualifiedAt: timestamp("qualified_at", { mode: "date", withTimezone: false }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("referrals_uniq_idx").on(t.referrerId, t.refereeId),
    index("referrals_referrer_idx").on(t.referrerId, t.status),
  ],
);

export const rewards = pgTable(
  "rewards",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // referral|milestone|campaign|adjustment
    label: text("label").notNull(),
    amountKobo: kobo("amount_kobo"),
    status: text("status").notNull().default("pending"), // pending|credited|void
    referralId: text("referral_id"),
    creditedTxId: text("credited_tx_id"),
    createdAt: ts("created_at"),
    creditedAt: timestamp("credited_at", { mode: "date", withTimezone: false }),
  },
  (t) => [
    index("rewards_user_idx").on(t.userId, t.status),
  ],
);

/* --------------------------- education ---------------------------- */

export const helpCategories = pgTable(
  "help_categories",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    blurb: text("blurb").notNull().default(""),
    icon: text("icon").notNull().default("book"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    uniqueIndex("help_categories_slug_idx").on(t.slug),
  ],
);

export const helpArticles = pgTable(
  "help_articles",
  {
    id: id(),
    slug: text("slug").notNull(),
    categorySlug: text("category_slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    body: text("body").notNull().default(""),
    tags: text("tags").notNull().default(""),
    audience: text("audience").notNull().default("all"), // all|help|education
    published: boolean("published").notNull().default(true),
    readMinutes: bigint("read_minutes", { mode: "number" }).notNull().default(3),
    views: bigint("views", { mode: "number" }).notNull().default(0),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("help_articles_slug_idx").on(t.slug),
  ],
);

export const faqs = pgTable(
  "faqs",
  {
    id: id(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: text("category").notNull().default("general"),
    sortOrder: bigint("sort_order", { mode: "number" }).notNull().default(0),
  },
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("general"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("open"), // open|pending_user|in_progress|resolved|closed
    relatedTxRef: text("related_tx_ref"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("tickets_ref_idx").on(t.reference),
    index("tickets_status_idx").on(t.status, t.updatedAt),
  ],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: id(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    fromStaff: boolean("from_staff").notNull().default(false),
    body: text("body").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("ticket_messages_ticket_idx").on(t.ticketId),
  ],
);

/* ------------------------- platform config ------------------------ */

export const calculatorPresets = pgTable(
  "calculator_presets",
  {
    id: id(),
    name: text("name").notNull(),
    scenario: text("scenario").notNull(), // goal|compound|safelock|comparison
    payload: jsonb("payload"),
    createdBy: text("created_by"),
    createdAt: ts("created_at"),
  },
);

export const appSettings = pgTable(
  "app_settings",
  {
    key: text("key").notNull(),
    value: jsonb("value"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("app_settings_key_idx").on(t.key),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    target: text("target"),
    ip: text("ip"),
    meta: jsonb("meta"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
  ],
);

export const jobsLog = pgTable(
  "jobs_log",
  {
    id: id(),
    name: text("name").notNull(),
    status: text("status").notNull().default("ok"),
    processed: bigint("processed", { mode: "number" }).notNull().default(0),
    detail: text("detail"),
    createdAt: ts("created_at"),
  },
);
