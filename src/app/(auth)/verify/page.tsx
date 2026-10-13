import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-forms";
import { VerifyPanel } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Verify your account" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const [row] = await db
    .select({ email: users.email, phone: users.phone, emailVerified: users.emailVerified, phoneVerified: users.phoneVerified })
    .from(users)
    .where(eq(users.id, me.id))
    .limit(1);

  return (
    <AuthShell title="Verify email and phone" subtitle="Verification protects your money and lifts your deposit and withdrawal limits.">
      <VerifyPanel
        userId={me.id}
        email={row?.email ?? me.email}
        phone={row?.phone ?? null}
        emailVerified={Boolean(row?.emailVerified)}
        phoneVerified={Boolean(row?.phoneVerified)}
        token={token}
      />
    </AuthShell>
  );
}
