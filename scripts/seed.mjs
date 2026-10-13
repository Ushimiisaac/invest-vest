import { randomUUID } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const client = new pg.Client({ connectionString: url });
await client.connect();

const now = new Date().toISOString();
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const daysAhead = (d) => new Date(Date.now() + d * 86400000).toISOString();
const id = () => randomUUID();
const hash = await bcrypt.hash("IncreaseVest!2026", 11);

const adminId = id();
const demoId = id();
const friendId = id();

await client.query("begin");

// ---------- users ----------
for (const u of [
  { id: adminId, email: "admin@increasevest.ng", name: "Platform Administrator", role: "admin", code: "ADMIN01", kyc: "verified" },
  { id: demoId, email: "demo@increasevest.ng", name: "Amaka Obi", role: "user", code: "AMAKA1", kyc: "verified" },
  { id: friendId, email: "tunde@increasevest.ng", name: "Tunde Adeyemi", role: "user", code: "TUNDE01", kyc: "verified" },
]) {
  await client.query(
    `insert into users (id,email,phone,password_hash,full_name,role,status,email_verified,phone_verified,kyc_status,referral_code,created_at,updated_at,last_login_at)
     values ($1,$2,'+2348031234567',$3,$4,$5,'active',true,true,$6,$7,$8,$8,$8)
     on conflict (email) do nothing`,
    [u.id, u.email, hash, u.name, u.role, u.kyc, u.code, now],
  );
}
await client.query(`update users set referred_by=$1 where id=$2`, [adminId, demoId]);

// ---------- settings ----------
const settings = {
  "brand.name": "IncreaseVest",
  "brand.tagline": "Save smart. Invest better. Grow with confidence.",
  "limits.kycRequired": true,
  "features.groupSavings": true,
  "features.investments": true,
  "features.referrals": true,
  "features.chatbot": true,
  "features.roundups": false,
};
for (const [k, v] of Object.entries(settings)) {
  await client.query(
    `insert into app_settings (key,value,updated_at) values ($1,$2,$3)
     on conflict (key) do update set value=excluded.value, updated_at=excluded.updated_at`,
    [k, JSON.stringify(v), now],
  );
}

// ---------- accounts for demo ----------
const flexId = id();
const goalId = id();
const lockId = id();
const groupId = id();
const groupAccountId = id();
const regId = id();
await client.query(
  `insert into accounts (id,user_id,kind,name,icon,color,purpose,balance_kobo,target_kobo,contribution_kobo,frequency,status,auto_debit,interest_bps,lock_months,penalty_bps,start_date,next_due_at,created_at,updated_at)
   values ($1,$2,'flex','Flex wallet','wallet','#0f9d76','flex',41250000,0,0,null,'active',false,300,0,0,$3,$4,$3,$3)
   on conflict do nothing`,
  [flexId, demoId, daysAgo(150), daysAhead(7)],
);
await client.query(
  `insert into accounts (id,user_id,kind,name,icon,color,purpose,balance_kobo,target_kobo,contribution_kobo,frequency,status,auto_debit,interest_bps,lock_months,penalty_bps,start_date,next_due_at,created_at,updated_at)
   values ($1,$2,'target','School fees 2026','target','#10a376','education',42000000,60000000,3500000,'monthly','active',true,0,0,0,$3,$4,$3,$3)
   on conflict do nothing`,
  [goalId, demoId, daysAgo(120), daysAhead(11)],
);
await client.query(
  `insert into accounts (id,user_id,kind,name,icon,color,purpose,balance_kobo,target_kobo,contribution_kobo,frequency,status,auto_debit,interest_bps,lock_months,penalty_bps,start_date,maturity_date,next_due_at,created_at,updated_at)
   values ($1,$2,'safelock','SafeLock 12M','lock','#0b8a65','safelock',50000000,50000000,1000000,'monthly','active',true,900,12,200,$3,$4,$5,$3,$3)
   on conflict do nothing`,
  [lockId, demoId, daysAgo(90), daysAhead(275), daysAhead(30)],
);
await client.query(
  `insert into accounts (id,user_id,kind,name,icon,color,purpose,balance_kobo,target_kobo,contribution_kobo,frequency,status,auto_debit,interest_bps,lock_months,penalty_bps,start_date,next_due_at,created_at,updated_at)
   values ($1,$2,'regular','Emergency buffer','piggy','#63d4a8','emergency',18500000,0,2000000,'weekly','active',false,300,0,0,$3,$4,$3,$3)
   on conflict do nothing`,
  [regId, demoId, daysAgo(60), daysAhead(4)],
);

