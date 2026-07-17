# EmpCloud — Page Uplift UI Guide

The recipe for bringing any EmpCloud page to the Workday / BambooHR / Rippling bar:
**high density, crisp hierarchy, quiet chrome.** It is an *uplift* of existing pages, not a
rebuild — keep all data and logic, restyle the surface. Everything is token-driven, so a page
works in **light and dark** automatically.

> **Two standing decisions**
> 1. **Keep the brand blue** — do not shift to navy/slate.
> 2. **Light mode is primary** and must stay high-contrast; dark is the secondary that must not regress.
>
> **Never touch data, queries, mutations, or business logic — surface only.**

Shipped with this guide: `SelfServiceDashboardPage`, `ManagerDashboardPage`.

---

## 1. Principles

| Principle | What it means |
|---|---|
| **Density over air** | HR users scan large datasets. Tighten padding, shrink row height, drop decorative whitespace. Scannable modules, not roomy cards. |
| **Crisp, not bubbly** | Corner radius maxes at **8px** (cards) / **6px** (controls, chips). No `rounded-xl` / `rounded-2xl` on surfaces. |
| **Quiet chrome, loud data** | Section headers are small uppercase labels, not big blue titles. Spend contrast on the **numbers and status**, not the frame. |
| **Numbers are data** | Every figure gets `tabular-nums` so digits align in columns. Metrics read big; their labels read small. |
| **Semantic ≠ accent** | Green / amber / red are **status only** (present, warning, down). Brand blue is the accent for actions, links, active states — used sparingly. |
| **Token-driven** | Style through `bg-card`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border-border` — never raw grays. Both themes come free. |

---

## 2. Conversion rules (find → replace)

The concrete substitutions applied to every page.

| Element | Before | After |
|---|---|---|
| Card radius | `rounded-xl` / `rounded-2xl` | `rounded-lg` (8px) |
| Control / chip radius | `rounded` / `rounded-lg` | `rounded-md` (6px) |
| Card padding | `p-6` | `p-4` (header row `py-2.5`) |
| List / table row | `px-6 py-3` · `py-4` | `px-4 py-2.5` |
| Page title | `text-2xl font-bold` | `text-xl font-semibold tracking-tight` |
| Card heading | `text-lg font-semibold` (blue) | `text-[11px] uppercase tracking-wider text-muted-foreground` |
| Body text | `text-sm` | `text-[13px]` · meta `text-[11px]` |
| Dividers | `divide-gray-100` | `divide-border` |
| Metric numbers | `text-2xl font-bold` | `text-2xl font-semibold tabular-nums` |
| Hover | `hover:shadow-sm transition-all` | `hover:border-brand-400 transition-colors duration-150` |
| Wide table | *(breaks page)* | wrap in `overflow-x-auto` |

---

## 3. The `Panel` primitive

Every card becomes a `Panel`: a hairline-bordered surface with an **uppercase section-label
header** and an optional right-aligned `action` (a "View all" link or a count badge). The body
sits flush so lists/tables run edge-to-edge.

```tsx
import type { ReactNode } from "react";

function Panel({
  title,
  action,
  bodyClassName = "",
  id,
  children,
}: {
  title: string;
  action?: ReactNode;
  bodyClassName?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="bg-card border border-border rounded-lg overflow-hidden scroll-mt-4">
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
          {title}
        </h2>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
```

Usage:

```tsx
<Panel
  title={t("documents.pending")}
  action={<Link to="/documents" className="text-[11px] font-medium text-brand-600 dark:text-brand-400 hover:underline">{t("common.viewAll")}</Link>}
  bodyClassName="divide-y divide-border max-h-80 overflow-y-auto"
>
  {/* list rows sit flush */}
</Panel>
```

> **Note:** `Panel` is currently duplicated in the two shipped pages. The next refactor extracts it
> to a shared `components/ui/Panel.tsx` so every page imports one source of truth.

---

## 4. The KPI stat tile

Dashboard metric cards follow one shape: icon chip on top, big tabular number, uppercase micro-label.

```tsx
<div className="bg-card rounded-lg border border-border p-3 hover:border-brand-400 transition-colors duration-150">
  <span className={`flex h-8 w-8 items-center justify-center rounded-md ${statusTint}`}>
    <Icon className="h-4 w-4" />
  </span>
  <p className="mt-2.5 text-2xl font-semibold tabular-nums leading-none text-foreground">{value}</p>
  <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">{label}</p>
</div>
```

Status tints (status only, both themes):

```
good     bg-green-50 dark:bg-green-950/40  text-green-700 dark:text-green-300
warning  bg-amber-50 dark:bg-amber-950/40  text-amber-700 dark:text-amber-300
critical bg-red-50   dark:bg-red-950/40    text-red-700   dark:text-red-300
```

---

## 5. Do & don't

**Do**
- Wrap wide tables in `overflow-x-auto`.
- `truncate` + `min-w-0` on long text cells.
- `tabular-nums` on every number / day / amount column.
- Keep saturated buttons' white text (`bg-brand/green/red-600 text-white`).
- Give every colored tint a `dark:` pair.
- Preserve all IDs, jump-links, ARIA labels, and focus rings.

**Don't**
- Touch queries, mutations, or business logic.
- Leave `rounded-xl` / `divide-gray-*` on surfaces.
- Put `text-X-800` on a `dark:bg-X-950` tint (unreadable in dark mode).
- Use brand blue for status, or green/red for the accent.
- Redesign layout structure — restyle in place.
- Change data-viz series colors in charts.

---

## 6. Per-page checklist

1. Add the **Panel primitive** (or import the shared one); wrap every card in it.
2. Convert the **page header** → `text-xl font-semibold tracking-tight`.
3. Rebuild **stat cards** as KPI tiles (icon chip · tabular number · uppercase label).
4. Apply the **radius / padding / density** substitutions (§2).
5. For any **table**: compact header + rows, `overflow-x-auto`, `tabular-nums`, truncate.
6. Sweep for **dark-mode readability** — no `text-X-800` on a dark tint; every tint has a `dark:` pair.
7. Verify: `tsc --noEmit` = 0, `vite build` passes, works light + dark, no leftover `rounded-xl`.

---

## 7. Workflow

It's a **demo-first loop**:

1. Work on a branch off `main`; apply the uplift to one page.
2. Show it **live and uncommitted** for review (HMR on the dev server).
3. On approval, commit as its own PR (one page = one PR; split behavioral changes into separate commits).

To request it: **"apply the same UI treatment to `<page>`."**
