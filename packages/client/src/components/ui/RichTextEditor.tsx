// =============================================================================
// EMP CLOUD — Rich Text Editor (CKEditor-style, dependency-free)
// =============================================================================
//
// A small WYSIWYG editor built on `contentEditable` + `document.execCommand`,
// so it ships zero new npm dependencies. Emits HTML via `onChange`; the markup
// it produces (b/i/u, h1/h2, ul/ol/li, a, p) is exactly what the server-side
// `sanitizeHtml()` allow-list keeps, and what the shared `.rich-text` CSS class
// (see styles/globals.css) renders — so "what you write" matches "what
// employees see".
//
// Usage:
//   <RichTextEditor value={content} onChange={setContent}
//     placeholder="Write the policy content..." />
//
// Validate emptiness with isRichTextEmpty() — an editor that looks blank still
// reports markup like "<br>" or "<div></div>" as innerHTML.
// =============================================================================

import { useRef, useEffect, useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * True when rich-text HTML is visually empty (no text/links — just the empty
 * markers a contentEditable leaves behind: "", "<br>", "<div><br></div>",
 * "<p></p>"). Use for "required" validation instead of `value.trim()`.
 */
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  const stripped = html
    .replace(/<[^>]*>/g, "") // drop tags
    .replace(/&nbsp;/gi, " ") // entity form of non-breaking space
    .replace(/ /g, " ") // literal non-breaking space
    .trim();
  return stripped.length === 0;
}

/**
 * Convert rich-text HTML to a plain-text excerpt for compact previews (e.g. a
 * dashboard list) where rendering markup would look broken. Decodes entities
 * and drops tags via the DOM; scripts/handlers don't run on a detached node and
 * the content is server-sanitized regardless.
 */
export function richTextToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

// Font-size presets for the toolbar dropdown. "Normal" (14px) matches the
// `.rich-text` base size, so picking it visually clears a custom size.
const FONT_SIZES: { label: string; value: string }[] = [
  { label: "Small", value: "12px" },
  { label: "Normal", value: "14px" },
  { label: "Medium", value: "16px" },
  { label: "Large", value: "20px" },
  { label: "Huge", value: "28px" },
];

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

interface ToolButtonProps {
  icon: typeof Bold;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function ToolButton({ icon: Icon, label, active, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // preventDefault on mousedown keeps the editor's selection alive so the
      // command applies to the highlighted text rather than nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900",
        active && "bg-brand-100 text-brand-700"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden />;
}

export default function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // Last selection made inside the editor. Clicking a toolbar control (e.g. the
  // font-size <select>) blurs the editor and collapses the live selection, so
  // we stash the range and restore it before applying a command.
  const savedRangeRef = useRef<Range | null>(null);
  const [isEmpty, setIsEmpty] = useState(isRichTextEmpty(value));
  const [active, setActive] = useState<Record<string, boolean>>({});

  // Sync external value -> DOM only when it actually diverges (initial mount,
  // loading a policy to edit, form reset). On normal typing `value` already
  // equals the live innerHTML (we set it from onChange), so this no-ops and
  // the caret never jumps.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if ((value || "") !== el.innerHTML) {
      el.innerHTML = value || "";
      setIsEmpty(isRichTextEmpty(value));
    }
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    onChange(html);
    setIsEmpty(isRichTextEmpty(html));
  }, [onChange]);

  const syncActive = useCallback(() => {
    try {
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    } catch {
      // queryCommandState can throw when there's no live selection — ignore.
    }
  }, []);

  // Remember the current selection while it still lives inside the editor.
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    const el = editorRef.current;
    if (!sel || sel.rangeCount === 0 || !el) return;
    const range = sel.getRangeAt(0);
    if (el.contains(range.commonAncestorContainer)) {
      savedRangeRef.current = range.cloneRange();
    }
  }, []);

  // Update toolbar state and stash the selection on every editor interaction.
  const onSelect = useCallback(() => {
    syncActive();
    saveSelection();
  }, [syncActive, saveSelection]);

  const exec = useCallback(
    (command: string, val?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, val);
      handleInput();
      syncActive();
    },
    [handleInput, syncActive]
  );

  const insertLink = useCallback(() => {
    const url = window.prompt("Enter the link URL (https://…)");
    if (!url) return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    exec("createLink", href);
  }, [exec]);

  const clearFormatting = useCallback(() => {
    exec("removeFormat");
    exec("formatBlock", "<p>");
  }, [exec]);

  // Apply a font size to the selected text by wrapping it in a styled <span>.
  // execCommand("fontSize") only supports the legacy 1–7 scale and emits
  // deprecated <font> tags, so we wrap manually for clean, arbitrary px sizes
  // that the server sanitizer keeps (it preserves the style attribute) and the
  // inline style renders directly. Requires a non-empty selection.
  const applyFontSize = useCallback(
    (size: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      // Restore the selection the toolbar interaction collapsed.
      if (savedRangeRef.current) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
      if (sel.rangeCount === 0 || sel.isCollapsed) return; // nothing selected
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = size;
      span.appendChild(range.extractContents());
      range.insertNode(span);
      // Re-select the resized text so the change is visible and chainable.
      sel.removeAllRanges();
      const after = document.createRange();
      after.selectNodeContents(span);
      sel.addRange(after);
      savedRangeRef.current = after.cloneRange();
      handleInput();
    },
    [handleInput]
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-2 py-1.5">
        <ToolButton icon={Bold} label="Bold" active={active.bold} onClick={() => exec("bold")} />
        <ToolButton icon={Italic} label="Italic" active={active.italic} onClick={() => exec("italic")} />
        <ToolButton icon={Underline} label="Underline" active={active.underline} onClick={() => exec("underline")} />
        <Divider />
        <ToolButton icon={Heading1} label="Heading 1" onClick={() => exec("formatBlock", "<h1>")} />
        <ToolButton icon={Heading2} label="Heading 2" onClick={() => exec("formatBlock", "<h2>")} />
        <Divider />
        <select
          aria-label="Font size"
          title="Font size — select text first"
          value=""
          // Capture the selection before the dropdown opens and blurs the editor.
          onMouseDown={saveSelection}
          onChange={(e) => {
            if (e.target.value) applyFontSize(e.target.value);
          }}
          className="h-8 cursor-pointer rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <Divider />
        <ToolButton icon={List} label="Bullet list" active={active.ul} onClick={() => exec("insertUnorderedList")} />
        <ToolButton icon={ListOrdered} label="Numbered list" active={active.ol} onClick={() => exec("insertOrderedList")} />
        <Divider />
        <ToolButton icon={Link2} label="Insert link" onClick={insertLink} />
        <ToolButton icon={RemoveFormatting} label="Clear formatting" onClick={clearFormatting} />
      </div>

      {/* Editable surface */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder || "Rich text editor"}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyUp={onSelect}
          onMouseUp={onSelect}
          onFocus={onSelect}
          className="rich-text min-h-[160px] max-h-[420px] w-full overflow-y-auto px-3 py-2 text-gray-900 focus:outline-none"
        />
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-2 select-none text-sm text-gray-400">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
}
