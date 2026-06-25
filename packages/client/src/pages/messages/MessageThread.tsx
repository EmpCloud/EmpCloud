// =============================================================================
// EMP CLOUD — Message Thread (right pane)
// =============================================================================
//
// Renders the open conversation: header, the scrollable message list and a
// composer. Messages are polled every ~3s while the thread is open. Whenever
// the newest message changes we mark the conversation read (POST .../read)
// so the sidebar unread badge clears.

import { useEffect, useLayoutEffect, useRef, useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatMessage, ConversationSummary } from "@empcloud/shared";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { showToast } from "@/components/ui/Toast";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { GroupAvatar } from "./GroupAvatar";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { MessageAttachment } from "./MessageAttachment";
import { MessageTick as TickGlyph } from "./MessageTicks";
import { ReceiptsPanel } from "./ReceiptsPanel";
import { EmojiPicker } from "./EmojiPicker";
import { ReactionPills, ReactionPicker } from "./MessageReactions";
import { AddMembersModal } from "./AddMembersModal";
import { ForwardModal } from "./ForwardModal";
import { MessageContextMenu } from "./MessageContextMenu";
import { useChatSocket } from "@/realtime/SocketProvider";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Send,
  Trash2,
  X,
  ChevronRight,
  UserMinus,
  UserPlus,
  LogOut,
  Forward,
  Paperclip,
  FileText,
  Smile,
  SmilePlus,
  Pencil,
  Check,
  Reply,
  ChevronDown,
  Bell,
  BellOff,
  Pin,
  Archive,
  ArchiveRestore,
  Search,
  Bookmark,
} from "lucide-react";
import {
  splitName,
  clockTime,
  dayLabel,
  formatFileSize,
  emojiOnlyCount,
  lastSeenLabel,
} from "./chat-utils";
import {
  getMentionQuery,
  mentionCandidates,
  findMentionsInBody,
  type MentionTarget,
} from "./mentions";
import { renderWithMentions } from "./renderMentions";

// A short client-side nonce for optimistic-send reconciliation. Date/random
// aren't available in workflow scripts but are fine in the browser.
function makeClientMsgId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Keep in sync with the server's chat-upload limit (10 MB).
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const PAGE_SIZE = 30;
// Mirror the server's body cap (sendMessageSchema.body.max) so the composer can
// warn before a send is rejected.
const MAX_MESSAGE_CHARS = 5000;

// Merge a freshly-polled latest page into the existing thread cache WITHOUT
// dropping older pages the user has scrolled back to load. Union by id; keep
// chronological order; preserve optimistic temp rows (negative ids) not yet
// superseded by a real message with the same client_msg_id.
function mergeLatest(existing: ChatMessage[] | undefined, latest: ChatMessage[]): ChatMessage[] {
  if (!existing || existing.length === 0) return latest;
  const latestIds = new Set(latest.map((m) => m.id));
  const latestClientIds = new Set(latest.map((m) => m.client_msg_id).filter(Boolean));
  // Keep older messages (below the latest window) + any optimistic temp rows.
  const kept = existing.filter((m) => {
    if (latestIds.has(m.id)) return false; // superseded by the fresh copy
    if (m.id < 0 && m.client_msg_id && latestClientIds.has(m.client_msg_id)) return false;
    return true;
  });
  const merged = [...kept, ...latest];
  merged.sort((a, b) => {
    // Real messages sort by id; temp rows (negative) sort after by created_at.
    if (a.id > 0 && b.id > 0) return a.id - b.id;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  return merged;
}

function useMessages(conversationId: number) {
  return useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", conversationId],
    queryFn: ({ client }) =>
      api
        .get(`/chat/conversations/${conversationId}/messages`, { params: { limit: PAGE_SIZE } })
        .then((r) => {
          const latest: ChatMessage[] = r.data.data;
          const existing = client.getQueryData<ChatMessage[]>(["chat-messages", conversationId]);
          return mergeLatest(existing, latest);
        }),
    refetchInterval: 3000, // poll the open thread for new messages
    refetchOnWindowFocus: true,
  });
}

