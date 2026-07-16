import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Theme system for EMP Cloud. Mirrors the emp-payroll approach: a "light" /
// "dark" / "system" preference persisted to localStorage, resolved to a
// concrete light/dark mode that toggles the `.dark` class on <html> (Tailwind
// darkMode: "class"). The initial class is set by an inline script in
// index.html before React mounts, so there's no flash-of-wrong-theme on load.

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const STORAGE_KEY = "empcloud-theme";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    function apply() {
      const mode: "light" | "dark" =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      setResolved(mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
    }

    apply();
    // Follow OS changes only while in "system" mode.
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  function setTheme(t: Theme) {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
