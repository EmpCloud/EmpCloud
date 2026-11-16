// =============================================================================
// EMP CLOUD — Messages (Chat) Page
// =============================================================================
//
// A private 1-on-1 + group messaging UI. Two-pane layout:
//   LEFT  — searchable conversation list with unread badges + "New chat".
//   RIGHT — the open thread (bubbles, composer, delete-own-message).
//
// "Real-time" is achieved by polling (react-query refetchInterval): the
// conversation list every ~5s and the open thread's messages every ~3s.
// The URL param (/messages/:conversationId) is the single source of truth
// for which thread is open, so conversations are deep-linkable.

import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import type { ConversationSummary, MessageSearchResult } from "@empcloud/shared";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import { showToast } from "@/components/ui/Toast";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { GroupAvatar } from "./GroupAvatar";
import { MessagesSquare, Plus, Search, BellOff, Archive, Pencil, Camera, Bookmark } from "lucide-react";
import { splitName, relativeTime } from "./chat-utils";
import MessageThread from "./MessageThread";
import NewChatModal from "./NewChatModal";
import { EnableNotificationsBanner } from "./EnableNotificationsBanner";

// Debounce a changing value (for server-backed message search).
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Search message bodies across the user's conversations (server-backed).
function useMessageSearch(query: string) {
  const q = query.trim();
  return useQuery<MessageSearchResult[]>({
    queryKey: ["chat-message-search", q],
    queryFn: () =>
      api.get("/chat/search", { params: { q } }).then((r) => r.data.data),
    enabled: q.length >= 2, // only search once the query is meaningful
    staleTime: 10_000,
  });
}

// --- Data hooks -------------------------------------------------------------

function useConversations() {
  return useQuery<ConversationSummary[]>({
    queryKey: ["chat-conversations"],
    queryFn: () => api.get("/chat/conversations").then((r) => r.data.data),
    refetchInterval: 5000, // poll for new messages / unread badges
    refetchOnWindowFocus: true,
  });
}

// --- Conversation row -------------------------------------------------------

