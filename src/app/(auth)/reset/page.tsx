import type { Metadata } from "next";
import { AuthShell, ForgotPasswordForm, RecoveryForm, ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Password reset" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; mode?: string }> }) {
  const { token, mode } = await searchParams;
  if (mode === "recover") {
    return (
      <AuthShell title="Account recovery" subtitle="Use this when you cannot access either your email or your phone. We verify identity manually.">
        <RecoveryForm />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={token ? "Choose a new password" : "Reset your password"}
      subtitle={
        token
          ? "Your link is valid for 45 minutes and can be used once. All other sessions will be signed out."
          : "Enter your email and we will send a single-use reset link."
      }
    >
      {token ? <ResetPasswordForm token={token} /> : <ForgotPasswordForm />}
    </AuthShell>
  );
}
