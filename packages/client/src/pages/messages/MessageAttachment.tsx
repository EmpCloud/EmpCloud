// =============================================================================
// EMP CLOUD — Message Attachment renderer
// =============================================================================
//
// Renders a message's attachment inside the bubble. Images show an inline
// thumbnail that opens full-size in a new tab; other files show a compact card
// with an icon, name and size. Both fetch the file via authenticated XHR and a
// blob objectURL (the serving route needs a Bearer token, which a raw <img>/<a>
// can't send) — the same pattern EmployeeAvatar uses for photos.

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Image as ImageIcon, Download } from "lucide-react";
import type { ChatAttachment } from "@empcloud/shared";
import api from "@/api/client";
import { formatFileSize } from "./chat-utils";

// Cache the blob objectURL by attachment URL so re-renders / polling don't
// re-download the file.
function useAttachmentBlob(url: string, enabled: boolean) {
  return useQuery({
    queryKey: ["chat-attachment", url],
    queryFn: async () => {
      // The server returns a fully-qualified path ("/api/v1/chat/..."), but the
      // axios client already prefixes baseURL "/api/v1" — strip it so we don't
      // request "/api/v1/api/v1/...".
      const relative = url.replace(/^\/api\/v1/, "");
      const res = await api.get(relative, { responseType: "blob" });
      return URL.createObjectURL(res.data);
    },
    enabled,
    retry: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    throwOnError: false,
    refetchOnWindowFocus: false,
  });
}

export function MessageAttachment({
  attachment,
  mine,
  onBubble = false,
}: {
  attachment: ChatAttachment;
  mine: boolean;
  /**
   * True when this attachment sits INSIDE the sender's brand-colored bubble
   * (attachment + caption) — only then should the file card use white-on-
   * transparent styling. Attachment-only messages have NO bubble, so the card
   * must use the normal grey-on-white styling or it'd be invisible.
   */
  onBubble?: boolean;
}) {
  const { t } = useTranslation();
  // White card styling only makes sense on a colored bubble.
  const onBrand = mine && onBubble;
  const isImage = attachment.is_image;
  const { data: blobUrl, isLoading, isError } = useAttachmentBlob(
    attachment.url,
    true,
  );

  // Open the file in a new tab using the already-fetched blob (carries no token
  // in the URL, so it works without re-authenticating).
  const openBlob = () => {
    if (blobUrl) window.open(blobUrl, "_blank", "noopener,noreferrer");
  };

  if (isImage) {
    return (
      <button
        type="button"
        onClick={openBlob}
        title={attachment.name}
        className="block max-w-[260px] overflow-hidden rounded-lg border border-border bg-muted/50"
      >
        {isLoading ? (
          <div className="h-40 w-60 animate-pulse bg-muted" />
        ) : isError || !blobUrl ? (
          <div className="flex h-40 w-60 items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        ) : (
          <img
            src={blobUrl}
            alt={attachment.name}
            className="max-h-64 w-full object-cover"
          />
        )}
      </button>
    );
  }

  // Non-image file card. When standalone (no brand bubble), use grey-on-white
  // so it's visible on the page background.
  return (
    <button
      type="button"
      onClick={openBlob}
      disabled={!blobUrl}
      title={t("messageAttachment.card.openTitle", { name: attachment.name })}
      className={`flex max-w-[260px] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        onBrand
          ? "border-white/30 bg-white/10 hover:bg-white/20"
          : "border-border bg-card shadow-sm hover:bg-muted/70"
      }`}
    >
      <div
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
          onBrand ? "bg-white/20 text-white" : "bg-brand-50 text-brand-600"
        }`}
      >
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13px] font-medium ${onBrand ? "text-white" : "text-foreground"}`}
        >
          {attachment.name}
        </p>
        <p className={`text-[11px] tabular-nums ${onBrand ? "text-white/70" : "text-muted-foreground"}`}>
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <Download
        className={`h-4 w-4 flex-shrink-0 ${onBrand ? "text-white/80" : "text-muted-foreground"}`}
      />
    </button>
  );
}
