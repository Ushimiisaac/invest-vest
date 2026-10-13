import type { Metadata } from "next";
import { db } from "@/db";
import { investmentProducts } from "@/db/schema";
import { listProducts } from "@/lib/data";
import { Alert, Badge, Button, Card, CardHead, Row } from "@/components/ui";
import { Section } from "@/components/landing-sections";
import { CalculatorSuite } from "@/components/calculators";
import { bps, naira } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Investment register" };

export default async function PublicProductsPage() {
  const products = await listProducts().catch(() => [] as typeof investmentProducts.$inferSelect[]);
  return (
    <>
      <Section
        eyebrow="Investment desk"
        title="Product register"
        lead="Everything we list carries a risk tier, a fee, a tenor, a minimum and a regulatory status. Anything marked simulated is for testing and education — it is not an offer, and no real security is bought."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id}>
              <CardHead
                title={p.name}
                subtitle={p.summary}
                action={<Badge tone={p.status === "active" ? "brand" : p.status === "simulated" ? "warning" : "neutral"}>{p.status === "active" ? "live · partner" : p.status}</Badge>}
              />
              <div className="p-5">
                <Row label="Risk" value={<Badge tone={p.riskLevel === "high" ? "danger" : p.riskLevel === "medium" ? "warning" : "info"}>{p.riskLevel}</Badge>} />
                <Row label="Indicative return" value={`${bps(p.indicativeReturnBps)} p.a. (estimate)`} mono />
                <Row label="Entry fee" value={bps(p.feeBps)} mono />
                <Row label="Minimum" value={naira(p.minKobo)} mono />
                <Row label="Tenor" value={`${p.tenorMonths} months`} />
                <Row label="Liquidity" value={p.liquidity.replace(/_/g, " ")} />
                <Row label="Category" value={p.category.replace(/_/g, " ")} />
                <p className="mt-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-[12px] leading-relaxed muted">{p.regulatoryNote}</p>
                <p className="mt-2 text-[11.5px] muted">{p.disclaimer}</p>
                <Button href={`/invest?product=${p.slug}`} size="sm" className="mt-4 w-full" variant={p.status === "active" ? "primary" : "outline"}>
                  {p.status === "active" ? "Review & apply" : "Model this product"}
                </Button>
              </div>
            </Card>
          ))}
          {products.length === 0 ? <Card className="p-8 text-center text-[13.5px] muted">The registry is empty until products are added from the admin desk.</Card> : null}
        </div>
        <Alert tone="warning" title="Before you put money into anything" className="mt-6">
          Returns are never guaranteed and your capital can be lost. Only subscribe to a product whose issuer, licence and fees you have verified independently,
          and never borrow to invest.
        </Alert>
      </Section>
      <Section eyebrow="Model it first" title="Investment calculators" lead="Free to use, no account needed. Same engine as the signed-in version.">
        <CalculatorSuite initialTab="invest" />
      </Section>
    </>
  );
}
