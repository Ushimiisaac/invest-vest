import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import { IframeNotice, SessionProvider } from "@/components/session-bridge";
import { ThemeProvider, themeInitScript } from "@/components/theme";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "IncreaseVest is a digital savings and investment platform for Nigeria: lock funds, hit goals, automate contributions, invest in vetted products, and track every kobo.",
  applicationName: BRAND.name,
  openGraph: {
    title: BRAND.name,
    description: BRAND.tagline,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#060b14" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { getSettings } = await import("@/lib/data");
  const settings = await getSettings();
  const brandName = typeof settings["brand.name"] === "string" ? (settings["brand.name"] as string) : BRAND.name;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className="bg-[var(--surface)] text-[var(--text-strong)] antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <SessionProvider>
            <ToastProvider>
              <div data-brand={brandName} className="min-h-dvh">
                <IframeNotice />
                {children}
              </div>
            </ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