// ---------- group ----------
await client.query(
  `insert into savings_groups (id,name,join_code,description,owner_id,target_kobo,per_member_kobo,frequency,max_members,min_contributions_before_withdraw,require_owner_approval,dispute_policy,status,created_at)
   values ($1,'Siblings December Fund','GRP2026X','Everyone pays monthly; the pot is shared in December.',$2,7200000,2000000,'monthly',6,1,true,'Written disputes are logged and resolved by the owner within 7 days.','active',$3)
   on conflict do nothing`,
  [groupId, demoId, daysAgo(80)],
);
for (const [uid, role, contrib] of [[demoId, "owner", 12000000], [friendId, "member", 8000000]]) {
  await client.query(
    `insert into savings_group_members (id,group_id,user_id,role,status,contribution_kobo,joined_at)
     values ($1,$2,$3,$4,'active',$5,$6) on conflict do nothing`,
    [id(), groupId, uid, role, contrib, daysAgo(80)],
  );
}
await client.query(
  `insert into accounts (id,user_id,kind,name,icon,color,purpose,balance_kobo,target_kobo,contribution_kobo,frequency,status,auto_debit,interest_bps,lock_months,penalty_bps,start_date,group_id,created_at,updated_at)
   values ($1,$2,'group','Group · Siblings December Fund','users','#2f6fb5','group',12000000,24000000,2000000,'monthly','active',false,0,0,0,$3,$1,$3,$3)
   on conflict do nothing`,
  [groupAccountId, demoId, daysAgo(80)],
);
await client.query(
  `insert into accounts (id,user_id,kind,name,icon,color,purpose,balance_kobo,target_kobo,contribution_kobo,frequency,status,auto_debit,interest_bps,lock_months,penalty_bps,start_date,group_id,created_at,updated_at)
   values ($1,$2,'group','Group · Siblings December Fund','users','#2f6fb5','group',8000000,24000000,2000000,'monthly','active',false,0,0,0,$3,$4,$3,$3)
   on conflict do nothing`,
  [id(), friendId, daysAgo(80), groupId],
);

// ---------- transactions history ----------
let refN = 0;
const tx = async (user, account, type, dir, amount, status, desc, daysAgoN, provider = "internal") => {
  refN += 1;
  await client.query(
    `insert into transactions (id,user_id,account_id,type,direction,amount_kobo,status,reference,description,provider,meta,created_at,settled_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) on conflict (reference) do nothing`,
    [id(), user, account, type, dir, amount, status, `SS-SEED-${String(refN).padStart(4, "0")}`, desc, provider, JSON.stringify({ seeded: true }), daysAgo(daysAgoN)],
  );
};
for (const [m, amt] of [[170, 9000000], [140, 11000000], [110, 10000000], [80, 13000000], [50, 12000000], [20, 15000000]]) {
  await tx(demoId, flexId, "deposit", "credit", amt, "successful", "Deposit to Flex wallet", m, "paystack");
  await tx(demoId, goalId, "contribution", "credit", 3500000, "successful", "Monthly contribution to School fees 2026", m - 2);
}
await tx(demoId, lockId, "contribution", "credit", 50000000, "successful", "Locked for 12 months (indicative 9% p.a.)", 90);
await tx(demoId, flexId, "transfer_out", "debit", 50000000, "successful", "Moved into SafeLock 12M", 90);
await tx(demoId, flexId, "withdrawal", "debit", 4000000, "successful", "Withdrawal to GTBank ••••3421", 35);
await tx(demoId, lockId, "interest", "credit", 1125000, "successful", "Interest accrued on SafeLock (net of WHT)", 10);
await tx(demoId, groupAccountId, "contribution", "credit", 2000000, "successful", "Group contribution", 6);
await tx(friendId, null, "deposit", "credit", 8000000, "successful", "Deposit to Flex wallet", 40, "paystack");

// ---------- savings rule ----------
await client.query(
  `insert into savings_rules (id,user_id,kind,name,account_id,amount_kobo,percentage_bps,frequency,cap_kobo,active,consent_version,next_run_at,created_at)
   values ($1,$2,'fixed','Salary-day sweep',$3,3500000,0,'monthly',5000000,true,'2026.01',$4,$5) on conflict do nothing`,
  [id(), demoId, goalId, daysAhead(11), now],
);

