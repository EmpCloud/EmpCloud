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
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
        active ? "bg-brand-50 border border-brand-200" : "hover:bg-gray-50 border border-transparent"
      }`}
    >
      {conv.is_self ? (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          <Bookmark className="h-5 w-5" />
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
            <span className={`text-sm truncate ${conv.unread_count > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
              {conv.title}
            </span>
            {conv.is_muted && (
              <BellOff className="h-3 w-3 flex-shrink-0 text-gray-400" aria-label={t("messagesPage.conversationRow.mutedAriaLabel")} />
            )}
          </span>
          {conv.last_message_at && (
            <span
              className="text-[11px] text-gray-400 flex-shrink-0"
              title={new Date(conv.last_message_at).toLocaleString()}
            >
              {relativeTime(conv.last_message_at)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-xs truncate ${conv.unread_count > 0 ? "text-gray-700" : "text-gray-400"}`}>
            {conv.last_message ?? (isGroup ? t("messagesPage.conversationRow.groupCreated") : t("messagesPage.conversationRow.noMessagesYet"))}
          </span>
          {conv.unread_count > 0 && (
            // Muted chats still count unread, but the badge is subdued (grey) so
            // it doesn't draw attention the way an active brand-coloured one does.
            <span
              className={`inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 text-[11px] font-bold text-white rounded-full flex-shrink-0 ${
                conv.is_muted ? "bg-gray-400" : "bg-brand-600"
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
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <EnableNotificationsBanner />
      <div className="flex flex-1 min-h-0 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* ---------------- LEFT: conversation list ----------------
            On mobile, hide the list once a conversation is open so the
            thread takes the full width (the thread's back button returns). */}
        <aside
          className={`${
            activeId ? "hidden sm:flex" : "flex"
          } w-full sm:w-80 lg:w-[22rem] flex-shrink-0 border-r border-gray-200 flex-col min-h-0`}
        >
          <div className="px-4 pt-4 pb-3 border-b border-gray-100">
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
                    className="relative block rounded-full ring-2 ring-transparent hover:ring-brand-200"
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
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" />
                  </button>
                  {showProfile && (
                    <>
                      {/* click-away backdrop */}
                      <div className="fixed inset-0 z-30" onClick={() => setShowProfile(false)} />
                      <div className="absolute left-0 top-full z-40 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
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
                            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
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
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {me ? `${me.first_name} ${me.last_name}` : t("messagesPage.profile.youFallback")}
                          </p>
                        </div>
                        {/* Status */}
                        <div className="mt-3">
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
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
                                placeholder={t("messagesPage.profile.statusPlaceholder")}
                                data-gramm="false"
                                className="min-w-0 flex-1 rounded-lg border border-brand-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-200"
                              />
                              <button
                                type="button"
                                onClick={saveStatus}
                                className="rounded-lg bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
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
                              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm text-gray-600 hover:bg-gray-50"
                            >
                              <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
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
                          className="mt-3 flex w-full items-center gap-2 rounded-lg border-t border-gray-100 px-2 pt-3 text-left text-sm text-brand-700 hover:text-brand-800"
                        >
                          <Bookmark className="h-4 w-4 flex-shrink-0" />
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
                  className="min-w-0 text-left"
                  title={t("messagesPage.profile.yourProfileTitle")}
                >
                  <p className="truncate text-base font-semibold leading-snug text-gray-900">
                    {me ? `${me.first_name} ${me.last_name}` : t("messagesPage.profile.youFallback")}
                  </p>
                  <p className="truncate text-xs leading-snug text-gray-500">
                    {myStatus?.status || t("messagesPage.profile.statusPlaceholder")}
                  </p>
                </button>
              </div>
              <button
                onClick={() => setShowNewChat(true)}
                className="flex items-center gap-1.5 bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-brand-700 flex-shrink-0"
              >
                <Plus className="h-4 w-4" /> {t("messagesPage.list.newChat")}
              </button>
            </div>
            <div className="relative h-10">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("messagesPage.search.placeholder")}
                // data-gramm*: stop Grammarly/extensions from injecting an overlay
                // widget here (its outline was floating up over the heading).
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                className="absolute inset-0 w-full h-full pl-9 pr-3 border border-gray-300 rounded-lg text-sm outline-none transition-colors focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
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
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <Archive className="h-4 w-4 text-gray-400" />
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
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 bg-gray-200 rounded" />
                      <div className="h-2.5 w-full bg-gray-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className="p-6 text-center text-sm text-red-500">
                {t("messagesPage.list.loadError")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-gray-400">
                <MessagesSquare className="h-10 w-10 mb-3 text-gray-300" />
                {search ? (
                  <p className="text-sm">{t("messagesPage.list.noSearchMatch", { query: search })}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-500">{t("messagesPage.list.noConversationsTitle")}</p>
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
                <p className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {t("messagesPage.search.messagesHeader")}
                  {searchingMessages && (
                    <span className="ml-2 inline-block h-3 w-3 align-middle border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
                  )}
                </p>
                {!searchingMessages && !showMessageResults ? (
                  <p className="px-2 py-2 text-xs text-gray-400">
                    {t("messagesPage.search.noMessageMatch", { query: debouncedSearch.trim() })}
                  </p>
                ) : (
                  (messageHits ?? []).map((hit) => (
                    <button
                      key={hit.message_id}
                      onClick={() => openFromSearch(hit.conversation_id)}
                      className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-gray-800">
                          {hit.conversation_title}
                        </span>
                        <span
                          className="flex-shrink-0 text-[10px] text-gray-400"
                          title={new Date(hit.created_at).toLocaleString()}
                        >
                          {relativeTime(hit.created_at)}
                        </span>
                      </span>
                      <span className="truncate text-xs text-gray-500 w-full">
                        <span className="text-gray-400">{t("messagesPage.search.senderPrefix", { name: hit.sender_name })}</span>
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
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 text-gray-400">
              <div className="h-16 w-16 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center mb-4">
                <MessagesSquare className="h-8 w-8" />
              </div>
              <p className="text-lg font-medium text-gray-600">{t("messagesPage.empty.yourMessagesTitle")}</p>
              <p className="text-sm mt-1 max-w-xs">
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
