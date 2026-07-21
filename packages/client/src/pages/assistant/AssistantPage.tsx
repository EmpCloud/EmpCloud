import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, Menu, MessageSquare, Pencil, Plus, Send, Sparkles, Square, Trash2, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as Dialog from "@radix-ui/react-dialog";
import api from "@/api/client";
import { useAuthStore } from "@/lib/auth-store";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Conversation = {
  id: number;
  title: string | null;
  message_count: number;
  updated_at: string;
};

type ConversationDetail = Conversation & {
  messages: Array<{ id: number; role: "user" | "assistant"; content: string }>;
};

const SUGGESTED_QUESTIONS = [
  "What is my leave balance?",
  "Show my attendance for this month",
  "What is my shift schedule this week?",
  "What was my net pay last month?",
];

function AssistantAnswer({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h2 className="mb-3 mt-1 text-lg font-semibold">{children}</h2>,
        h2: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold first:mt-0">{children}</h3>,
        h3: ({ children }) => <h4 className="mb-2 mt-4 text-sm font-semibold first:mt-0">{children}</h4>,
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-4 border-brand-300 bg-brand-50/60 px-4 py-2 text-muted-foreground dark:bg-brand-950/20">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 max-w-full overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
        th: ({ children }) => <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-foreground">{children}</th>,
        td: ({ children }) => <td className="whitespace-nowrap px-3 py-2.5 align-top">{children}</td>,
        code: ({ children, className }) =>
          className ? (
            <code className={`${className} block overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs`}>{children}</code>
          ) : (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
          ),
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700">
            {children}
          </a>
        ),
        hr: () => <hr className="my-5 border-border" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<number>();
  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<string>();
  const [streamingMessageId, setStreamingMessageId] = useState<string>();
  const [error, setError] = useState<string>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isOpeningConversation, setIsOpeningConversation] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Conversation>();
  const [renameTitle, setRenameTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation>();
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    void loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const response = await api.get("/assistant/conversations");
      setConversations(response.data.data as Conversation[]);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || "Unable to load chat history.");
    } finally {
      setIsLoadingHistory(false);
    }
  }

  function newChat() {
    streamAbortRef.current?.abort();
    setConversationId(undefined);
    setMessages([]);
    setError(undefined);
    setHistoryOpen(false);
    inputRef.current?.focus();
  }

  async function openConversation(id: number) {
    if (isSending || isOpeningConversation) return;
    setIsOpeningConversation(true);
    setError(undefined);
    try {
      const response = await api.get(`/assistant/conversations/${id}`);
      const detail = response.data.data as ConversationDetail;
      setConversationId(detail.id);
      setMessages(detail.messages.map((message) => ({
        id: String(message.id),
        role: message.role,
        content: message.content,
      })));
      setHistoryOpen(false);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || "Unable to open that conversation.");
    } finally {
      setIsOpeningConversation(false);
    }
  }

  function openRenameConversation(conversation: Conversation) {
    setRenameTarget(conversation);
    setRenameTitle(conversation.title || "Untitled chat");
  }

  async function saveConversationName() {
    if (!renameTarget) return;
    const title = renameTitle.trim();
    if (!title || title === renameTarget.title) {
      if (title === renameTarget.title) setRenameTarget(undefined);
      return;
    }
    setIsRenaming(true);
    try {
      await api.patch(`/assistant/conversations/${renameTarget.id}`, { title });
      setConversations((current) => current.map((item) => item.id === renameTarget.id ? { ...item, title } : item));
      setRenameTarget(undefined);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || "Unable to rename that conversation.");
    } finally {
      setIsRenaming(false);
    }
  }

  async function deleteConversation() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/assistant/conversations/${deleteTarget.id}`);
      setConversations((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (conversationId === deleteTarget.id) newChat();
      setDeleteTarget(undefined);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error?.message || "Unable to delete that conversation.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function sendMessage(text = input) {
    const message = text.trim();
    if (!message || isSending) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: message,
    };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setError(undefined);
    setIsSending(true);
    setStreamStatus("Connecting to your HR data…");
    const assistantMessageId = `${Date.now()}-assistant`;
    setStreamingMessageId(assistantMessageId);
    setMessages((current) => [...current, { id: assistantMessageId, role: "assistant", content: "" }]);
    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    try {
      const token = useAuthStore.getState().accessToken;
      const response = await fetch("/api/v1/assistant/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message, ...(conversationId ? { conversation_id: conversationId } : {}) }),
        signal: abortController.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || `Assistant request failed (${response.status})`);
      }
      if (!response.body) throw new Error("Streaming is not supported by this browser.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | undefined;
      const handleEvent = (block: string) => {
        const lines = block.split("\n");
        const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || "message";
        const dataText = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (!dataText) return;
        const data = JSON.parse(dataText);
        if (event === "conversation") setConversationId(Number(data.conversation_id));
        if (event === "status") setStreamStatus(data.message || "Checking live HR data…");
        if (event === "delta" && data.text) {
          setStreamStatus(undefined);
          setMessages((current) => current.map((item) => item.id === assistantMessageId
            ? { ...item, content: item.content + String(data.text) }
            : item));
        }
        if (event === "error") streamError = data.message || "The assistant could not complete this response.";
      };
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          handleEvent(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
        }
        if (done) break;
      }
      if (buffer.trim()) handleEvent(buffer);
      if (streamError) throw new Error(streamError);
      await loadConversations();
    } catch (requestError: any) {
      if (requestError?.name !== "AbortError") {
        setError(requestError?.message || "I couldn't answer that right now. Please try again.");
        setMessages((current) => current.filter((item) => item.id !== assistantMessageId || item.content.length > 0));
      }
    } finally {
      streamAbortRef.current = null;
      setIsSending(false);
      setStreamStatus(undefined);
      setStreamingMessageId(undefined);
      inputRef.current?.focus();
    }
  }

  function stopStreaming() {
    streamAbortRef.current?.abort();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <section className="-m-4 flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-background md:-m-8">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-6">
        <button type="button" onClick={() => setHistoryOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg border text-muted-foreground md:hidden" aria-label="Open chat history">
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">HR Assistant</h1>
          <p className="text-sm text-muted-foreground">Ask questions about your live HR data</p>
        </div>
        <button type="button" onClick={newChat} className="ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {historyOpen && <button type="button" className="absolute inset-0 z-20 bg-black/30 md:hidden" onClick={() => setHistoryOpen(false)} aria-label="Close chat history overlay" />}
        <aside className={`${historyOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-30 w-72 flex-col border-r bg-card md:static md:flex md:w-64`}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageSquare className="h-4 w-4" /> Chat history
            </div>
            <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden" aria-label="Close chat history">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3">
            <button type="button" onClick={newChat} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {isLoadingHistory ? (
              <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">No conversations yet</p>
            ) : conversations.map((conversation) => (
              <div key={conversation.id} className={`group mb-1 flex items-center rounded-lg ${conversationId === conversation.id ? "bg-brand-50 text-brand-700 dark:bg-brand-950/30" : "hover:bg-muted"}`}>
                <button type="button" onClick={() => void openConversation(conversation.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left" disabled={isOpeningConversation}>
                  <span className="block truncate text-sm font-medium">{conversation.title || "Untitled chat"}</span>
                  <span className="block text-xs text-muted-foreground">{conversation.message_count} messages</span>
                </button>
                <div className="mr-1 flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button type="button" onClick={() => openRenameConversation(conversation)} className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`Rename ${conversation.title || "conversation"}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(conversation)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${conversation.title || "conversation"}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-4 py-6 md:px-8">
          {messages.length === 0 ? (
            <div className="m-auto flex w-full max-w-2xl flex-col items-center py-10 text-center">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/40">
                <Bot className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">How can I help?</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Get quick answers from attendance, leave, payroll, and productivity data you have permission to view.
              </p>
              <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void sendMessage(question)}
                    className="rounded-xl border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-brand-300 hover:bg-brand-50/60 dark:hover:bg-brand-950/20"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6" aria-live="polite">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.role === "user"
                        ? "max-w-[85%] whitespace-pre-wrap rounded-br-md bg-brand-600 text-white md:max-w-[75%]"
                        : "min-w-0 max-w-[calc(100%-2.75rem)] rounded-bl-md border bg-card text-foreground shadow-sm md:max-w-[90%]"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      message.content ? (
                        <div>
                          <AssistantAnswer>{message.content}</AssistantAnswer>
                          {streamingMessageId === message.id && <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-brand-500 align-middle" aria-hidden="true" />}
                        </div>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <LoaderCircle className="h-4 w-4 animate-spin" /> {streamStatus || "Preparing your answer…"}
                        </span>
                      )
                    ) : (
                      message.content
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-card/95 px-4 py-3 backdrop-blur md:px-6 md:py-4">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl">
          {error && <p className="mb-2 text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 dark:focus-within:ring-brand-950">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about attendance, leave, payroll, or productivity…"
              rows={1}
              maxLength={4000}
              disabled={isSending}
              aria-label="Message HR Assistant"
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            {isSending ? (
              <button type="button" onClick={stopStreaming} aria-label="Stop response" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-80">
                <Square className="h-4 w-4 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Answers are limited to data you’re authorized to access.
          </p>
        </form>
      </div>
        </main>
      </div>

      <Dialog.Root open={Boolean(renameTarget)} onOpenChange={(open) => { if (!open && !isRenaming) setRenameTarget(undefined); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <form onSubmit={(event) => { event.preventDefault(); void saveConversationName(); }}>
              <div className="flex items-start justify-between gap-4 p-6">
                <div>
                  <Dialog.Title className="text-base font-semibold text-foreground">Rename conversation</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted-foreground">Choose a clear title for this chat.</Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" disabled={isRenaming} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Close rename conversation">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="px-6 pb-6">
                <label htmlFor="assistant-conversation-title" className="mb-2 block text-sm font-medium text-foreground">Conversation title</label>
                <input
                  id="assistant-conversation-title"
                  autoFocus
                  value={renameTitle}
                  onChange={(event) => setRenameTitle(event.target.value)}
                  maxLength={255}
                  disabled={isRenaming}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:opacity-60 dark:focus:ring-brand-950"
                />
                {!renameTitle.trim() && <p className="mt-2 text-xs text-red-600">A conversation title is required.</p>}
                <p className="mt-2 text-right text-xs text-muted-foreground">{renameTitle.length}/255</p>
              </div>
              <div className="flex justify-end gap-3 rounded-b-xl border-t bg-muted px-6 py-4">
                <button type="button" onClick={() => setRenameTarget(undefined)} disabled={isRenaming} className="rounded-lg border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={isRenaming || !renameTitle.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                  {isRenaming ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete conversation?"
        description={`“${deleteTarget?.title || "Untitled chat"}” and its message history will be removed from your chat list.`}
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
        onConfirm={() => void deleteConversation()}
        onCancel={() => { if (!isDeleting) setDeleteTarget(undefined); }}
      />
    </section>
  );
}
