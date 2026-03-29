# Internationalization (i18n) — End-to-End Test Plan

## Module Overview
Multi-language support across the EMP Cloud frontend with 9 languages, RTL support for Arabic, localStorage persistence, and a language switcher component. All UI strings are externalized via translation files.

---

## Supported Languages

| Code | Language | Direction |
|------|----------|-----------|
| en | English | LTR |
| hi | Hindi (हिन्दी) | LTR |
| es | Spanish (Español) | LTR |
| fr | French (Français) | LTR |
| de | German (Deutsch) | LTR |
| ar | Arabic (العربية) | RTL |
| pt | Portuguese (Português) | LTR |
| ja | Japanese (日本語) | LTR |
| zh | Chinese (中文) | LTR |

---

## Test Phases

### Phase 1: Language Switcher

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Language switcher visible in header/settings | Dropdown or menu present |
| 2 | All 9 languages listed | en, hi, es, fr, de, ar, pt, ja, zh |
| 3 | Languages shown in native script | हिन्दी, العربية, 中文, etc. |
| 4 | Default language is English | en selected on first visit |
| 5 | Switch to Hindi | UI updates to Hindi strings |
| 6 | Switch to Spanish | UI updates to Spanish strings |
| 7 | Switch to Arabic | UI switches to RTL layout |
| 8 | Language persists in localStorage | `i18nextLng` key set |
| 9 | Refresh page after switching | Language preserved |
| 10 | New browser tab inherits language | localStorage read on load |

### Phase 2: Translation Coverage

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 11 | Login page fully translated | All labels, buttons, errors |
| 12 | Dashboard page fully translated | Cards, headings, stats |
| 13 | Employee directory translated | Table headers, actions, filters |
| 14 | Attendance page translated | Status labels, buttons, dates |
| 15 | Leave management translated | Types, statuses, form labels |
| 16 | Settings page translated | Section headings, form fields |
| 17 | Navigation menu translated | All sidebar items |
| 18 | Error messages translated | Validation errors, toasts |
| 19 | Empty states translated | "No data" messages |
| 20 | Modal dialogs translated | Titles, buttons, content |
| 21 | No untranslated keys visible | No `translation.key.name` shown |
| 22 | Placeholder text translated | Input placeholders in target language |

### Phase 3: RTL Layout (Arabic)

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 23 | Switch to Arabic | `dir="rtl"` set on html/body |
| 24 | Sidebar appears on right | Layout mirrored |
| 25 | Text aligned right | Natural RTL alignment |
| 26 | Navigation icons mirrored | Back/forward arrows flipped |
| 27 | Tables render RTL | Columns right-to-left |
| 28 | Form labels on right | Inputs flow RTL |
| 29 | Dropdown menus align right | Positioned correctly |
| 30 | Modals layout RTL | Content flows right-to-left |
| 31 | Breadcrumbs reversed | Right-to-left hierarchy |
| 32 | Charts/graphs work in RTL | No layout overlap or clipping |
| 33 | Switch from Arabic → English | Layout reverts to LTR |
| 34 | Mixed content (English names in Arabic UI) | Numbers and names render correctly |

### Phase 4: Date & Number Formatting

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 35 | Dates in English | MM/DD/YYYY or locale format |
| 36 | Dates in Hindi | DD/MM/YYYY with Devanagari numerals (if configured) |
| 37 | Dates in Arabic | Arabic date format |
| 38 | Dates in Japanese | YYYY年MM月DD日 |
| 39 | Dates in Chinese | YYYY年MM月DD日 |
| 40 | Currency in English (INR) | ₹1,000.00 |
| 41 | Currency formatting per locale | Correct separator/position |
| 42 | Numbers with locale separators | 1,000 vs 1.000 vs 1 000 |

### Phase 5: Dynamic Content

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 43 | User-generated content (names) unchanged | Names not translated |
| 44 | Enum values translated (leave types, roles) | System enums in target language |
| 45 | Notification text translated | Notification messages localized |
| 46 | Email templates (if i18n) | Emails in user's language |
| 47 | API error messages localized | Backend errors in correct language |

### Phase 6: Edge Cases

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 48 | Very long German translations | No overflow/truncation issues |
| 49 | CJK characters (Chinese/Japanese) in tables | Proper rendering, no clipping |
| 50 | Arabic mixed with numbers | Bidirectional text renders correctly |
| 51 | Missing translation key | Falls back to English |
| 52 | Nested interpolation (`{{count}} items`) | Variables replaced correctly |
| 53 | Pluralization rules per language | Correct plural forms |
| 54 | Language switch mid-form | Form labels update, input preserved |

---

## Key Technical Details

| Aspect | Implementation |
|--------|---------------|
| Library | i18next + react-i18next |
| Storage | localStorage (`i18nextLng`) |
| Fallback | English (en) |
| RTL Detection | Language code → dir attribute |
| Translation Files | `packages/client/src/i18n/locales/{lang}/` |
| Switcher Component | `LanguageSwitcher.tsx` |

## Translation File Structure

```
locales/
├── en/
│   ├── common.json
│   ├── auth.json
│   ├── dashboard.json
│   ├── employees.json
│   ├── attendance.json
│   ├── leave.json
│   └── ...
├── hi/
├── es/
├── fr/
├── de/
├── ar/
├── pt/
├── ja/
└── zh/
```
