import { User } from "lucide-react";

type Props = {
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  title?: string | null;
  timestamp?: string;
  edited?: boolean;
  compact?: boolean;
};

// Avatar + name + optional designation + timestamp. Used on post headers and
// comment headers so the visual identity of a poster is consistent across
// the feed widget, the full feed page, and the forum.
export function AuthorChip({
  firstName,
  lastName,
  photoUrl,
  title,
  timestamp,
  edited,
  compact,
}: Props) {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
  const size = compact ? "h-8 w-8" : "h-10 w-10";

  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`${size} rounded-full bg-brand-100 text-brand-700 flex items-center justify-center flex-shrink-0 overflow-hidden`}>
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : initials ? (
          <span className={compact ? "text-xs font-semibold" : "text-sm font-semibold"}>{initials}</span>
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0">
        <p className={`font-medium text-gray-900 truncate ${compact ? "text-sm" : "text-sm"}`}>
          {firstName} {lastName}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {title && <span>{title}</span>}
          {title && timestamp && <span className="mx-1.5 text-gray-300">·</span>}
          {timestamp && <span>{timestamp}</span>}
          {edited && <span className="ml-1.5 text-gray-400 italic">(edited)</span>}
        </p>
      </div>
    </div>
  );
}

// Format a timestamp for the feed — "2m", "1h", "Yesterday", etc.
export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
