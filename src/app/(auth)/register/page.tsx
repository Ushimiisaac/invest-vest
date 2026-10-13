import type { Metadata } from "next";
import { AuthShell, RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <AuthShell
      title="Create your IncreaseVest account"
      subtitle="Two minutes now, a year of discipline later. No card needed to start."
    >
      <RegisterForm initialRef={ref} />
    </AuthShell>
  );
}
