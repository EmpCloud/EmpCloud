// =============================================================================
// EMP CLOUD — HTML Sanitizer
// Strips dangerous HTML tags and event handler attributes to prevent stored XSS.
// =============================================================================

/** Tags that are always stripped (with their content) */
const DANGEROUS_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "form",
  "link",
  "meta",
  "base",
  "svg",
  "math",
];

/**
 * Strip dangerous HTML from a string to prevent stored XSS.
 * Removes script/iframe/object/embed/etc tags (including content),
 * and strips on* event-handler attributes from remaining tags.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return input;

  let result = input;

  // 1. Remove dangerous tags and their content (case-insensitive)
  for (const tag of DANGEROUS_TAGS) {
    const openClose = new RegExp(
      `<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,
      "gi"
    );
    result = result.replace(openClose, "");

    // Self-closing variants
    const selfClosing = new RegExp(`<${tag}\\b[^>]*/?>`, "gi");
    result = result.replace(selfClosing, "");
  }

  // 2. Remove on* event-handler attributes (onclick, onerror, onload, etc.)
  result = result.replace(
    /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    ""
  );

  // 3. Remove javascript: / vbscript: / data: URIs in href/src/action attributes
  result = result.replace(
    /(href|src|action)\s*=\s*(?:"[^"]*(?:javascript|vbscript|data)\s*:[^"]*"|'[^']*(?:javascript|vbscript|data)\s*:[^']*')/gi,
    ""
  );

  // 4. Scrub CSS custom properties (`--foo: ...`) out of inline style
  //    attributes. Pasting content copied from a Tailwind-rendered page carries
  //    the framework's `--tw-*` variables as inline styles onto every element,
  //    including <br>, bloating the stored HTML with hundreds of chars of junk
  //    that leaks as visible text anywhere the content is shown as plain text.
  //    We keep legitimate declarations (font-size, color, text-align — the ones
  //    the editor's own formatting emits) and drop only the `--*` ones; a style
  //    left empty is removed entirely.
  result = result.replace(
    /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (_m, dq, sq) => {
      const raw = dq !== undefined ? dq : sq;
      const kept = raw
        .split(";")
        .map((d: string) => d.trim())
        .filter((d: string) => d && !d.startsWith("--"))
        .join("; ");
      return kept ? ` style="${kept}"` : "";
    },
  );

  return result;
}

/**
 * Sanitize a PLAIN-TEXT field that should never contain any markup — leave
 * reasons, regularization reasons, rejection reasons, override reasons,
 * descriptions, etc. Strips dangerous HTML via sanitizeHtml, then removes any
 * remaining angle brackets so nothing can render as a tag at all, and trims.
 * Returns null for empty/blank input so callers can store NULL cleanly.
 *
 * Use this on EVERY user-supplied free-text field at write time. Stored-XSS
 * payloads such as `<script>alert(1)</script>` and
 * `<img src=x onerror=alert(document.cookie)>` were accepted raw across leave
 * applications, regularizations and other reason fields (BUG-04 / BUG-04b).
 */
export function sanitizePlainText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const stripped = sanitizeHtml(String(input)).replace(/[<>]/g, "").trim();
  return stripped.length ? stripped : null;
}
