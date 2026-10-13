"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[auth error boundary]", error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-[22px] font-bold">That request could not be processed</h1>
      <p className="mt-3 text-[13.5px] leading-relaxed muted">
        The form failed before it reached the server. The usual cause in a preview environment is the request being
        proxied under a different host, which Next.js blocks for Server Actions as a CSRF guard. Retry, and if it keeps
        failing, tell us the digest below.
      </p>
      <pre className="mx-auto mt-4 w-fit max-w-full overflow-x-auto rounded-xl bg-[var(--surface-sunken)] p-3 text-left text-[11.5px]">
        {error?.digest ? `digest: ${error.digest}` : error?.message || "unknown"}
      </pre>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button onClick={reset} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white">Try again</button>
        <Link href="/api/system/selftest" className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Run system self-test</Link>
        <Link href="/login" className="rounded-xl border px-4 py-2.5 text-sm font-semibold">Back to sign in</Link>
      </div>
    </div>
  );
}
