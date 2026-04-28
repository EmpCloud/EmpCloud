import { EmployeeAvatar } from "@/components/EmployeeAvatar";

type Props = {
  // #1650 — Photo loading is delegated to <EmployeeAvatar /> via the
  // authenticated /api/v1/employees/:id/photo endpoint. The previous
  // `photoUrl` prop was passed the raw `photo_path` value (e.g.
  // "uploads/photos/1/file.jpg"), which 404'd inside an <img src>. Pass
  // the user's id + a hasPhoto hint instead and the avatar fetches a
  // blob + objectURL on demand, cached per user via React Query.
  userId?: number | null;
  hasPhoto?: boolean;
  firstName: string;
  lastName: string;
  title?: string | null;
  timestamp?: string;
  edited?: boolean;
  compact?: boolean;
};

// Avatar + name + optional designation + timestamp. Used on post headers and
// comment headers so the visual identity of a poster is consistent across
// the feed widget, the full feed page, and the forum.
export function AuthorChip({
  userId,
  hasPhoto,
  firstName,
  lastName,
  title,
  timestamp,
  edited,
  compact,
}: Props) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <EmployeeAvatar
        userId={userId}
        hasPhoto={hasPhoto}
        firstName={firstName}
        lastName={lastName}
        size={compact ? "sm" : "md"}
      />
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