export default function MessageThread({
  conversationId,
  conversation,
  onBack,
}: {
  conversationId: number;
  conversation: ConversationSummary | null;
  onBack?: () => void;
}) {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: messages, isLoading, isError } = useMessages(conversationId);
  // Per-conversation draft persistence: an unsent message survives switching
  // chats / reloading. Keyed by conversation id in localStorage.
  const draftKey = `empcloud-chat-draft:${conversationId}`;
  const [draft, setDraft] = useState<string>(() => {
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    try {
      if (draft.trim()) localStorage.setItem(draftKey, draft);
      else localStorage.removeItem(draftKey);
    } catch {
      /* storage unavailable — non-critical */
    }
  }, [draft, draftKey]);
  const [sending, setSending] = useState(false);
  // Staged attachment (chosen but not yet sent) + a preview objectURL for images.
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  // Extra files queued behind the staged one — sent one-per-message after it.
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  // Inline group-name editing (in the members panel header).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Member pending removal-confirmation (drives the ConfirmDialog), and the
  // in-flight flag while the DELETE request runs.
  const [pendingRemove, setPendingRemove] = useState<{ id: number; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  // Which of my group messages has its receipts panel open (null = closed).
  const [receiptsForId, setReceiptsForId] = useState<number | null>(null);

  // @-mention autocomplete state.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ query: string; atIndex: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);
  // Inline message editing: which message is being edited + its draft text.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // The message currently being replied to (drives the composer reply chip).
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const {
    connected,
    openConversation,
    closeConversation,
    markRead: socketMarkRead,
    emitTyping,
    typingNames,
    fetchPresence,
    presenceOf,
  } = useChatSocket();
  const typers = typingNames(conversationId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<number>(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const bottomVisibleRef = useRef<boolean>(true);
  // The user's read marker FROZEN at the moment they opened this conversation —
  // drives the "unread messages" divider + scroll-to-first-unread. We freeze it
  // so the divider doesn't jump as we incrementally mark messages read.
  const [unreadAnchor, setUnreadAnchor] = useState<number | null>(null);
  // Highest message id the user has actually scrolled into view — the read
  // marker only advances to here, so reading 10 of 60 leaves 50 unread.
  const highestSeenRef = useRef<number>(0);
  const didInitialUnreadScrollRef = useRef(false);
  // Whether we've already frozen the anchor for THIS conversation. Lets us wait
  // until the conversation summary has actually loaded (it's null on reload /
  // deep-link) before freezing, so we never freeze the anchor to a stale 0.
  const didFreezeAnchorRef = useRef(false);
  // The frozen "first unread" message id for the divider (frozen once per open
  // so it doesn't jump as messages stream in / older pages prepend).
  const [firstUnreadId, setFirstUnreadId] = useState<number | null>(null);
  const didSetUnreadDividerRef = useRef(false);
  // Whether the user was at/near the bottom on the LAST scroll event — sampled
  // continuously by onScroll, BEFORE any new message re-renders and changes
  // scrollHeight. The auto-scroll effect reads this (not a post-render
  // measurement) to decide whether to follow new messages down.
  const wasNearBottomRef = useRef<boolean>(true);
  // Jump-to-bottom: shown when the user has scrolled up away from the newest
  // message. Tracks how many new messages arrived while scrolled away.
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  // Typing-indicator emit throttle: only re-emit "start" every ~2s, and emit
  // "stop" ~2.5s after the last keystroke.
  const typingActiveRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // History pagination: load older pages on back-scroll via the `before` cursor.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const loadingOlderRef = useRef(false);

  const isGroup = conversation?.type === "group";
  // Only the group creator may manage (remove) members.
  const isOwner = isGroup && !!me && conversation?.created_by === me.id;

  // ---- @-mention autocomplete (group chats only) ----
  const mentionItems: MentionTarget[] = useMemo(() => {
    if (!isGroup || !mention || !conversation) return [];
    return mentionCandidates(conversation.participants, me?.id, mention.query);
  }, [isGroup, mention, conversation, me?.id]);

  // Recompute the mention context from the textarea's current value + caret.
  const updateMentionContext = (value: string, caret: number) => {
    if (!isGroup) {
      setMention(null);
      return;
    }
    const ctx = getMentionQuery(value, caret);
    // Only reset the highlighted index when the @query actually changes —
    // otherwise arrow-key navigation gets clobbered by the keyup/click events
    // that re-run this with the same query and would snap the index back to 0.
    const queryChanged = mention?.query !== ctx?.query;
    setMention(ctx);
    if (queryChanged) setMentionIndex(0);
  };

  // Re-send "typing:start" at most this often while the user keeps typing, so a
  // peer who joins the room slightly late (or briefly missed an event) still
  // sees the indicator. The receiver self-expires after 6s, so this keeps it
  // alive during continuous typing without spamming.
  const lastTypingEmitRef = useRef(0);

  // Signal typing on keystroke (re-emit periodically, auto-stop after idle).
  const signalTyping = () => {
    const now = Date.now();
    if (!typingActiveRef.current || now - lastTypingEmitRef.current > 3000) {
      typingActiveRef.current = true;
      lastTypingEmitRef.current = now;
      emitTyping(conversationId, true);
    }
    // Auto-stop a few seconds after the last keystroke.
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      typingActiveRef.current = false;
      emitTyping(conversationId, false);
    }, 4000);
  };

  const stopTyping = () => {
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      emitTyping(conversationId, false);
    }
  };

  // Stop typing when leaving/switching the conversation.
  useEffect(() => {
    return () => {
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        emitTyping(conversationId, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Auto-grow the composer to fit its content (capped by the textarea's
  // max-height; it scrolls beyond that). Runs on every draft change, including
  // programmatic edits (mention insert, emoji, reset after send).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  const onDraftChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft(value);
    updateMentionContext(value, e.target.selectionStart ?? value.length);
    if (value.trim()) signalTyping();
    else stopTyping();
  };

  // Insert the picked mention, replacing the in-progress "@query" with "@token ".
  const pickMention = (target: MentionTarget) => {
    if (!mention) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, mention.atIndex);
    const after = draft.slice(caret);
    const inserted = `@${target.token} `;
    const next = before + inserted + after;
    setDraft(next);
    setMention(null);
    // Restore caret right after the inserted token.
    const newCaret = (before + inserted).length;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  // Insert an emoji at the caret (or append).
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    const caret = start + emoji.length;
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(caret, caret);
      }
    });
  };

  // Resolve the final body's @tags to user ids by matching full participant
  // names (and @everyone) still present in the text. @everyone supersedes.
  const resolveMentionIds = (body: string): number[] => {
    if (!isGroup || !conversation) return [];
    const ids = findMentionsInBody(body, conversation.participants);
    if (ids.has(0)) return [0];
    return [...ids];
  };

  // Distance from the bottom under which we consider the user "at the bottom"
  // and keep the view pinned as new messages arrive.
  const NEAR_BOTTOM_PX = 120;
  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };
  const scrollToBottom = (smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    wasNearBottomRef.current = true; // we're now pinned to the bottom
    setShowJumpToBottom(false);
    setMissedCount(0);
  };

  // Scroll to a message by id (used by clickable reply-quotes) and flash it.
  // The target may not be loaded yet (it's older than the current page) — in
  // that case we just inform the user rather than scroll nowhere.
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const jumpToMessage = (messageId: number) => {
    const node = scrollRef.current?.querySelector(`[data-msg-id="${messageId}"]`);
    if (!node) {
      showToast("info", "That message isn't loaded — scroll up to load older messages.");
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(messageId);
    window.setTimeout(() => setHighlightedId((cur) => (cur === messageId ? null : cur)), 1600);
  };

  // Deep-link: when the URL carries ?m=<id> (a copied message link), jump to and
  // flash that message once it's in view, then strip the param so a refresh
  // doesn't re-jump.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    const target = Number(searchParams.get("m"));
    if (!target || deepLinkHandledRef.current || !messages || messages.length === 0) return;
    const exists = messages.some((m) => m.id === target);
    if (!exists) return;
    deepLinkHandledRef.current = true;
    // Defer to after paint so the node is mounted.
    requestAnimationFrame(() => jumpToMessage(target));
    const next = new URLSearchParams(searchParams);
    next.delete("m");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, searchParams]);

  // Auto-scroll on new messages ONLY when the user was already near the bottom
  // BEFORE the message arrived (sampled by onScroll into wasNearBottomRef). If
  // they've scrolled up to read history, don't yank them down — instead show a
  // "jump to bottom" pill and count the messages they haven't seen.
  const newestId = messages && messages.length > 0 ? messages[messages.length - 1].id : 0;
  const newestMine =
    messages && messages.length > 0 ? messages[messages.length - 1].is_mine : false;
  // Screen-reader announcement for the newest RECEIVED message (own sends are
  // not announced — the user just typed them). Polite so it doesn't interrupt.
  const [srAnnounce, setSrAnnounce] = useState("");
  useEffect(() => {
    if (!newestId || newestMine || !messages) return;
    const last = messages[messages.length - 1];
    if (last.is_deleted || last.is_system) return;
    const who = last.sender_name || "Someone";
    const what = last.body || (last.attachment ? "sent an attachment" : "");
    setSrAnnounce(`${who}: ${what}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  useEffect(() => {
    if (!newestId) return;
    // Follow the bottom if the user was already there, or this is our OWN send.
    if (wasNearBottomRef.current || newestMine) {
      scrollToBottom();
    } else {
      setShowJumpToBottom(true);
      setMissedCount((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  // Keep the typing indicator visible: when someone starts typing and the user
  // is already at the bottom, scroll the new bubble into view (don't yank them
  // if they're reading history).
  const typingCount = typers.length;
  useEffect(() => {
    if (typingCount > 0 && wasNearBottomRef.current) scrollToBottom(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingCount]);

  // On conversation switch: reset unread tracking (the anchor is (re)frozen by
  // the effect below, once the conversation summary is actually available).
  useEffect(() => {
    didInitialUnreadScrollRef.current = false;
    didFreezeAnchorRef.current = false;
    didSetUnreadDividerRef.current = false;
    highestSeenRef.current = 0;
    setUnreadAnchor(null);
    setFirstUnreadId(null);
  }, [conversationId]);

  // Freeze the read anchor from the conversation summary — but only the FIRST
  // time the summary is available for this conversation. On a hard reload /
  // deep-link `conversation` is null until the conversations query resolves; if
  // we froze then we'd lock the anchor to 0 and the whole thread would look
  // unread. Waiting until conversation != null fixes that.
  useEffect(() => {
    if (didFreezeAnchorRef.current || !conversation) return;
    didFreezeAnchorRef.current = true;
    const anchor = conversation.my_last_read_id ?? 0;
    highestSeenRef.current = anchor;
    setUnreadAnchor(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.my_last_read_id, conversation]);

  // Resolve & freeze the first-unread divider (declared above). Frozen the first
  // time it resolves per open so the divider doesn't jump as messages stream in.
  useEffect(() => {
    if (didSetUnreadDividerRef.current || !messages || unreadAnchor == null) return;
    const real = messages.filter((x) => x.id > 0);
    const newest = real.length ? real[real.length - 1].id : 0;
    if (newest <= unreadAnchor) {
      // Everything loaded is already read → no divider.
      didSetUnreadDividerRef.current = true;
      setFirstUnreadId(null);
      return;
    }
    const firstUnread = real.find((x) => x.id > unreadAnchor && !x.is_mine);
    const oldest = real.length ? real[0].id : 0;
    // If the first unread we found is also the OLDEST loaded message and the
    // anchor is below it, the true first-unread may be on an older (unloaded)
    // page — load more before placing the divider, up to the start.
    const mayHaveOlderUnread = oldest > unreadAnchor && !reachedStart;
    if (firstUnread && firstUnread.id !== oldest) {
      didSetUnreadDividerRef.current = true;
      setFirstUnreadId(firstUnread.id);
    } else if (mayHaveOlderUnread) {
      loadOlder(); // fetch the previous page; this effect re-runs with more loaded
    } else if (firstUnread) {
      // Oldest loaded IS the first unread and we've reached the start.
      didSetUnreadDividerRef.current = true;
      setFirstUnreadId(firstUnread.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, unreadAnchor, reachedStart]);

  // Once BOTH the messages and the frozen anchor are ready for a freshly-opened
  // conversation, land on the first unread message (so a 60-unread chat starts
  // at #1 unread, not the bottom). If everything is read, land at the bottom.
  // Waiting for unreadAnchor (frozen from the loaded summary) avoids a premature
  // scroll-to-bottom while the summary is still loading.
  useEffect(() => {
    if (
      didInitialUnreadScrollRef.current ||
      !messages ||
      messages.length === 0 ||
      unreadAnchor == null
    )
      return;
    didInitialUnreadScrollRef.current = true;
    if (firstUnreadId) {
      requestAnimationFrame(() => {
        const node = scrollRef.current?.querySelector(`[data-msg-id="${firstUnreadId}"]`);
        if (node) node.scrollIntoView({ block: "start" });
        else scrollToBottom();
      });
    } else {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, firstUnreadId]);

  // Reset pagination when switching conversations.
  useEffect(() => {
    setReachedStart(false);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
  }, [conversationId]);

  // Load the previous page of messages (older than the oldest one loaded),
  // preserving the scroll position so the view doesn't jump.
  const loadOlder = async () => {
    if (loadingOlderRef.current || reachedStart) return;
    const current = qc.getQueryData<ChatMessage[]>(["chat-messages", conversationId]);
    const oldest = current?.find((m) => m.id > 0); // first real (non-temp) message
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await api.get(`/chat/conversations/${conversationId}/messages`, {
        params: { before: oldest.id, limit: PAGE_SIZE },
      });
      const older: ChatMessage[] = res.data.data;
      if (older.length < PAGE_SIZE) setReachedStart(true);
      if (older.length > 0) {
        qc.setQueryData<ChatMessage[]>(["chat-messages", conversationId], (old) => {
          const existing = old ?? [];
          const existingIds = new Set(existing.map((m) => m.id));
          const fresh = older.filter((m) => !existingIds.has(m.id));
          return [...fresh, ...existing];
        });
        // Keep the viewport anchored: restore the distance from the bottom.
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight + el.scrollTop;
        });
      }
    } catch {
      /* non-critical — user can retry by scrolling again */
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop < 80) loadOlder();
    // Continuously sample "is the user at the bottom" so the auto-scroll effect
    // can decide whether to follow a new message WITHOUT re-measuring after the
    // DOM has already grown.
    const near = isNearBottom();
    wasNearBottomRef.current = near;
    // Hide the jump-to-bottom pill once the user reaches the bottom again.
    if (near && showJumpToBottom) {
      setShowJumpToBottom(false);
      setMissedCount(0);
    }
  };

  // Join/leave the conversation's socket room (server auto-marks delivered on
  // open). Re-runs when the conversation changes.
  useEffect(() => {
    openConversation(conversationId);
    return () => closeConversation(conversationId);
  }, [conversationId, openConversation, closeConversation]);

  // Fetch presence for the other participants when the conversation opens.
  useEffect(() => {
    if (!conversation) return;
    const others = conversation.participants
      .map((p) => p.user_id)
      .filter((id) => id !== me?.id);
    if (others.length) fetchPresence(others);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.participants.length]);

  // For direct chats, the counterpart's live presence (drives the header line).
  const counterpartPresence =
    !isGroup && conversation?.counterpart
      ? presenceOf(conversation.counterpart.user_id)
      : undefined;

  // Track the bottom sentinel's visibility (still used to decide whether to
  // auto-follow new messages) AND, via a per-message observer, the HIGHEST
  // message id the user has actually scrolled into view. Read only advances to
  // that id — so reading 10 of 60 leaves the other 50 unread.
  useEffect(() => {
    const el = bottomRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        bottomVisibleRef.current = entries[0]?.isIntersecting ?? false;
        if (bottomVisibleRef.current) maybeMarkRead();
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Per-message observer: bump highestSeenRef as real messages scroll into view,
  // then mark read up to there.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const rootTop = root.getBoundingClientRect().top;
    const obs = new IntersectionObserver(
      (entries) => {
        let bumped = false;
        for (const e of entries) {
          // Count a message as "seen" if it's visibly in view OR has scrolled
          // up past the top of the viewport (fully read past). The latter
          // ensures a TALL message that never reaches a high visibility ratio
          // still advances the read marker.
          const scrolledAbove = e.boundingClientRect.bottom <= rootTop + 1;
          if (!e.isIntersecting && !scrolledAbove) continue;
          const id = Number((e.target as HTMLElement).dataset.msgId);
          if (id > 0 && id > highestSeenRef.current) {
            highestSeenRef.current = id;
            bumped = true;
          }
        }
        if (bumped) maybeMarkReadRef.current();
      },
      { root, threshold: 0.1 },
    );
    root.querySelectorAll("[data-msg-id]").forEach((n) => obs.observe(n));
    return () => obs.disconnect();
    // Re-observe when the message set changes (new page loaded / new message).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages?.length]);

  // Mark read up to the HIGHEST message actually seen (not the newest in the
  // thread) — only when the tab is visible. Prefer the socket; fall back to REST.
  const maybeMarkRead = () => {
    const upTo = highestSeenRef.current;
    if (!upTo || upTo <= lastReadRef.current) return;
    if (document.visibilityState !== "visible") return;
    lastReadRef.current = upTo;
    if (connected) {
      socketMarkRead(conversationId, upTo);
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    } else {
      api
        .post(`/chat/conversations/${conversationId}/read`, { last_read_message_id: upTo })
        .then(() => qc.invalidateQueries({ queryKey: ["chat-conversations"] }))
        .catch(() => {
          /* non-critical — badge clears on next successful read */
        });
    }
  };
  // Keep a live ref so observer callbacks (created with stale closures) always
  // call the latest maybeMarkRead — picks up `connected` flips, etc.
  const maybeMarkReadRef = useRef(maybeMarkRead);
  maybeMarkReadRef.current = maybeMarkRead;

  // Re-evaluate read on new messages, focus, and visibility changes.
  useEffect(() => {
    maybeMarkRead();
    const onVis = () => maybeMarkRead();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId, conversationId, connected]);

  // Release the image preview objectURL when the staged file changes/unmounts.
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  // Stage one or more files: the first (if none staged) gets the live preview;
  // the rest queue and send one-per-message after it.
  const stageFiles = (picked: File[]) => {
    const ok = picked.filter((f) => {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        showToast("error", `"${f.name}" is larger than 10 MB.`);
        return false;
      }
      return true;
    });
    if (ok.length === 0) return;
    let rest = ok;
    if (!file) {
      const [first, ...more] = ok;
      if (filePreview) URL.revokeObjectURL(filePreview);
      setFile(first);
      setFilePreview(first.type.startsWith("image/") ? URL.createObjectURL(first) : null);
      rest = more;
    }
    if (rest.length) setQueuedFiles((q) => [...q, ...rest]);
  };

  const clearFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag-and-drop onto the thread + paste-image into the composer.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length) stageFiles(dropped);
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (imgs.length) {
      e.preventDefault();
      stageFiles(imgs);
    }
  };

  // Insert/replace/patch a message in the thread cache (optimistic helpers).
  const patchCache = (fn: (old: ChatMessage[]) => ChatMessage[]) =>
    qc.setQueryData<ChatMessage[]>(["chat-messages", conversationId], (old) => fn(old ?? []));

  const handleSend = async () => {
    const body = draft.trim();
    if ((!body && !file) || sending) return;
    if (body.length > MAX_MESSAGE_CHARS) {
      showToast("error", `Message is too long (max ${MAX_MESSAGE_CHARS} characters).`);
      return;
    }
    setSending(true);
    const stagedFile = file;
    const clientMsgId = makeClientMsgId();
    const mentionIds = isGroup ? resolveMentionIds(body) : [];
    const replyId = replyTo?.id && replyTo.id > 0 ? replyTo.id : null;
    const replySnapshot = replyTo;
    setMention(null);
    setReplyTo(null);
    stopTyping();

    // Optimistic temp bubble (negative id, tick "sending"). Attachments can't be
    // previewed optimistically here (the served URL needs the saved id), so a
    // staged file shows as a plain "sending" bubble until the server responds.
    const tempId = -Date.now();
    const optimistic: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: me?.id ?? 0,
      sender_name: me ? `${me.first_name} ${me.last_name}` : "You",
      body: body || (stagedFile ? stagedFile.name : ""),
      is_deleted: false,
      is_mine: true,
      attachment: null,
      tick_status: "sending",
      client_msg_id: clientMsgId,
      mentioned_user_ids: mentionIds,
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            sender_name: replySnapshot.sender_name,
            body: replySnapshot.body.slice(0, 120),
            has_attachment: !!replySnapshot.attachment,
            is_deleted: replySnapshot.is_deleted,
          }
        : null,
      created_at: new Date().toISOString(),
      edited_at: null,
    };
    patchCache((old) => [...old, optimistic]);
    setDraft("");

    try {
      let saved: ChatMessage;
      if (stagedFile) {
        const form = new FormData();
        form.append("file", stagedFile);
        if (body) form.append("body", body);
        form.append("client_msg_id", clientMsgId);
        if (mentionIds.length) form.append("mentioned_user_ids", JSON.stringify(mentionIds));
        if (replyId) form.append("reply_to_message_id", String(replyId));
        const res = await api.post(
          `/chat/conversations/${conversationId}/messages/attachment`,
          form,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        saved = res.data.data;
        clearFile();
      } else {
        const res = await api.post(`/chat/conversations/${conversationId}/messages`, {
          body,
          client_msg_id: clientMsgId,
          ...(mentionIds.length ? { mentioned_user_ids: mentionIds } : {}),
          ...(replyId ? { reply_to_message_id: replyId } : {}),
        });
        saved = res.data.data;
      }
      // Replace the temp bubble with the saved message (dedupe against the
      // socket echo, which may have already arrived).
      patchCache((old) => {
        const withoutTemp = old.filter(
          (m) => m.client_msg_id !== clientMsgId || m.id === saved.id,
        );
        if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
        return [...withoutTemp.filter((m) => m.id !== tempId), saved];
      });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    } catch {
      // Mark the optimistic bubble failed (with retry), keep the text recoverable.
      patchCache((old) =>
        old.map((m) => (m.id === tempId ? { ...m, tick_status: "failed" } : m)),
      );
      showToast("error", "Couldn't send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Send a queued file directly (its own message), independent of composer
  // state — used to drain the queue after the staged file is sent. Returns when
  // the upload settles (success or failure is non-fatal to the batch).
  const sendQueuedFile = async (f: File) => {
    const clientMsgId = makeClientMsgId();
    const tempId = -Date.now() - Math.floor(performance.now());
    const optimistic: ChatMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: me?.id ?? 0,
      sender_name: me ? `${me.first_name} ${me.last_name}` : "You",
      body: f.name,
      is_deleted: false,
      is_mine: true,
      attachment: null,
      tick_status: "sending",
      client_msg_id: clientMsgId,
      mentioned_user_ids: [],
      reply_to: null,
      created_at: new Date().toISOString(),
      edited_at: null,
    };
    patchCache((old) => [...old, optimistic]);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("client_msg_id", clientMsgId);
      const res = await api.post(
        `/chat/conversations/${conversationId}/messages/attachment`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      const saved: ChatMessage = res.data.data;
      patchCache((old) => {
        const withoutTemp = old.filter((m) => m.client_msg_id !== clientMsgId || m.id === saved.id);
        if (withoutTemp.some((m) => m.id === saved.id)) return withoutTemp;
        return [...withoutTemp.filter((m) => m.id !== tempId), saved];
      });
    } catch {
      patchCache((old) =>
        old.map((m) => (m.id === tempId ? { ...m, tick_status: "failed" } : m)),
      );
    }
  };

  // Drain the queued files sequentially (one message each) once the composer is
  // free and nothing is staged. Runs them through sendQueuedFile so there's no
  // stale-closure dependency on the main send path.
  const drainingRef = useRef(false);
  useEffect(() => {
    if (sending || file || queuedFiles.length === 0 || drainingRef.current) return;
    drainingRef.current = true;
    const batch = queuedFiles;
    setQueuedFiles([]);
    (async () => {
      for (const f of batch) {
        // eslint-disable-next-line no-await-in-loop
        await sendQueuedFile(f);
      }
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      drainingRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending, file, queuedFiles]);

  // Retry a failed optimistic message: drop it and restore its text to the draft.
  const handleRetry = (failed: ChatMessage) => {
    patchCache((old) => old.filter((m) => m.id !== failed.id));
    setDraft(failed.body);
  };

  // In-thread search (header search box). Results jump to the matched message.
  const [searchOpen, setSearchOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState("");
  const { data: threadHits } = useQuery<
    { message_id: number; body: string; created_at: string }[]
  >({
    queryKey: ["chat-thread-search", conversationId, threadQuery.trim()],
    queryFn: () =>
      api
        .get("/chat/search", {
          params: { q: threadQuery.trim(), conversation_id: conversationId, limit: 25 },
        })
        .then((r) => r.data.data),
    enabled: searchOpen && threadQuery.trim().length >= 2,
    staleTime: 5_000,
  });

  // Pinned messages bar (top of the thread).
  const { data: pinnedMessages } = useQuery<ChatMessage[]>({
    queryKey: ["chat-pinned", conversationId],
    queryFn: () =>
      api.get(`/chat/conversations/${conversationId}/pinned`).then((r) => r.data.data),
    staleTime: 30_000,
  });
  const handleTogglePin = async (msg: ChatMessage) => {
    const next = !msg.is_pinned;
    try {
      await api.post(`/chat/conversations/${conversationId}/messages/${msg.id}/pin`, {
        pinned: next,
      });
      await qc.invalidateQueries({ queryKey: ["chat-pinned", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      showToast("success", next ? "Message pinned." : "Message unpinned.");
    } catch {
      showToast("error", "Couldn't update the pin. Please try again.");
    }
  };

  // Which message's quick reaction-picker is open (null = none).
  const [reactPickerFor, setReactPickerFor] = useState<number | null>(null);
  // Messages to forward (drives the ForwardModal; empty = closed).
  const [forwardMsgs, setForwardMsgs] = useState<ChatMessage[]>([]);
  // Multi-select mode: a Set of selected message ids (empty + inactive = off).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const enterSelectMode = (msg: ChatMessage) => {
    setSelectMode(true);
    setSelectedIds(new Set([msg.id]));
  };
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  // Leave select mode when switching conversations.
  useEffect(() => {
    exitSelectMode();
  }, [conversationId]);
  // Right-click context menu: position + the target message (null = closed).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msg: ChatMessage } | null>(
    null,
  );

  // Global Escape: close the top-most open overlay so keyboard users aren't
  // trapped. Order = most transient first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showEmoji) return setShowEmoji(false);
      if (contextMenu) return setContextMenu(null);
      if (receiptsForId !== null) return setReceiptsForId(null);
      if (showAddMembers) return setShowAddMembers(false);
      if (showMembers) return setShowMembers(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openContextMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    if (msg.is_deleted || msg.id < 0) return; // no menu on deleted/optimistic
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  };

  // Long-press to open the message menu on touch devices (no right-click there).
  // A ~500ms hold without moving opens the menu at the touch point.
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const onTouchStartMsg = (e: React.TouchEvent, msg: ChatMessage) => {
    if (selectMode || msg.is_deleted || msg.id < 0) return;
    longPressFired.current = false;
    const t = e.touches[0];
    const x = t.clientX;
    const y = t.clientY;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      // Haptic nudge where supported.
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      setContextMenu({ x, y, msg });
    }, 500);
  };

  // Toggle an emoji reaction on a message, optimistically. The server's
  // reaction:update socket event (and the response) reconcile the true tally.
  const handleToggleReaction = async (msg: ChatMessage, emoji: string) => {
    setReactPickerFor(null);
    // Optimistic: flip my reaction locally.
    patchCache((old) =>
      old.map((m) => {
        if (m.id !== msg.id) return m;
        const reactions = [...(m.reactions ?? [])];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const r = reactions[idx];
          if (r.reacted) {
            const count = r.count - 1;
            if (count <= 0) reactions.splice(idx, 1);
            else reactions[idx] = { ...r, count, reacted: false };
          } else {
            reactions[idx] = { ...r, count: r.count + 1, reacted: true };
          }
        } else {
          reactions.push({ emoji, count: 1, reacted: true, names: [] });
        }
        return { ...m, reactions };
      }),
    );
    try {
      await api.post(
        `/chat/conversations/${conversationId}/messages/${msg.id}/reactions`,
        { emoji },
      );
    } catch {
      showToast("error", "Couldn't update your reaction.");
      // Re-fetch to undo the optimistic change on failure.
      qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the mention dropdown is open, the arrow/enter/tab/escape keys drive
    // it instead of the textarea.
    if (mention && mentionItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionItems.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionItems[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDelete = async (messageId: number) => {
    setDeletingId(messageId);
    try {
      await api.delete(`/chat/conversations/${conversationId}/messages/${messageId}`);
      await qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    } catch {
      showToast("error", "Couldn't delete the message.");
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk delete the selected messages (own, non-deleted only — others are
  // silently skipped since the server would reject them anyway).
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const deletableSelected = (messages ?? []).filter(
    (m) => selectedIds.has(m.id) && m.is_mine && !m.is_deleted && m.id > 0,
  );
  const handleBulkDelete = async () => {
    if (deletableSelected.length === 0) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        deletableSelected.map((m) =>
          api.delete(`/chat/conversations/${conversationId}/messages/${m.id}`),
        ),
      );
      await qc.invalidateQueries({ queryKey: ["chat-messages", conversationId] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast(
        "success",
        `Deleted ${deletableSelected.length} message${deletableSelected.length > 1 ? "s" : ""}.`,
      );
      setConfirmBulkDelete(false);
      exitSelectMode();
    } catch {
      showToast("error", "Couldn't delete some messages. Please try again.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const startEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditDraft(msg.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (msg: ChatMessage) => {
    const body = editDraft.trim();
    if (!body) {
      // Empty edit on a text-only message = nothing to save; just cancel.
      if (!msg.attachment) return cancelEdit();
    }
    if (body === msg.body) return cancelEdit(); // no change
    setSavingEdit(true);
    const mentionIds = isGroup ? resolveMentionIds(body) : [];
    try {
      const res = await api.patch(
        `/chat/conversations/${conversationId}/messages/${msg.id}`,
        { body, ...(mentionIds.length ? { mentioned_user_ids: mentionIds } : {}) },
      );
      const updated: ChatMessage = res.data.data;
      patchCache((old) =>
        old.map((m) =>
          m.id === msg.id ? { ...updated, is_mine: true, tick_status: m.tick_status } : m,
        ),
      );
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      cancelEdit();
    } catch {
      showToast("error", "Couldn't save your edit. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!pendingRemove) return;
    const { id: memberId, name: memberName } = pendingRemove;
    setRemoving(true);
    try {
      await api.delete(`/chat/conversations/${conversationId}/members/${memberId}`);
      // The participant list lives on the conversation summary, which the page
      // sources from the ["chat-conversations"] list — invalidating it refreshes
      // both the members panel and the sidebar member count.
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", `${memberName} was removed from the group.`);
      setPendingRemove(null);
    } catch {
      showToast("error", "Couldn't remove the member. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await api.post(`/chat/conversations/${conversationId}/leave`);
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", "You left the group.");
      setConfirmLeave(false);
      setShowMembers(false);
      navigate("/messages"); // we no longer have access to this conversation
    } catch {
      showToast("error", "Couldn't leave the group. Please try again.");
    } finally {
      setLeaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    setDeletingGroup(true);
    try {
      await api.delete(`/chat/conversations/${conversationId}`);
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", "Group deleted.");
      setConfirmDeleteGroup(false);
      setShowMembers(false);
      navigate("/messages");
    } catch {
      showToast("error", "Couldn't delete the group. Please try again.");
    } finally {
      setDeletingGroup(false);
    }
  };

  // Refresh the conversation after adding members.
  const handleMembersAdded = () => {
    setShowAddMembers(false);
    qc.invalidateQueries({ queryKey: ["chat-conversations"] });
  };

  const startRename = () => {
    setNameDraft(conversation?.title ?? "");
    setEditingName(true);
  };
  const handleRename = async () => {
    const name = nameDraft.trim();
    if (!name || name === conversation?.title) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await api.patch(`/chat/conversations/${conversationId}`, { name });
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", "Group renamed.");
      setEditingName(false);
    } catch {
      showToast("error", "Couldn't rename the group. Please try again.");
    } finally {
      setSavingName(false);
    }
  };

  // Group description editing (admin only, in the members panel).
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const startEditDesc = () => {
    setDescDraft(conversation?.description ?? "");
    setEditingDesc(true);
  };
  const handleSaveDesc = async () => {
    setSavingDesc(true);
    try {
      await api.patch(`/chat/conversations/${conversationId}/description`, {
        description: descDraft.trim(),
      });
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", "Description updated.");
      setEditingDesc(false);
    } catch {
      showToast("error", "Couldn't update the description.");
    } finally {
      setSavingDesc(false);
    }
  };

  // Group avatar upload (admin only).
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const handleAvatarPick = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      showToast("error", "Group photo must be an image.");
      return;
    }
    const form = new FormData();
    form.append("file", f);
    try {
      await api.post(`/chat/conversations/${conversationId}/avatar`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      // The serving URL is stable, so bust the cached avatar blob to show the
      // new image immediately.
      qc.invalidateQueries({ queryKey: ["chat-group-avatar"] });
      showToast("success", "Group photo updated.");
    } catch {
      showToast("error", "Couldn't upload the photo.");
    }
  };

  // Mute / unmute this conversation for the current user (notifications only;
  // unread counts still accrue).
  const [mutingBusy, setMutingBusy] = useState(false);
  const isMuted = !!conversation?.is_muted;
  const handleToggleMute = async () => {
    setMutingBusy(true);
    try {
      await api.patch(`/chat/conversations/${conversationId}/mute`, { muted: !isMuted });
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", isMuted ? "Notifications unmuted." : "Notifications muted.");
    } catch {
      showToast("error", "Couldn't update notifications. Please try again.");
    } finally {
      setMutingBusy(false);
    }
  };

  // Archive / unarchive this conversation (hides it from the main list).
  const [archivingBusy, setArchivingBusy] = useState(false);
  const isArchived = !!conversation?.is_archived;
  const handleToggleArchive = async () => {
    setArchivingBusy(true);
    try {
      await api.patch(`/chat/conversations/${conversationId}/archive`, { archived: !isArchived });
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      showToast("success", isArchived ? "Conversation unarchived." : "Conversation archived.");
    } catch {
      showToast("error", "Couldn't update the conversation. Please try again.");
    } finally {
      setArchivingBusy(false);
    }
  };

  // Open (or start) a direct chat with a @-mentioned group member. Clicking your
  // own name is a no-op (there's no self-chat).
  const openMentionChat = async (userId: number) => {
    if (!userId || userId === me?.id) return;
    try {
      const res = await api.post("/chat/conversations/direct", { user_id: userId });
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      navigate(`/messages/${res.data.data.id}`);
    } catch {
      showToast("error", "Couldn't open that chat.");
    }
  };

  // Header subtitle: group member list / count, or counterpart designation.
  const subtitle = useMemo(() => {
    if (!conversation) return "";
    if (isGroup) {
      const names = conversation.participants.map((p) => p.name).join(", ");
      const count = conversation.participants.length;
      return names.length <= 60 ? names : `${count} members`;
    }
    return conversation.counterpart?.designation ?? conversation.counterpart?.email ?? "";
  }, [conversation, isGroup]);

  // Full roster for the header tooltip (so large groups don't lose context when
  // the subtitle collapses to "N members"). Capped to avoid an enormous title.
  const rosterTitle = useMemo(() => {
    if (!conversation || !isGroup) return undefined;
    const names = conversation.participants.map((p) => p.name);
    const shown = names.slice(0, 30).join(", ");
    return names.length > 30 ? `${shown} +${names.length - 30} more` : shown;
  }, [conversation, isGroup]);

  const cp = conversation?.counterpart;
  const { first: cpFirst, last: cpLast } = splitName(conversation?.title);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Visually-hidden live region: announces newly received messages to
          screen readers without stealing focus. */}
      <div aria-live="polite" className="sr-only">
        {srAnnounce}
      </div>
      {/* ---------------- Header ---------------- */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-gray-100 sm:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        {conversation?.is_self ? (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <Bookmark className="h-5 w-5" />
          </div>
        ) : isGroup ? (
          <GroupAvatar url={conversation?.avatar_url} />
        ) : (
          <div className="relative flex-shrink-0">
            <EmployeeAvatar
              userId={cp?.user_id}
              hasPhoto={!!cp?.photo_path}
              firstName={cpFirst}
              lastName={cpLast}
              size="md"
            />
            {counterpartPresence?.online && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
            )}
          </div>
        )}
        {isGroup ? (
          // Group header is a button that opens the members panel.
          <button
            type="button"
            onClick={() => setShowMembers(true)}
            className="min-w-0 flex items-center gap-1 text-left rounded-lg px-1 -mx-1 hover:bg-gray-50"
            title={rosterTitle ? `Members: ${rosterTitle}` : "View members"}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {conversation?.title ?? "Conversation"}
              </p>
              {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
          </button>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {conversation?.title ?? "Conversation"}
            </p>
            {/* Presence line: "typing…" takes priority — when someone is typing
                we show it here in place of Online / last seen. For a direct chat
                it's just "typing…"; for a group we name who's typing. Falls back
                to Online / last seen … / designation. The avatar already carries
                the green online dot, so "Online" here stands alone (no 2nd dot). */}
            {typers.length > 0 ? (
              <p className="text-xs text-green-600 truncate">
                {isGroup
                  ? typers.length === 1
                    ? `${typers[0]} is typing…`
                    : typers.length === 2
                      ? `${typers[0]} and ${typers[1]} are typing…`
                      : `${typers.length} people are typing…`
                  : "typing…"}
              </p>
            ) : counterpartPresence?.online ? (
              <p className="text-xs text-green-600">Online</p>
            ) : counterpartPresence ? (
              <p className="text-xs text-gray-400 truncate">
                {lastSeenLabel(counterpartPresence.last_seen)}
              </p>
            ) : conversation?.counterpart?.chat_status ? (
              <p className="text-xs text-gray-400 truncate">
                {conversation.counterpart.chat_status}
              </p>
            ) : (
              subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>
            )}
          </div>
        )}

        {/* In-thread search toggle */}
        {conversation && (
          <button
            type="button"
            onClick={() => {
              setSearchOpen((v) => !v);
              setThreadQuery("");
            }}
            title="Search in conversation"
            aria-label="Search in conversation"
            className={`ml-auto p-2 rounded-lg hover:bg-gray-100 ${
              searchOpen ? "text-brand-600" : "text-gray-500"
            }`}
          >
            <Search className="h-5 w-5" />
          </button>
        )}
        {/* Mute / unmute toggle (notifications only — unread still accrues). */}
        {conversation && (
          <button
            type="button"
            onClick={handleToggleMute}
            disabled={mutingBusy}
            title={isMuted ? "Unmute notifications" : "Mute notifications"}
            aria-label={isMuted ? "Unmute notifications" : "Mute notifications"}
            className={`p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 ${
              isMuted ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {isMuted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          </button>
        )}
        {/* Archive / unarchive toggle */}
        {conversation && (
          <button
            type="button"
            onClick={handleToggleArchive}
            disabled={archivingBusy}
            title={isArchived ? "Unarchive conversation" : "Archive conversation"}
            aria-label={isArchived ? "Unarchive conversation" : "Archive conversation"}
            className={`p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 ${
              isArchived ? "text-brand-500" : "text-gray-500"
            }`}
          >
            {isArchived ? (
              <ArchiveRestore className="h-5 w-5" />
            ) : (
              <Archive className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      {/* ---------------- In-thread search panel ---------------- */}
      {searchOpen && (
        <div className="border-b border-gray-200 bg-white px-3 py-2 flex-shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
              placeholder="Search in this conversation…"
              data-gramm="false"
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
            />
          </div>
          {threadQuery.trim().length >= 2 && (
            <div className="mt-1.5 max-h-48 overflow-y-auto">
              {(threadHits?.length ?? 0) === 0 ? (
                <p className="px-2 py-2 text-xs text-gray-400">No matches.</p>
              ) : (
                threadHits!.map((hit) => (
                  <button
                    key={hit.message_id}
                    type="button"
                    onClick={() => {
                      jumpToMessage(hit.message_id);
                      setSearchOpen(false);
                    }}
                    className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50"
                  >
                    {hit.body}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- Pinned-messages bar ---------------- */}
      {pinnedMessages && pinnedMessages.length > 0 && (
        <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5 flex-shrink-0">
          <Pin className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          <button
            type="button"
            onClick={() => jumpToMessage(pinnedMessages[0].id)}
            title="Go to pinned message"
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-[11px] font-medium text-amber-700">
              Pinned{pinnedMessages.length > 1 ? ` · ${pinnedMessages.length}` : ""}
            </p>
            <p className="truncate text-xs text-gray-600">
              <span className="text-gray-400">{pinnedMessages[0].sender_name}: </span>
              {pinnedMessages[0].body || "📎 Attachment"}
            </p>
          </button>
          {/* Quick unpin */}
          <button
            type="button"
            onClick={() => handleTogglePin({ ...pinnedMessages[0], is_pinned: true })}
            title="Unpin message"
            aria-label="Unpin message"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-amber-500 hover:bg-amber-200/60 hover:text-amber-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ---------------- Group members panel ---------------- */}
      {isGroup && showMembers && conversation && (
        <div
          className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setShowMembers(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Group members"
            className="w-full max-w-sm max-h-[80vh] overflow-hidden rounded-2xl bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200">
              <div className="min-w-0 flex-1">
                {editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename();
                        else if (e.key === "Escape") setEditingName(false);
                      }}
                      maxLength={150}
                      className="min-w-0 flex-1 rounded-lg border border-brand-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                    />
                    <button
                      type="button"
                      onClick={handleRename}
                      disabled={savingName}
                      className="p-1 rounded-lg text-brand-600 hover:bg-brand-50 disabled:opacity-50"
                      aria-label="Save name"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      disabled={savingName}
                      className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {conversation.title}
                    </p>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={startRename}
                        title="Rename group"
                        aria-label="Rename group"
                        className="p-0.5 rounded text-gray-300 hover:text-brand-600 flex-shrink-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  {conversation.participants.length} members
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMembers(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Group profile: avatar + description */}
            <div className="flex flex-col items-center gap-2 border-b border-gray-100 px-4 py-4 flex-shrink-0">
              <div className="relative">
                <GroupAvatar url={conversation.avatar_url} size="h-16 w-16" iconSize="h-7 w-7" />
                {isOwner && (
                  <>
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      title="Change group photo"
                      aria-label="Change group photo"
                      className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow hover:bg-brand-700"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAvatarPick(e.target.files?.[0] ?? null)}
                    />
                  </>
                )}
              </div>
              {/* Description */}
              {editingDesc ? (
                <div className="w-full">
                  <textarea
                    autoFocus
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Add a group description…"
                    className="w-full resize-none rounded-lg border border-brand-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                  <div className="mt-1 flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setEditingDesc(false)}
                      disabled={savingDesc}
                      className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDesc}
                      disabled={savingDesc}
                      className="rounded bg-brand-600 px-2 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={isOwner ? startEditDesc : undefined}
                  className={`text-center text-xs ${
                    isOwner ? "text-gray-500 hover:text-brand-600" : "text-gray-500"
                  }`}
                >
                  {conversation.description ||
                    (isOwner ? "Add a group description…" : "No description")}
                </button>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto py-2">
              {conversation.participants.map((p) => {
                const { first, last } = splitName(p.name);
                const isMe = p.user_id === me?.id;
                const isCreator = p.user_id === conversation.created_by;
                // Owner can remove everyone except the creator (themselves).
                const canRemove = isOwner && !isCreator;
                return (
                  <li
                    key={p.user_id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50"
                  >
                    <EmployeeAvatar
                      userId={p.user_id}
                      hasPhoto={!!p.photo_path}
                      firstName={first}
                      lastName={last}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.name}
                        {isMe && <span className="ml-1 text-xs text-gray-400">(You)</span>}
                        {isCreator && (
                          <span className="ml-1 text-[10px] font-medium text-brand-600 uppercase tracking-wide">
                            Admin
                          </span>
                        )}
                      </p>
                      {p.designation && (
                        <p className="text-xs text-gray-400 truncate">{p.designation}</p>
                      )}
                    </div>
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => setPendingRemove({ id: p.user_id, name: p.name })}
                        title={`Remove ${p.name}`}
                        aria-label={`Remove ${p.name}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 flex-shrink-0"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {/* Footer: add members + delete (owner) / leave group (non-owner) */}
            <div className="border-t border-gray-100 p-3 space-y-1 flex-shrink-0">
              {isOwner && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowAddMembers(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                  >
                    <UserPlus className="h-4 w-4" /> Add members
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGroup(true)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /> Delete group
                  </button>
                </>
              )}
              {!isOwner && (
                <button
                  type="button"
                  onClick={() => setConfirmLeave(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" /> Leave group
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add-members modal (creator only) */}
      {showAddMembers && conversation && (
        <AddMembersModal
          conversationId={conversationId}
          existingMemberIds={conversation.participants.map((p) => p.user_id)}
          onClose={() => setShowAddMembers(false)}
          onAdded={handleMembersAdded}
        />
      )}

      {/* Forward modal */}
      {forwardMsgs.length > 0 && (
        <ForwardModal
          messages={forwardMsgs}
          sourceConversationId={conversationId}
          onClose={() => setForwardMsgs([])}
          onForwarded={() => {
            setForwardMsgs([]);
            exitSelectMode();
            qc.invalidateQueries({ queryKey: ["chat-conversations"] });
          }}
        />
      )}

      {/* Right-click message context menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          actions={{
            onReact: (emoji) => handleToggleReaction(contextMenu.msg, emoji),
            onReply: () => setReplyTo(contextMenu.msg),
            onForward: () => setForwardMsgs([contextMenu.msg]),
            onSelect: () => enterSelectMode(contextMenu.msg),
            // "Seen by" — only for my own messages in a group (per-recipient).
            onInfo:
              isGroup && contextMenu.msg.is_mine && contextMenu.msg.id > 0
                ? () => setReceiptsForId(contextMenu.msg.id)
                : undefined,
            onCopy: contextMenu.msg.body
              ? () => navigator.clipboard?.writeText(contextMenu.msg.body).catch(() => {})
              : undefined,
            onCopyLink:
              contextMenu.msg.id > 0
                ? () => {
                    const url = `${window.location.origin}/messages/${conversationId}?m=${contextMenu.msg.id}`;
                    navigator.clipboard
                      ?.writeText(url)
                      .then(() => showToast("success", "Message link copied."))
                      .catch(() => showToast("error", "Couldn't copy the link."));
                  }
                : undefined,
            isPinned: !!contextMenu.msg.is_pinned,
            onTogglePin:
              contextMenu.msg.id > 0
                ? () => handleTogglePin(contextMenu.msg)
                : undefined,
            onEdit:
              contextMenu.msg.is_mine && contextMenu.msg.body
                ? () => startEdit(contextMenu.msg)
                : undefined,
            onDelete: contextMenu.msg.is_mine
              ? () => handleDelete(contextMenu.msg.id)
              : undefined,
          }}
        />
      )}

      {/* Leave-group confirmation */}
      <ConfirmDialog
        open={confirmLeave}
        title="Leave group?"
        description={`You'll leave "${conversation?.title ?? "this group"}" and stop receiving its messages. You can be re-added by the group admin.`}
        confirmText="Leave"
        variant="danger"
        loading={leaving}
        onConfirm={handleLeave}
        onCancel={() => !leaving && setConfirmLeave(false)}
      />

      {/* Delete-group confirmation (creator only) */}
      <ConfirmDialog
        open={confirmDeleteGroup}
        title="Delete group?"
        description={`"${conversation?.title ?? "This group"}" will be deleted for everyone and removed from all members' chat lists. This can't be undone.`}
        confirmText="Delete group"
        variant="danger"
        loading={deletingGroup}
        onConfirm={handleDeleteGroup}
        onCancel={() => !deletingGroup && setConfirmDeleteGroup(false)}
      />

      {/* Bulk-delete confirmation (selected own messages) */}
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${deletableSelected.length} message${deletableSelected.length > 1 ? "s" : ""}?`}
        description={
          deletableSelected.length < selectedIds.size
            ? "Only your own messages will be deleted; others stay. This can't be undone."
            : "These messages will be deleted for everyone. This can't be undone."
        }
        confirmText="Delete"
        variant="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDelete}
        onCancel={() => !bulkDeleting && setConfirmBulkDelete(false)}
      />

      {/* Remove-member confirmation (replaces the native confirm()). */}
      <ConfirmDialog
        open={!!pendingRemove}
        title="Remove member?"
        description={
          pendingRemove
            ? `${pendingRemove.name} will be removed from "${conversation?.title ?? "this group"}" and will no longer see its messages.`
            : ""
        }
        confirmText="Remove"
        variant="danger"
        loading={removing}
        onConfirm={handleConfirmRemove}
        onCancel={() => !removing && setPendingRemove(null)}
      />

      {/* ---------------- Message list ---------------- */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isDragging) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          // Only clear when truly leaving the container (not entering a child).
          if (e.currentTarget === e.target) setIsDragging(false);
        }}
        onDrop={handleDrop}
        className="relative flex-1 overflow-y-auto px-4 py-4 bg-gray-50/50"
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-30 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-400 bg-brand-50/80">
            <p className="text-sm font-medium text-brand-700">Drop files to send</p>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-start" : "justify-end"}`}>
                <div className="h-10 w-48 rounded-2xl bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="h-full flex items-center justify-center text-sm text-red-500">
            Failed to load messages. Please try again.
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
            <p className="text-sm font-medium text-gray-500">No messages yet</p>
            <p className="text-xs mt-1">Say hello to get the conversation started.</p>
          </div>
        ) : (
          // min-h-full + justify-end keeps a short conversation pinned to the
          // bottom (next to the composer) instead of floating at the top with a
          // big empty gap below; long threads scroll normally.
          <div className="flex min-h-full flex-col justify-end space-y-1">
            {/* Top-of-list pagination affordance */}
            {loadingOlder && (
              <div className="flex justify-center py-2">
                <div className="h-4 w-4 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
              </div>
            )}
            {reachedStart && (
              <div className="flex justify-center py-2">
                <span className="text-[11px] text-gray-400">Beginning of conversation</span>
              </div>
            )}
            {messages.map((msg, idx) => {
              const mine = msg.is_mine || msg.sender_id === me?.id;
              // Emoji-only messages render large + bubble-less (jumbo emoji).
              const jumbo = !msg.is_deleted && !msg.attachment ? emojiOnlyCount(msg.body) : 0;
              const prev = messages[idx - 1];
              const showDayDivider =
                !prev || dayLabel(prev.created_at) !== dayLabel(msg.created_at);
              // Show sender name in groups when the previous bubble was someone else's.
              const showSender =
                isGroup && !mine && (!prev || prev.sender_id !== msg.sender_id);

              return (
                <Fragment key={msg.id}>
                  {showDayDivider && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2.5 py-0.5 rounded-full">
                        {dayLabel(msg.created_at)}
                      </span>
                    </div>
                  )}
                  {firstUnreadId === msg.id && (
                    <div className="my-2 flex items-center gap-2">
                      <span className="h-px flex-1 bg-brand-300" />
                      <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700">
                        Unread messages
                      </span>
                      <span className="h-px flex-1 bg-brand-300" />
                    </div>
                  )}
                  {msg.is_system ? (
                    // System event notice (membership changes): centered, author-less.
                    <div className="flex justify-center my-1.5">
                      <span className="max-w-[80%] text-center text-[11px] text-gray-500 bg-gray-100/80 px-3 py-1 rounded-full">
                        {msg.body}
                      </span>
                    </div>
                  ) : (
                  (() => {
                    const selectable = selectMode && !msg.is_deleted && msg.id > 0;
                    const isSelected = selectedIds.has(msg.id);
                    return (
                  <div
                    data-msg-id={msg.id}
                    className={`group flex items-center gap-2 rounded-lg px-1 -mx-1 transition-colors ${
                      mine ? "justify-end" : "justify-start"
                    } ${selectMode ? "cursor-pointer" : ""} ${
                      isSelected ? "bg-brand-50" : ""
                    } ${highlightedId === msg.id ? "bg-amber-100/70" : ""}`}
                    onContextMenu={(e) => !selectMode && openContextMenu(e, msg)}
                    onTouchStart={(e) => onTouchStartMsg(e, msg)}
                    onTouchMove={clearLongPress}
                    onTouchEnd={clearLongPress}
                    onTouchCancel={clearLongPress}
                    onClick={
                      selectable
                        ? () => toggleSelected(msg.id)
                        : (e) => {
                            // Swallow the click that follows a long-press so it
                            // doesn't do anything unexpected after the menu opens.
                            if (longPressFired.current) {
                              e.preventDefault();
                              longPressFired.current = false;
                            }
                          }
                    }
                  >
                    {/* Selection checkbox (left of the bubble row) */}
                    {selectMode && (
                      <span
                        className={`order-first flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? "bg-brand-600 border-brand-600 text-white" : "border-gray-300 bg-white"
                        } ${selectable ? "" : "opacity-0"}`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {showSender && (
                        <span className="text-[11px] font-medium text-gray-500 ml-1 mb-0.5">
                          {msg.sender_name}
                        </span>
                      )}
                      <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                        {msg.is_deleted ? (
                          <div className="px-3.5 py-2 rounded-2xl bg-gray-100 text-gray-400 italic text-sm">
                            This message was deleted
                          </div>
                        ) : jumbo > 0 ? (
                          // Emoji-only message: render large + bubble-less (jumbo emoji).
                          <div
                            className={`leading-none ${
                              jumbo === 1 ? "text-5xl" : jumbo === 2 ? "text-4xl" : "text-3xl"
                            } ${mine ? "pr-1" : "pl-1"}`}
                          >
                            {msg.body}
                          </div>
                        ) : msg.attachment && !msg.body ? (
                          // Attachment-only: render the file/image with no text bubble.
                          <MessageAttachment attachment={msg.attachment} mine={mine} />
                        ) : editingId === msg.id ? (
                          // Inline edit mode.
                          <div className="flex flex-col gap-1.5 w-72 max-w-full">
                            <textarea
                              autoFocus
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  saveEdit(msg);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                              rows={2}
                              className="resize-none rounded-xl border border-brand-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-200"
                            />
                            <div className="flex items-center gap-2 text-[11px]">
                              <button
                                type="button"
                                onClick={() => saveEdit(msg)}
                                disabled={savingEdit}
                                className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                              >
                                <Check className="h-3 w-3" /> Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="rounded-lg px-2 py-1 text-gray-500 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                              <span className="text-gray-400">Enter to save · Esc to cancel</span>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? "bg-brand-600 text-white rounded-br-md"
                                : "bg-white border border-gray-200 text-gray-800 rounded-bl-md"
                            }`}
                          >
                            {/* Forwarded provenance header */}
                            {msg.forwarded_from && (
                              <p
                                className={`mb-1 flex items-center gap-1 text-xs italic ${mine ? "text-white/70" : "text-gray-400"}`}
                              >
                                <Forward className="h-3 w-3" /> Forwarded from {msg.forwarded_from}
                              </p>
                            )}
                            {/* Quoted reply header — click to jump to the original. */}
                            {msg.reply_to && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (msg.reply_to) jumpToMessage(msg.reply_to.id);
                                }}
                                title="Go to message"
                                className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-xs transition-colors ${
                                  mine
                                    ? "border-white/60 bg-white/15 hover:bg-white/25"
                                    : "border-brand-400 bg-brand-50/60 hover:bg-brand-100/70"
                                }`}
                              >
                                <p
                                  className={`font-medium ${mine ? "text-white" : "text-brand-700"}`}
                                >
                                  {msg.reply_to.sender_name}
                                </p>
                                <p
                                  className={`truncate ${mine ? "text-white/80" : "text-gray-500"}`}
                                >
                                  {msg.reply_to.is_deleted
                                    ? "Message deleted"
                                    : msg.reply_to.body ||
                                      (msg.reply_to.has_attachment ? "📎 Attachment" : "")}
                                </p>
                              </button>
                            )}
                            {msg.attachment && (
                              <div className="mb-2">
                                <MessageAttachment
                                  attachment={msg.attachment}
                                  mine={mine}
                                  onBubble
                                />
                              </div>
                            )}
                            {isGroup
                              ? renderWithMentions(
                                  msg.body,
                                  conversation?.participants ?? [],
                                  msg.mentioned_user_ids,
                                  mine,
                                  openMentionChat,
                                )
                              : msg.body}
                          </div>
                        )}

                        {/* Hover actions: react + reply (any message) + edit/delete (own) */}
                        {!msg.is_deleted && editingId !== msg.id && msg.id > 0 && (
                          <div className="relative flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* React: opens a quick emoji picker popover. */}
                            <button
                              onClick={() =>
                                setReactPickerFor((cur) => (cur === msg.id ? null : msg.id))
                              }
                              title="React"
                              aria-label="React"
                              className="p-1 rounded text-gray-300 hover:text-brand-600"
                            >
                              <SmilePlus className="h-3.5 w-3.5" />
                            </button>
                            {reactPickerFor === msg.id && (
                              <div
                                className={`absolute bottom-full mb-1 z-20 ${mine ? "right-0" : "left-0"}`}
                              >
                                <ReactionPicker
                                  onPick={(emoji) => handleToggleReaction(msg, emoji)}
                                />
                              </div>
                            )}
                            <button
                              onClick={() => setReplyTo(msg)}
                              title="Reply"
                              aria-label="Reply"
                              className="p-1 rounded text-gray-300 hover:text-brand-600"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setForwardMsgs([msg])}
                              title="Forward"
                              aria-label="Forward"
                              className="p-1 rounded text-gray-300 hover:text-brand-600"
                            >
                              <Forward className="h-3.5 w-3.5" />
                            </button>
                            {mine && msg.body && (
                              <button
                                onClick={() => startEdit(msg)}
                                title="Edit message"
                                aria-label="Edit message"
                                className="p-1 rounded text-gray-300 hover:text-brand-600"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {mine && (
                              <button
                                onClick={() => handleDelete(msg.id)}
                                disabled={deletingId === msg.id}
                                title="Delete message"
                                aria-label="Delete message"
                                className="p-1 rounded text-gray-300 hover:text-red-500 disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span
                        className={`flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 ${mine ? "mr-1" : "ml-1"}`}
                      >
                        {clockTime(msg.created_at)}
                        {msg.edited_at && !msg.is_deleted ? " · edited" : ""}
                        {/* My own ticks. In a group, tapping opens the receipts
                            panel; the glyph sits in a brand bubble so render it
                            against that color via a tiny wrapper. */}
                        {mine && !msg.is_deleted && msg.tick_status && (
                          <span
                            onClick={() => isGroup && msg.id > 0 && setReceiptsForId(msg.id)}
                            className={`ml-0.5 inline-flex items-center ${isGroup ? "cursor-pointer" : ""}`}
                            title={isGroup ? "Message info" : msg.tick_status}
                          >
                            <TickGlyph status={msg.tick_status} onRetry={() => handleRetry(msg)} />
                          </span>
                        )}
                      </span>
                      {/* Aggregated reaction pills */}
                      {!msg.is_deleted && msg.reactions && msg.reactions.length > 0 && (
                        <ReactionPills
                          reactions={msg.reactions}
                          mine={mine}
                          onToggle={(emoji) => handleToggleReaction(msg, emoji)}
                        />
                      )}
                    </div>
                  </div>
                    );
                  })()
                  )}
                </Fragment>
              );
            })}
            {/* Typing indicator — sits at the bottom of the thread (like other
                messaging apps), left-aligned as an incoming "bubble". */}
            {typers.length > 0 && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" />
                  </span>
                  {isGroup && (
                    <span className="text-xs text-gray-500">
                      {typers.length === 1
                        ? `${typers[0]} is typing…`
                        : typers.length === 2
                          ? `${typers[0]} and ${typers[1]} are typing…`
                          : `${typers.length} people are typing…`}
                    </span>
                  )}
                </div>
              </div>
            )}
            {/* Sentinel for the IntersectionObserver-gated read marker. */}
            <div ref={bottomRef} className="h-px w-full" />
          </div>
        )}
      </div>

      {/* Jump-to-bottom pill — floats above the composer when scrolled up. */}
      {showJumpToBottom && (
        <div className="relative h-0 flex-shrink-0">
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-2 right-4 z-10 flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-brand-700"
          >
            <ChevronDown className="h-4 w-4" />
            {missedCount > 0
              ? `${missedCount} new message${missedCount > 1 ? "s" : ""}`
              : "Jump to latest"}
          </button>
        </div>
      )}

      {/* Group message receipts panel */}
      {receiptsForId !== null && (
        <ReceiptsPanel
          conversationId={conversationId}
          messageId={receiptsForId}
          onClose={() => setReceiptsForId(null)}
        />
      )}

      {/* ---------------- Selection toolbar (replaces composer in select mode) ---- */}
      {selectMode ? (
        <div className="border-t border-gray-200 p-3 flex-shrink-0 bg-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exitSelectMode}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Cancel selection"
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.size} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Delete — only enabled when ≥1 selected message is your own. */}
            <button
              type="button"
              disabled={deletableSelected.length === 0}
              onClick={() => setConfirmBulkDelete(true)}
              title={
                deletableSelected.length === 0
                  ? "You can only delete your own messages"
                  : "Delete selected"
              }
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => {
                const picked = (messages ?? []).filter((m) => selectedIds.has(m.id));
                if (picked.length) setForwardMsgs(picked);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              <Forward className="h-4 w-4" /> Forward
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* ---------------- Composer ---------------- */}
      <div className="border-t border-gray-200 p-3 flex-shrink-0 bg-white">
        {/* Replying-to chip */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-brand-400 bg-brand-50/60 px-3 py-2">
            <Reply className="h-4 w-4 flex-shrink-0 text-brand-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-brand-700">
                Replying to {replyTo.sender_name}
              </p>
              <p className="truncate text-xs text-gray-500">
                {replyTo.is_deleted
                  ? "Message deleted"
                  : replyTo.body || (replyTo.attachment ? "📎 Attachment" : "")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Staged-attachment preview chip */}
        {file && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 max-w-sm">
            {filePreview ? (
              <img
                src={filePreview}
                alt=""
                className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
              />
            ) : (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
              <p className="text-[11px] text-gray-400">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={clearFile}
              disabled={sending}
              className="p-1 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-50"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Queued-files indicator (extra files sending one-per-message) */}
        {queuedFiles.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            <Paperclip className="h-3.5 w-3.5" />
            {queuedFiles.length} more file{queuedFiles.length > 1 ? "s" : ""} queued
            <button
              type="button"
              onClick={() => setQueuedFiles([])}
              className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              clear
            </button>
          </div>
        )}

        {/* Hidden file input — images + the document types the server accepts.
            Multiple files are queued and sent one-per-message. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          onChange={(e) => stageFiles(Array.from(e.target.files ?? []))}
        />

        <div className="relative flex items-end gap-2">
          {/* @-mention autocomplete dropdown */}
          {mention && mentionItems.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-64 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg z-20">
              {mentionItems.map((item, idx) => {
                const { first, last } = splitName(item.label);
                return (
                  <button
                    key={item.id}
                    type="button"
                    // Keep the highlighted (keyboard-selected) item scrolled into view.
                    ref={
                      idx === mentionIndex
                        ? (el) => el?.scrollIntoView({ block: "nearest" })
                        : undefined
                    }
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep textarea focus
                      pickMention(item);
                    }}
                    onMouseEnter={() => setMentionIndex(idx)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                      idx === mentionIndex ? "bg-brand-50" : "hover:bg-gray-50"
                    }`}
                  >
                    {item.id === 0 ? (
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                        @
                      </span>
                    ) : (
                      <EmployeeAvatar
                        userId={item.id}
                        hasPhoto={!!item.photo_path}
                        firstName={first}
                        lastName={last}
                        size="sm"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-800">
                        {item.label}
                      </span>
                      {item.sub && (
                        <span className="block truncate text-[11px] text-gray-400">{item.sub}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {/* Emoji picker popover */}
          {showEmoji && (
            <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />
          )}

          {/* Input pill: attach + emoji icons live inside the rounded field. */}
          <div className="flex flex-1 items-end gap-1 rounded-3xl border border-gray-200 bg-gray-50 px-2 py-1 transition-colors focus-within:border-brand-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-100">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach a photo or file"
              aria-label="Attach a photo or file"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200/70 hover:text-gray-600 disabled:opacity-40"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={onDraftChange}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onKeyUp={(e) => {
                // Don't recompute the mention context for navigation keys —
                // they drive the dropdown selection and recomputing would reset
                // the highlighted index (breaking arrow-key navigation).
                if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) return;
                updateMentionContext(
                  (e.target as HTMLTextAreaElement).value,
                  (e.target as HTMLTextAreaElement).selectionStart ?? 0,
                );
              }}
              onClick={(e) =>
                updateMentionContext(
                  (e.target as HTMLTextAreaElement).value,
                  (e.target as HTMLTextAreaElement).selectionStart ?? 0,
                )
              }
              rows={1}
              placeholder={
                file ? "Add a caption…" : isGroup ? "Type a message… (@ to mention)" : "Type a message…"
              }
              // Stop Grammarly/extensions from injecting their overlay widget
              // into the composer (it was sitting on top of the rounded pill).
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              className="block flex-1 resize-none max-h-32 overflow-y-auto self-center bg-transparent px-1 py-2 text-sm leading-5 text-gray-800 placeholder:text-gray-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              disabled={sending}
              title="Emoji"
              aria-label="Insert emoji"
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full hover:bg-gray-200/70 disabled:opacity-40 ${
                showEmoji ? "text-brand-600" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <Smile className="h-5 w-5" />
            </button>
          </div>

          {/* Circular send button */}
          <button
            onClick={handleSend}
            disabled={
              (!draft.trim() && !file) || sending || draft.length > MAX_MESSAGE_CHARS
            }
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition-all hover:bg-brand-700 hover:shadow active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:hover:bg-brand-600 disabled:active:scale-100"
            aria-label="Send message"
          >
            <Send className="h-[18px] w-[18px] -ml-0.5" />
          </button>
        </div>
        <div className="mt-1.5 ml-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-gray-400">
            Enter to send · Shift + Enter for a new line
            {isGroup ? " · @ to mention" : " · Attach up to 10 MB"}
          </p>
          {/* Character counter — only shown as you approach / exceed the limit. */}
          {draft.length > MAX_MESSAGE_CHARS - 200 && (
            <span
              className={`text-[10px] font-medium tabular-nums ${
                draft.length > MAX_MESSAGE_CHARS ? "text-red-500" : "text-gray-400"
              }`}
            >
              {draft.length}/{MAX_MESSAGE_CHARS}
            </span>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
