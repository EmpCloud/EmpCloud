import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { NavItem } from "./navigation.config";

type SearchItem = {
  path: string;
  label: string;
  icon: NavItem["icon"];
};

function flattenItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);
}

export default function GlobalNavSearch({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const searchableItems = useMemo<SearchItem[]>(() => {
    const uniqueItems = new Map<string, SearchItem>();
    flattenItems(items).forEach((item) => {
      if (!uniqueItems.has(item.path)) {
        uniqueItems.set(item.path, {
          path: item.path,
          label: item.i18nKey ? t(item.i18nKey) : item.label,
          icon: item.icon,
        });
      }
    });
    return Array.from(uniqueItems.values());
  }, [items, t]);

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return [];
    return searchableItems
      .filter((item) => item.label.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 7);
  }, [query, searchableItems]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => setActiveIndex(0), [query]);

  const selectResult = (item: SearchItem) => {
    setQuery("");
    setIsOpen(false);
    navigate(item.path);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  };

  const inputClassName = "h-8 w-full rounded-lg border border-border bg-background ps-9 pe-16 text-xs text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

  return (
    <div ref={containerRef} className="relative hidden w-full max-w-lg sm:block">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={inputRef}
        type="search"
        value={query}
        role="combobox"
        aria-label={t("dashboard.searchNavigation")}
        aria-autocomplete="list"
        aria-expanded={isOpen && query.trim().length > 0}
        aria-controls="global-navigation-search-results"
        aria-activedescendant={results[activeIndex] ? `global-search-result-${activeIndex}` : undefined}
        placeholder={t("dashboard.searchNavPlaceholder")}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      <kbd className="pointer-events-none absolute end-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground lg:inline-flex">
        Ctrl K
      </kbd>

      {isOpen && query.trim().length > 0 && (
        <div
          id="global-navigation-search-results"
          role="listbox"
          className="absolute inset-x-0 top-10 z-50 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-xl"
        >
          {results.length > 0 ? (
            results.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  id={`global-search-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectResult(item)}
                  className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    activeIndex === index
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })
          ) : (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t("dashboard.noNavigationMatches")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
