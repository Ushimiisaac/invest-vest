"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export const TOKEN_KEY = "ss-session-token";
export const TOKEN_PARAM = "ss_token";

type Ctx = {
  token: string | null;
  signedIn: boolean;
  inIframe: boolean;
  storageWorks: boolean;
  cookieWorks: boolean;
  save: (token: string) => void;
  clear: () => void;
  /** Navigate to a target carrying the session token so the server authenticates it. */
  goTo: (target: string) => void;
  verify: () => Promise<{ signedIn: boolean; cookiePresent: boolean }>;
};

const SessionCtx = createContext<Ctx>({
  token: null,
  signedIn: false,
  inIframe: false,
  storageWorks: true,
  cookieWorks: true,
  save: () => {},
  clear: () => {},
  goTo: () => {},
  verify: async () => ({ signedIn: false, cookiePresent: false }),
});

export function useSession() {
  return useContext(SessionCtx);
}

function readStored(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // sandboxed iframe / private mode: no storage at all
  }
}

function storageAvailable(): boolean {
  try {
    localStorage.setItem("ss-probe", "1");
    localStorage.removeItem("ss-probe");
    return true;
  } catch {
    return false;
  }
}

/**
 * Session transport that survives every embedding scenario.
 *
 * A preview iframe can defeat any single mechanism at once: third-party cookies are
 * blocked, a sandbox without `allow-same-origin` makes `localStorage` throw, and a
 * proxy can strip custom headers. So the token is held in memory (survives
 * client-side navigation), mirrored to storage when that works, attached to every
 * fetch as a header, and — as the guaranteed fallback — carried in the URL, where
 * `src/middleware.ts` authenticates it server-side before any JS runs.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [storageWorks, setStorageWorks] = useState(true);
  const [cookieWorks, setCookieWorks] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const canStore = storageAvailable();
    setStorageWorks(canStore);
    const fromUrl = new URL(window.location.href).searchParams.get(TOKEN_PARAM);
    const restored = readStored() ?? fromUrl;
    tokenRef.current = restored;
    setToken(restored);

    // Scrub the token from the address bar only when storage can carry it instead,
    // otherwise keep it: without storage it is the only thing keeping the user signed in.
    if (fromUrl && canStore) {
      const url = new URL(window.location.href);
      url.searchParams.delete(TOKEN_PARAM);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);

  // When storage is unavailable the URL is the only durable carrier, so keep it there
  // across client-side navigations (replaceState, no reload) so a refresh still works.
  useEffect(() => {
    if (typeof window === "undefined" || !token || storageWorks) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(TOKEN_PARAM) === token) return;
    url.searchParams.set(TOKEN_PARAM, token);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [token, storageWorks]);

  // Attach the token to every client request (RSC payloads + Server Actions).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const current = tokenRef.current ?? readStored();
      if (!current) return original(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      if (!headers.has("x-ss-session")) headers.set("x-ss-session", current);
      const next: RequestInit = { ...init, headers };
      if (input instanceof Request) return original(new Request(input, next), undefined);
      return original(input, next);
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  const save = useCallback((value: string) => {
    tokenRef.current = value;
    setToken(value);
    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch {
      /* no storage — memory + URL carry the session instead */
    }
  }, []);

  const clear = useCallback(() => {
    tokenRef.current = null;
    setToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const goTo = useCallback(
    (target: string) => {
      const current = tokenRef.current;
      const [path, query = ""] = target.split("?");
      const params = new URLSearchParams(query);
      if (current && !params.has(TOKEN_PARAM)) params.set(TOKEN_PARAM, current);
      const suffix = params.toString();
      const url = suffix ? `${path}?${suffix}` : path;
      // Client-side navigation keeps the app fast; if the host forces a reload, the
      // token in the URL still authenticates the request via middleware.
      router.replace(url);
    },
    [router],
  );

  const verify = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const json = (await res.json()) as { signedIn: boolean; cookiePresent: boolean };
      setCookieWorks(json.cookiePresent);
      if (!json.signedIn && tokenRef.current) clear();
      return { signedIn: json.signedIn, cookiePresent: json.cookiePresent };
    } catch {
      return { signedIn: false, cookiePresent: false };
    }
  }, [clear]);

  const value = useMemo(
    () => ({ token, signedIn: Boolean(token), inIframe: false, storageWorks, cookieWorks, save, clear, goTo, verify }),
    [token, storageWorks, cookieWorks, save, clear, goTo, verify],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

/** Banner shown inside a framed session so the user knows which transport is live. */
export function IframeNotice() {
  const { inIframe, storageWorks, cookieWorks, signedIn } = useSession();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(true), []);
  if (!checked) return null;
  let framed = false;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }
  if (!framed) return null;

  const status = signedIn
    ? storageWorks
      ? "Signed in inside the preview frame."
      : "Signed in. This frame blocks local storage, so your session rides in the page URL."
    : "You are browsing the preview inside a frame. Sign in below, or open it in its own tab for the smoothest experience.";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/50 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <span aria-hidden>🔒</span>
      <span>{status}</span>
      <button
        onClick={() => {
          const url = window.location.href;
          window.open(url, "_blank", "noopener,noreferrer");
          router.refresh();
        }}
        className="rounded-md bg-amber-500 px-2 py-1 text-[11.5px] font-bold text-white hover:bg-amber-600"
      >
        Open in new tab
      </button>
    </div>
  );
}
