import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { faqs, helpArticles, helpCategories } from "@/db/schema";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";
import { Section } from "@/components/landing-sections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Help centre" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ q?: string; article?: string; tab?: string }> }) {
  const { q, article, tab = "browse" } = await searchParams;

  if (article) {
    const [row] = await db.select().from(helpArticles).where(eq(helpArticles.slug, article)).limit(1);
    if (row) {
      return (
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <Link href="/help" className="text-[13px] font-semibold text-brand-600 hover:underline dark:text-brand-300">← Help centre</Link>
          <p className="mt-6 text-[11.5px] font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">{row.categorySlug}</p>
          <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight">{row.title}</h1>
          <p className="mt-2 text-[13px] muted">{row.readMinutes} min read · updated {row.updatedAt.toDateString()}</p>
          <div className="mt-7 space-y-4 text-[15px] leading-relaxed">
            {row.body.split("\n").filter(Boolean).map((p: string, i: number) => (
              <p key={i} className={i === 0 ? "text-[16.5px] font-medium" : "muted"}>{p}</p>
            ))}
          </div>
          <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-[14px] font-bold">Still stuck?</p>
              <p className="mt-1 text-[13px] muted">Open a ticket and a human picks it up — usually within four business hours.</p>
            </div>
            <Button href="/support?tab=new">Contact support</Button>
          </Card>
        </article>
      );
    }
  }

  const clause = q ? or(ilike(helpArticles.title, `%${q}%`), ilike(helpArticles.body, `%${q}%`), ilike(helpArticles.tags, `%${q}%`)) : undefined;
  const where = clause ? and(eq(helpArticles.published, true), clause) : eq(helpArticles.published, true);
  const [articles, categories, faqRows, education] = await Promise.all([
    db.select().from(helpArticles).where(where).orderBy(desc(helpArticles.updatedAt)).limit(12).catch(() => []),
    db.select().from(helpCategories).orderBy(asc(helpCategories.sortOrder)).catch(() => []),
    db.select().from(faqs).orderBy(asc(faqs.sortOrder)).limit(12).catch(() => []),
    db.select().from(helpArticles).where(and(eq(helpArticles.published, true), eq(helpArticles.audience, "education"))).orderBy(desc(helpArticles.updatedAt)).limit(12).catch(() => []),
  ]);
  const showing = tab === "education" ? education : articles;

  return (
    <Section eyebrow="Help centre" title="Search everything, or just ask" lead="Product rules, limits, fees, verification and money basics — written in plain language.">
      <form className="flex flex-wrap gap-2" action="/help">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search: withdrawal limits, SafeLock, BVN, fees…" className="h-12 min-w-[16rem] flex-1" />
        <Button size="lg" type="submit">Search</Button>
        {q ? <Button size="lg" variant="ghost" href="/help">Clear</Button> : null}
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/help?tab=browse" className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${tab === "browse" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "muted"}`}>Product help</Link>
        <Link href="/help?tab=education" className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${tab === "education" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200" : "muted"}`}>Financial education</Link>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <Card key={c.id} className="p-4">
            <p className="text-[14px] font-bold">{c.name}</p>
            <p className="mt-1 text-[12.5px] muted">{c.blurb}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-3">
        {showing.length === 0 ? (
          <Card><EmptyState title="No article matched" description="Try “limits”, “lock”, “group” or “KYC” — or open a ticket and we will answer directly." action={<Button size="sm" href="/support?tab=new">Contact support</Button>} /></Card>
        ) : null}
        {showing.map((a) => (
          <Link key={a.id} href={`/help?article=${a.slug}`} className="block rounded-2xl border bg-[var(--surface-raised)] p-5 transition-colors hover:border-brand-400">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[15px] font-bold">{a.title}</p>
              <Badge tone="neutral">{a.categorySlug}</Badge>
              {a.audience === "education" ? <Badge tone="info">guide</Badge> : null}
            </div>
            <p className="mt-1.5 text-[13px] muted">{a.excerpt}</p>
          </Link>
        ))}
      </div>
      <div className="mt-10">
        <h3 className="text-[18px] font-bold">Frequently asked</h3>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {faqRows.map((f) => (
            <Card key={f.id} className="p-4">
              <p className="text-[13.5px] font-bold">{f.question}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed muted">{f.answer}</p>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  );
}

