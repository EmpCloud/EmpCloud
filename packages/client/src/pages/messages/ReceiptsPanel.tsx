// =============================================================================
// EMP CLOUD — Group message receipts popover ("Read by / Delivered to / Pending")
// =============================================================================
//
// A compact centered popover (not a full-height drawer): auto-sized to its
// content, capped in height so long member lists scroll inside the card.

import { useQuery } from "@tanstack/react-query";
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
      <span className="flex-1 truncate text-sm text-gray-800">{r.name}</span>
      {when && <span className="text-[11px] text-gray-400">{clockTime(when)}</span>}
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
  const { data, isLoading, isError } = useQuery<MessageReceiptBreakdown>({
    queryKey: ["chat-receipts", conversationId, messageId],
    queryFn: () =>
      api
        .get(`/chat/conversations/${conversationId}/messages/${messageId}/receipts`)
        .then((r) => r.data.data),
    staleTime: 10_000,
  });

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[18rem] max-h-[70vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Message info</p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-1.5">
          {isLoading ? (
            <p className="px-3 py-3 text-sm text-gray-400">Loading…</p>
          ) : isError || !data ? (
            <p className="px-3 py-3 text-sm text-red-500">Couldn't load message info.</p>
          ) : (
            <>
              <Section
                title="Read by"
                icon={<CheckCheck className="h-3.5 w-3.5 text-sky-500" />}
                people={data.read}
                tone="text-sky-600"
              />
              <Section
                title="Delivered to"
                icon={<Check className="h-3.5 w-3.5 text-gray-400" />}
                people={data.delivered}
                tone="text-gray-500"
              />
              <Section
                title="Pending"
                icon={<Clock className="h-3.5 w-3.5 text-gray-300" />}
                people={data.pending}
                tone="text-gray-400"
              />
              {data.read.length + data.delivered.length + data.pending.length === 0 && (
                <p className="px-3 py-3 text-sm text-gray-400">No other members.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
