import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchTransactions, statementCsv } from "@/lib/data";
import { csv, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(request.url);
  const rows = await searchTransactions(user.id, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    limit: 5000,
  });
  if (url.searchParams.get("format") === "csv2") {
    const body = csv([
      ["Statement", user.fullName, fmtDate(new Date(), "long")],
      ["Total rows", String(rows.length)],
      [],
      ...rows.map((r) => [r.createdAt.toISOString(), r.reference, r.type, r.direction, (r.amountKobo / 100).toFixed(2), r.status, r.description ?? ""]),
    ]);
    return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="statement-${Date.now()}.csv"` } });
  }
  const body = statementCsv(rows);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${user.referralCode ?? "account"}-statement.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
