import { createContext, useCallback, useContext, useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: "dark", setTheme: () => undefined });

const KEY = "yoth-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeSt] = useState<Theme>(() => {
    const s = (typeof localStorage !== "undefined" && localStorage.getItem(KEY)) as Theme | null;
    return s === "light" || s === "dark" ? s : "dark";
  });
  const setTheme = useCallback((t: Theme) => {
    setThemeSt(t);
    localStorage.setItem(KEY, t);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