function ConversationRow({
  conv,
  active,
  onClick,
}: {
  conv: ConversationSummary;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const isGroup = conv.type === "group";
  const cp = conv.counterpart;
  const { first, last } = splitName(conv.title);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        active
          ? "border-brand-200 bg-brand-50 dark:border-brand-900/70 dark:bg-brand-950/30"
          : "border-transparent hover:bg-muted/70"
      }`}
    >
      {conv.is_self ? (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <Bookmark aria-hidden="true" className="h-5 w-5" />
        </div>
      ) : isGroup ? (
        <GroupAvatar url={conv.avatar_url} />
      ) : (
        <EmployeeAvatar
          userId={cp?.user_id}
          hasPhoto={!!cp?.photo_path}
          firstName={first}
          lastName={last}
          size="md"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className={`truncate text-[13px] text-foreground ${conv.unread_count > 0 ? "font-semibold" : "font-medium"}`}>
              {conv.title}
            </span>
            {conv.is_muted && (
              <BellOff className="h-3 w-3 flex-shrink-0 text-muted-foreground" aria-label={t("messagesPage.conversationRow.mutedAriaLabel")} />
            )}
          </span>
          {conv.last_message_at && (
            <span
              className="flex-shrink-0 text-[11px] tabular-nums text-muted-foreground"
              title={new Date(conv.last_message_at).toLocaleString()}
            >
              {relativeTime(conv.last_message_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`truncate text-xs ${conv.unread_count > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {conv.last_message ?? (isGroup ? t("messagesPage.conversationRow.groupCreated") : t("messagesPage.conversationRow.noMessagesYet"))}
          </span>
          {conv.unread_count > 0 && (
            // Muted chats still count unread, but the badge is subdued (grey) so
            // it doesn't draw attention the way an active brand-coloured one does.
            <span
              className={`inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 text-[11px] font-bold text-white rounded-full flex-shrink-0 ${
                conv.is_muted ? "bg-muted-foreground" : "bg-brand-600"
              }`}
            >
              {conv.unread_count > 99 ? t("messagesPage.conversationRow.unreadCountOverflow") : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// --- Page -------------------------------------------------------------------

export default function MessagesPage() {
  const { t } = useTranslation();
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // My profile photo — uploads to the shared employee-photo endpoint, so it
  // updates across the whole HRMS (directory, profile) AND chat.
  const me = useAuthStore((s) => s.user);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBust, setPhotoBust] = useState(0); // forces the avatar to refetch
  const handleMyPhoto = async (f: File | null) => {
    if (!f || !me) return;
    if (!f.type.startsWith("image/")) {
      showToast("error", t("messagesPage.toast.photoMustBeImage"));
      return;
    }
    const form = new FormData();
    form.append("photo", f);
    try {
      await api.post(`/employees/${me.id}/photo`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // Refresh the cached photo everywhere it's shown.
      qc.invalidateQueries({ queryKey: ["employee-photo", me.id] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      setPhotoBust((n) => n + 1);
      showToast("success", t("messagesPage.toast.photoUpdated"));
    } catch {
      showToast("error", t("messagesPage.toast.photoUploadFailed"));
    }
  };

  // My chat status / "About".
  const { data: myStatus } = useQuery<{ status: string | null }>({
    queryKey: ["chat-my-status"],
    queryFn: () => api.get("/chat/me/status").then((r) => r.data.data),
    staleTime: 60_000,
  });
  const [showProfile, setShowProfile] = useState(false);
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft, setStatusDraft] = useState("");
  const saveStatus = async () => {
    try {
      await api.patch("/chat/me/status", { status: statusDraft.trim() });
      await qc.invalidateQueries({ queryKey: ["chat-my-status"] });
      qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      setEditingStatus(false);
    } catch {
      showToast("error", t("messagesPage.toast.statusUpdateFailed"));
    }
  };

  const { data: conversations, isLoading, isError } = useConversations();
  const archivedCount = useMemo(
    () => (conversations ?? []).filter((c) => c.is_archived).length,
    [conversations],
  );

  const activeId = conversationId ? Number(conversationId) : null;
  const activeConv = useMemo(
    () => conversations?.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  const filtered = useMemo(() => {
    const list = conversations ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      // Show archived chats only in the archived view (the open one is always
      // visible so you're never stranded), and apply the title search.
      const archiveOk = showArchived ? c.is_archived : !c.is_archived || c.id === activeId;
      const titleOk = !q || c.title.toLowerCase().includes(q);
      return archiveOk && titleOk;
    });
  }, [conversations, search, showArchived, activeId]);

  // Server-backed message-body search (debounced).
  const debouncedSearch = useDebounced(search, 300);
  const { data: messageHits, isFetching: searchingMessages } =
    useMessageSearch(debouncedSearch);
  const showMessageResults = debouncedSearch.trim().length >= 2 && (messageHits?.length ?? 0) > 0;

  const openConversation = (id: number) => navigate(`/messages/${id}`);

  // Open (or create) the personal notes / self-chat.
  const openSelfChat = async () => {
    try {
      const res = await api.post("/chat/conversations/self");
      await qc.invalidateQueries({ queryKey: ["chat-conversations"] });
      setShowProfile(false);
      navigate(`/messages/${res.data.data.id}`);
    } catch {
      showToast("error", t("messagesPage.toast.openNotesFailed"));
    }
  };

  // Open a conversation from a message search hit, then clear the search.
  const openFromSearch = (conversationId: number) => {
    setSearch("");
    navigate(`/messages/${conversationId}`);
  };

  // After a new conversation is created, refresh the list and open it.
  const handleCreated = (conv: ConversationSummary) => {
    setShowNewChat(false);
    qc.invalidateQueries({ queryKey: ["chat-conversations"] });
    navigate(`/messages/${conv.id}`);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-[1600px] flex-col">
      <EnableNotificationsBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {/* ---------------- LEFT: conversation list ----------------
            On mobile, hide the list once a conversation is open so the
            thread takes the full width (the thread's back button returns). */}
        <aside
          className={`${
            activeId ? "hidden sm:flex" : "flex"
          } min-h-0 w-full flex-shrink-0 flex-col border-e border-border sm:w-80 lg:w-[22rem]`}
        >
          <div className="border-b border-border px-3 py-3">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {/* My profile — compact avatar; click opens a small popover to
                    change photo / set status. */}
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowProfile((v) => !v)}
                    title={t("messagesPage.profile.yourProfileTitle")}
                    aria-label={t("messagesPage.profile.yourProfileTitle")}
                    className="relative block rounded-full ring-2 ring-transparent transition-shadow duration-150 hover:ring-brand-200 focus-visible:outline-none focus-visible:ring-brand-500"
                  >
                    <EmployeeAvatar
                      key={photoBust}
                      userId={me?.id}
                      hasPhoto
                      firstName={me?.first_name}
                      lastName={me?.last_name}
                      size="md"
                    />
                    {/* You're online whenever you're using the app. */}
                    <span aria-hidden="true" className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-green-500" />
                  </button>
                  {showProfile && (
                    <>
                      {/* click-away backdrop */}
                      <button
                        type="button"
                        className="fixed inset-0 z-30 cursor-default"
                        onClick={() => setShowProfile(false)}
                        aria-label={t("common.close")}
                      />
                      <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-lg">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            title={t("messagesPage.profile.changePhotoTitle")}
                            aria-label={t("messagesPage.profile.changePhotoTitle")}
                            className="group relative flex-shrink-0"
                          >
                            <EmployeeAvatar
                              key={photoBust}
                              userId={me?.id}
                              hasPhoto
                              firstName={me?.first_name}
                              lastName={me?.last_name}
                              size="md"
                            />
                            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition-[background-color,opacity] duration-150 group-hover:bg-black/40 group-hover:opacity-100">
                              <Camera className="h-4 w-4" />
                            </span>
                          </button>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleMyPhoto(e.target.files?.[0] ?? null)}
                          />
                          <p className="truncate text-[13px] font-semibold text-foreground">
                            {me ? `${me.first_name} ${me.last_name}` : t("messagesPage.profile.youFallback")}
                          </p>
                        </div>
                        {/* Status */}
                        <div className="mt-3">
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            {t("messagesPage.profile.statusLabel")}
                          </p>
                          {editingStatus ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={statusDraft}
                                onChange={(e) => setStatusDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveStatus();
                                  else if (e.key === "Escape") setEditingStatus(false);
                                }}
                                maxLength={140}
                                name="chat-status"
                                aria-label={t("messagesPage.profile.statusLabel")}
                                placeholder={t("messagesPage.profile.statusPlaceholder")}
                                data-gramm="false"
                                className="min-w-0 flex-1 rounded-md border border-brand-300 bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                              />
                              <button
                                type="button"
                                onClick={saveStatus}
                                className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                              >
                                {t("messagesPage.profile.save")}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setStatusDraft(myStatus?.status ?? "");
                                setEditingStatus(true);
                              }}
                              title={t("messagesPage.profile.setStatusTitle")}
                              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            >
                              <Pencil aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                              <span className="truncate">
                                {myStatus?.status || t("messagesPage.profile.statusPlaceholder")}
                              </span>
                            </button>
                          )}
                        </div>
                        {/* Message yourself / personal notes */}
                        <button
                          type="button"
                          onClick={openSelfChat}
                          className="mt-3 flex w-full items-center gap-2 border-t border-border px-2 pt-3 text-left text-[13px] text-brand-700 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:text-brand-200"
                        >
                          <Bookmark aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
                          {t("messagesPage.profile.messageYourself")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {/* Logged-in user's name + their status line (WhatsApp-style). */}
                <button
                  type="button"
                  onClick={() => setShowProfile((v) => !v)}
                  className="min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title={t("messagesPage.profile.yourProfileTitle")}
                >
                  <p className="truncate text-sm font-semibold leading-snug text-foreground">
                    {me ? `${me.first_name} ${me.last_name}` : t("messagesPage.profile.youFallback")}
                  </p>
                  <p className="truncate text-xs leading-snug text-muted-foreground">
                    {myStatus?.status || t("messagesPage.profile.statusPlaceholder")}
                  </p>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowNewChat(true)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <Plus aria-hidden="true" className="h-4 w-4" /> {t("messagesPage.list.newChat")}
              </button>
            </div>
            <div className="relative h-10">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                name="message-search"
                aria-label={t("messagesPage.search.placeholder")}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("messagesPage.search.placeholder")}
                // data-gramm*: stop Grammarly/extensions from injecting an overlay
                // widget here (its outline was floating up over the heading).
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                className="absolute inset-0 h-full w-full rounded-md border border-border bg-background pl-9 pr-3 text-[13px] text-foreground transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Archived toggle — shown when viewing archived, or when archived
                chats exist (so they're discoverable). */}
            {(showArchived || archivedCount > 0) && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Archive aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                {showArchived
                  ? t("messagesPage.list.backToChats")
                  : archivedCount > 0
                    ? t("messagesPage.list.archivedWithCount", { count: archivedCount })
                    : t("messagesPage.list.archived")}
              </button>
            )}
            {isLoading ? (
              <div className="space-y-2 p-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-muted" />
                      <div className="h-2.5 w-full rounded bg-muted/60" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div role="alert" className="p-6 text-center text-[13px] text-red-600 dark:text-red-300">
                {t("messagesPage.list.loadError")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-muted-foreground">
                <MessagesSquare aria-hidden="true" className="mb-3 h-10 w-10" />
                {search ? (
                  <p className="text-sm">{t("messagesPage.list.noSearchMatch", { query: search })}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">{t("messagesPage.list.noConversationsTitle")}</p>
                    <p className="text-xs mt-1">{t("messagesPage.list.noConversationsHint")}</p>
                  </>
                )}
              </div>
            ) : (
              <>
                {filtered.map((conv) => (
                  <ConversationRow
                    key={conv.id}
                    conv={conv}
                    active={conv.id === activeId}
                    onClick={() => openConversation(conv.id)}
                  />
                ))}
              </>
            )}

            {/* Message-body search results (server-backed) */}
            {debouncedSearch.trim().length >= 2 && (
              <div className="mt-1">
                <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("messagesPage.search.messagesHeader")}
                  {searchingMessages && (
                    <span aria-hidden="true" className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-border border-t-brand-500 align-middle" />
                  )}
                </p>
                {!searchingMessages && !showMessageResults ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    {t("messagesPage.search.noMessageMatch", { query: debouncedSearch.trim() })}
                  </p>
                ) : (
                  (messageHits ?? []).map((hit) => (
                    <button
                      key={hit.message_id}
                      onClick={() => openFromSearch(hit.conversation_id)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {hit.conversation_title}
                        </span>
                        <span
                          className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground"
                          title={new Date(hit.created_at).toLocaleString()}
                        >
                          {relativeTime(hit.created_at)}
                        </span>
                      </span>
                      <span className="w-full truncate text-xs text-muted-foreground">
                        <span>{t("messagesPage.search.senderPrefix", { name: hit.sender_name })}</span>
                        {hit.body}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ---------------- RIGHT: message thread ----------------
            On mobile, only render when a conversation is open (the list
            takes the screen otherwise); on desktop it's always present. */}
        <main className={`${activeId ? "flex" : "hidden sm:flex"} flex-1 min-w-0 flex-col min-h-0`}>
          {activeId ? (
            <MessageThread
              key={activeId}
              conversationId={activeId}
              conversation={activeConv}
              onBack={() => navigate("/messages")}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-muted-foreground">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-300">
                <MessagesSquare aria-hidden="true" className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t("messagesPage.empty.yourMessagesTitle")}</p>
              <p className="mt-1 max-w-xs text-[13px]">
                {t("messagesPage.empty.yourMessagesHint")}
              </p>
            </div>
          )}
        </main>
      </div>

      {showNewChat && (
        <NewChatModal onClose={() => setShowNewChat(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