// ---------- bank account + kyc ----------
await client.query(
  `insert into bank_accounts (id,user_id,bank_name,bank_code,account_number,account_name,verified,verification_source,is_default,status,created_at)
   values ($1,$2,'GTBank (Guaranty Trust)','058','0123456789','AMAKA OBI',true,'simulated',true,'active',$3) on conflict do nothing`,
  [id(), demoId, daysAgo(100)],
);
await client.query(
  `insert into kyc_records (id,user_id,type,legal_name,dob,id_type,id_number_hash,id_number_last4,status,provider,provider_ref,submitted_at,reviewed_at)
   values ($1,$2,'nigeria_identity','Amaka Obi','1994-06-11','bvn','seed-hash-not-real','6789','verified','simulated','KYC-SEED-001',$3,$3)
   on conflict (user_id) do nothing`,
  [id(), demoId, daysAgo(99)],
);

// ---------- investments ----------
const products = [
  ["treasury-bill-182d", "FGN Treasury Bill (182 days)", "treasury", "182-day Nigerian Treasury Bill purchased at discount through a licensed dealer.", "low", 2650, 25, 10000000, 500000000, 6, "at_maturity", "simulated", "Simulated instrument. Real subscriptions open once a dealing agreement is signed.", null, null],
  ["fixed-income-12m", "Corporate Fixed Income 12M", "fixed_income", "Senior unsecured corporate paper with semi-annual coupons and a published offering memorandum.", "medium", 1750, 50, 5000000, 250000000, 12, "at_maturity", "simulated", "Awaiting final partner documentation before it can accept real subscriptions.", null, null],
  ["money-market-fund", "Money Market Fund", "fund", "Daily-valued collective investment scheme managed by a SEC-licensed fund manager.", "low", 1450, 0, 1000000, 0, 12, "on_demand", "waitlist", "Waitlisted until the fund manager agreement is executed.", "Anchor Custodians Ltd", "SEC/CIS/0000"],
  ["saving-balance-growth", "Balanced Growth Fund", "fund", "Multi-asset fund blending listed equities, fixed income and cash.", "high", 2100, 100, 5000000, 0, 24, "quarterly_window", "simulated", "Demonstration product only — no securities are purchased.", null, null],
];
for (let i = 0; i < products.length; i++) {
  const p = products[i];
  await client.query(
    `insert into investment_products (id,slug,name,category,summary,description,risk_level,indicative_return_bps,fee_bps,min_kobo,max_kobo,tenor_months,liquidity,currency,status,regulatory_note,disclaimer,partner_name,licence_ref,sort_order,created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'NGN',$14,$15,$16,$17,$18,$19,$20) on conflict (slug) do nothing`,
    [id(), p[0], p[1], p[2], p[3], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12],
      "Projected returns are estimates built from the indicative rate. Capital is at risk and returns are not guaranteed.", p[13], p[14], i + 1, now],
  );
}
const tBill = (await client.query(`select id, indicative_return_bps from investment_products where slug='treasury-bill-182d'`)).rows[0];
if (tBill) {
  await client.query(
    `insert into investment_holdings (id,user_id,product_id,principal_kobo,indicative_return_bps,fee_kobo,status,start_at,maturity_at,accrued_kobo,paid_kobo,application_ref,confirmed_at,created_at)
     values ($1,$2,$3,20000000,$4,100000,'active',$5,$6,620000,0,$7,$5,$5) on conflict do nothing`,
    [id(), demoId, tBill.id, tBill.indicative_return_bps, daysAgo(60), daysAhead(122), `INV-SEED-${randomUUID().slice(0, 6).toUpperCase()}`],
  );
}

// ---------- referral campaign + reward ----------
await client.query(
  `insert into referral_campaigns (id,name,description,reward_kobo,referrer_reward_kobo,requirement,min_first_deposit_kobo,fraud_window_days,active,created_at)
   values ($1,'Bring a friend · Q1','₦1,000 to you and ₦500 to your friend once they verify, fund ₦10,000+ and stay 14 days.',50000,100000,'kyc_and_first_deposit',1000000,14,true,$2)
   on conflict do nothing`,
  [id(), now],
);
await client.query(
  `insert into referrals (id,referrer_id,referee_id,status,first_deposit_kobo,qualified_at,created_at)
   values ($1,$2,$3,'verified',8000000,null,$4) on conflict do nothing`,
  [id(), adminId, demoId, daysAgo(40)],
);

