"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";
type ThemeCtx = { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void };

const Ctx = createContext<ThemeCtx>({ theme: "light", setTheme: () => {}, toggle: () => {} });

export function useTheme() {
  return useContext(Ctx);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = (localStorage.getItem("ss-theme") as Theme | null) ?? null;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem("ss-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }),
    [theme, setTheme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Inline snippet executed before hydration to avoid a theme flash. */
export const themeInitScript = `try{var t=localStorage.getItem("ss-theme");if(!t)t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t==="dark")document.documentElement.classList.add("dark");}catch(e){}`;
