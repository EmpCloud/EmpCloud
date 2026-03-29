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

  return result;
}