// ---------- help content ----------
const cats = [
  ["savings", "Savings plans", "Goals, regular savings, Flex wallet and how money moves."],
  ["safelock", "SafeLock", "Terms, maturity, penalties and top-ups."],
  ["groups", "Group savings", "Membership, contributions, approvals and disputes."],
  ["investments", "Investments", "Products, risk, maturities and statements."],
  ["security", "Security & KYC", "2FA, sessions, verification and fraud cover."],
  ["fees", "Fees & limits", "What things cost and how much you can move."],
];
for (let i = 0; i < cats.length; i++) {
  await client.query(
    `insert into help_categories (id,slug,name,blurb,icon,sort_order) values ($1,$2,$3,$4,'book',$5) on conflict (slug) do nothing`,
    [id(), cats[i][0], cats[i][1], cats[i][2], i + 1],
  );
}
const articles = [
  ["how-withdrawals-work", "savings", "How withdrawals work", "Payouts go only to verified 10-digit NUBAN accounts and require a second factor.", "Withdrawals sit in one of five states: pending, approved, processing, paid, rejected. We debit your balance the moment you request a payout, so the money cannot be spent twice while it is in flight. If the payout is rejected or fails, the debit is reversed automatically and you get an email.\nLimits depend on verification status. Until KYC clears, daily payouts are capped; once verified, the cap rises. Every request checks available balance, the daily cap, device history and the age of the account — a flag on any of these routes the request to a human first.", "withdrawal,limits,bank", "help", 4],
  ["safelock-maturity", "safelock", "SafeLock maturity, in plain terms", "Locked money frees up on the maturity date, with interest credited net of withholding tax.", "When you lock, the app shows the maturity date before you confirm. Interest is prorated on the days actually locked, then reduced by 10% withholding tax on the interest component. At maturity the plan status flips to matured, interest is credited, and you can withdraw without penalty.\nEarly withdrawal is allowed but costs the disclosed penalty percentage of the accrued interest, and you tick an acknowledgement before it happens. Locked funds never pay zero on purpose: if your term completes, the interest is waiting in the plan.", "safelock,maturity,penalty", "help", 3],
  ["automated-savings-rules", "savings", "Automated savings rules explained", "Fixed amounts, percentage sweeps, round-ups and reminders — all consent-gated.", "Automation only ever pulls from your Flex wallet, never from an external bank account, so a missed transfer can never leave you short in your real bank. Each rule carries a hard cap, a cadence, and the policy version you consented to.\nIf a scheduled pull fails because the wallet is light, the rule is not silently skipped: you get a missed-contribution notification, and the next run date rolls forward. Turning off automation is one switch and takes effect immediately.", "auto,rules,consent", "help", 3],
  ["group-savings-guide", "groups", "Running a fair savings group", "Transparent ledger, owner approval for exits, and a written dispute trail.", "Every member sees the same contribution history, and withdrawals from a group pot require the owner's approval unless the group rules say otherwise. There is a minimum number of contributions before anyone can exit, so early leavers cannot drain the pot.\nDisputes are recorded in writing against the group, visible to members and to the platform. We never mediate the underlying agreement between members — we provide the record.", "group,ajo,thrift", "help", 4],
  ["kyc-verification", "security", "Finishing identity verification", "We hash your BVN or NIN and keep only the last four digits.", "Verification matches your legal name, date of birth and identifier against the record. The identifier itself is hashed with a server-side secret, so a database leak cannot expose raw BVN or NIN values. You must be 18 or over.\nVerified accounts get higher deposit and withdrawal limits and can subscribe to live investment products. Rejections always show a reason and you can resubmit.", "kyc,bvn,nin", "help", 3],
  ["budget-that-survives", "savings", "A Nigerian budget that survives reality", "Pay the plan first, then spend what is left — not the other way round.", "Start with the three fixed commitments you cannot move: rent, transport, data. Everything else is discretionary. Then set one savings rule you can keep on your worst month, not your best one — consistency outperforms intensity every time.\nUse a Flex wallet for the short-term buffer and SafeLock for money you genuinely do not need this year. The friction is the feature.", "budget,emergency,savings", "education", 6],
  ["understanding-risk-tiers", "investments", "What a risk tier actually means", "Low, medium and high describe the chance of losing money — not how much you might earn.", "Low risk usually means short-tenor government or cash-like instruments; you will still lose to inflation if the yield is below it. Medium adds issuer credit risk. High adds price volatility and sometimes liquidity risk, meaning you may not exit when you want.\nRead the tenor, the fee, and the exit rules before the indicative return. A 2% higher quoted rate with a 24-month lock can be worse than 2% lower with monthly liquidity.", "risk,invest,tenor", "education", 5],
  ["compound-vs-simple", "investments", "Compound versus simple interest", "Compounding reinvests earnings; simple interest does not.", "With simple interest you earn only on principal. With compound interest you earn on principal plus accumulated earnings, so the curve bends upward over long horizons. The gap is trivial over three months and material over three years.\nUse the calculators to see both on your own numbers, then switch on the inflation assumption — nominal growth can hide a real-terms decline.", "compound,interest", "education", 4],
];
for (let i = 0; i < articles.length; i++) {
  const a = articles[i];
  await client.query(
    `insert into help_articles (id,slug,category_slug,title,excerpt,body,tags,audience,published,read_minutes,views,updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,0,$10) on conflict (slug) do nothing`,
    [id(), a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], now],
  );
}

