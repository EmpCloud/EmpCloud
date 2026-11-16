// =============================================================================
// EMP CLOUD — Group message receipts popover ("Read by / Delivered to / Pending")
// =============================================================================
//
// A compact centered popover (not a full-height drawer): auto-sized to its
// content, capped in height so long member lists scroll inside the card.

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { X, CheckCheck, Check, Clock } from "lucide-react";
import type { MessageReceiptBreakdown, ChatMessageReceipt } from "@empcloud/shared";
import api from "@/api/client";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { splitName, clockTime } from "./chat-utils";

function Row({ r }: { r: ChatMessageReceipt }) {
  const { first, last } = splitName(r.name);
  const when = r.read_at ?? r.delivered_at;
  return (
    <li className="flex items-center gap-2.5 px-3 py-1.5">
      <EmployeeAvatar
        userId={r.recipient_id}
        hasPhoto={!!r.photo_path}
        firstName={first}
        lastName={last}
        size="sm"
      />
      <span className="flex-1 truncate text-[13px] text-foreground">{r.name}</span>
      {when && <span className="text-[11px] tabular-nums text-muted-foreground">{clockTime(when)}</span>}
    </li>
  );
}

function Section({
  title,
  icon,
  people,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  people: ChatMessageReceipt[];
  tone: string;
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 px-3 pt-2 pb-0.5 text-xs font-semibold ${tone}`}>
        {icon}
        {title} · {people.length}
      </div>
      <ul>
        {people.map((r) => (
          <Row key={r.recipient_id} r={r} />
        ))}
      </ul>
    </div>
  );
}

export function ReceiptsPanel({
  conversationId,
  messageId,
  onClose,
}: {
  conversationId: number;
  messageId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery<MessageReceiptBreakdown>({
    queryKey: ["chat-receipts", conversationId, messageId],
    queryFn: () =>
      api
        .get(`/chat/conversations/${conversationId}/messages/${messageId}/receipts`)
        .then((r) => r.data.data),
    staleTime: 10_000,
  });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          aria-labelledby="message-receipts-dialog-title"
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-40 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-[18rem] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <Dialog.Title asChild>
            <h2 id="message-receipts-dialog-title" className="text-sm font-semibold text-foreground">{t("receiptsPanel.header.title")}</h2>
          </Dialog.Title>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label={t("receiptsPanel.actions.close")}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-1.5">
          {isLoading ? (
            <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("receiptsPanel.state.loading")}</p>
          ) : isError || !data ? (
            <p className="px-3 py-3 text-sm text-red-500">{t("receiptsPanel.state.error")}</p>
          ) : (
            <>
              <Section
                title={t("receiptsPanel.section.readBy")}
                icon={<CheckCheck className="h-3.5 w-3.5 text-sky-500" />}
                people={data.read}
                tone="text-sky-600"
              />
              <Section
                title={t("receiptsPanel.section.deliveredTo")}
                icon={<Check className="h-3.5 w-3.5 text-muted-foreground" />}
                people={data.delivered}
                tone="text-muted-foreground"
              />
              <Section
                title={t("receiptsPanel.section.pending")}
                icon={<Clock className="h-3.5 w-3.5 text-muted-foreground/70" />}
                people={data.pending}
                tone="text-muted-foreground"
              />
              {data.read.length + data.delivered.length + data.pending.length === 0 && (
                <p className="px-3 py-3 text-[13px] text-muted-foreground">{t("receiptsPanel.state.noOtherMembers")}</p>
              )}
            </>
          )}
        </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