const faqRows = [
  ["general", "Is my money insured?", "IncreaseVest is a technology platform. Savings balances are held with licensed custody and payment partners; the specific custody and any deposit-insurance arrangement is published per product before you fund it. Never treat a platform balance as a bank deposit."],
  ["general", "Can I withdraw any time?", "Flex wallet money is withdrawable on demand to a verified bank account, within your limits. Locked plans follow the maturity and penalty terms shown at the moment you lock them, and those terms never change retroactively."],
  ["general", "How are returns calculated?", "Indicative returns use the published rate for a product, prorated for the days actually invested, net of withholding tax on interest where it applies. They are estimates, not promises."],
  ["general", "What does it cost?", "Opening an account and creating goals is free. Payment-provider charges on card or transfer deposits and a small payout fee on withdrawals are shown before you confirm each transaction."],
  ["general", "Do you need a BVN?", "Identity verification uses a BVN or NIN reference. The value is hashed with a server-side secret and only the last four digits are retained for support matching."],
  ["general", "Is the app safe for public Wi-Fi?", "Sessions are HttpOnly, same-site, server-side records with expiry, and payouts require a second factor. Still: enable 2FA and revoke devices you do not recognise from settings."],
  ["fees", "Is there a maintenance fee?", "No. There is no monthly account fee and no charge for creating, pausing or resuming a savings plan."],
  ["payouts", "How long does a payout take?", "Most Nigerian bank payouts settle within 30 minutes during banking hours. Requests carrying a risk flag wait for manual review, and you are notified either way."],
];
for (let i = 0; i < faqRows.length; i++) {
  await client.query(
    `insert into faqs (id,question,answer,category,sort_order) values ($1,$2,$3,$4,$5) on conflict do nothing`,
    [id(), faqRows[i][1], faqRows[i][2], faqRows[i][0], i],
  );
}

// ---------- notifications + consents ----------
await client.query(
  `insert into notifications (id,user_id,type,title,body,severity,link,channels,created_at)
   values ($1,$2,'milestone','70% of School fees 2026','You are ₦180,000 from your target. Two more automated contributions and it is done.','success','/savings','["in_app"]',$3),
          ($4,$2,'security','New sign-in from Chrome · Linux','A new device signed in to your account. Not you? Revoke the session and change your password.','warning','/settings','["in_app","email"]',$5)
   on conflict do nothing`,
  [id(), demoId, daysAgo(1), id(), daysAgo(3)],
);
for (const kind of ["terms", "privacy", "data_processing", "auto_debit"]) {
  await client.query(
    `insert into consents (id,user_id,kind,version,granted,ip,created_at) values ($1,$2,$3,'2026.01',true,'127.0.0.1',$4) on conflict do nothing`,
    [id(), demoId, kind, daysAgo(150)],
  );
}
await client.query(`insert into payment_intents (id,user_id,account_id,provider,channel,reference,amount_kobo,status,purpose,verified_at,created_at)
  values ($1,$2,$3,'demo','card','SS-SEED-DEP-001',15000000,'success','deposit',$4,$4) on conflict (reference) do nothing`,
  [id(), demoId, flexId, daysAgo(20)]);

await client.query("commit");
const counts = await client.query(
  `select (select count(*) from users) users, (select count(*) from accounts) accounts,
          (select count(*) from transactions) txns, (select count(*) from help_articles) articles,
          (select count(*) from investment_products) products`,
);
console.log("seeded:", counts.rows[0]);
await client.end();
