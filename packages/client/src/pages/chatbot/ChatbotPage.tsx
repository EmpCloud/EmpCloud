import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  MessageCircle,
  Send,
  Plus,
  Trash2,
  Bot,
  User,
  Loader2,
  Sparkles,
  ArrowLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conversation {
  id: number;
  title: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Markdown-lite renderer (bold, italic, links, tables, lists)
// ---------------------------------------------------------------------------

function renderMarkdown(text: string, onClickSuggestion?: (text: string) => void) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableRows: string[][] = [];
  let inTable = false;
  let listItems: string[] = [];
  let inList = false;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 my-2">
          {listItems.map((li, i) => (
            <li key={i}>{renderInline(li, onClickSuggestion)}</li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  }

  function flushTable() {
    if (tableRows.length > 0) {
      const header = tableRows[0];
      const body = tableRows.slice(1).filter((r) => !r.every((c) => /^[-|:\s]+$/.test(c)));
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead>
              <tr className="bg-gray-50">
                {header.map((cell, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-gray-700 border-b border-gray-200">
                    {renderInline(cell.trim(), onClickSuggestion)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-gray-600 border-b border-gray-100">
                      {renderInline(cell.trim(), onClickSuggestion)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table line
    if (line.includes("|") && line.trim().startsWith("|")) {
      flushList();
      inTable = true;
      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable();
    }

    // List item
    if (/^[-*]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())) {
      flushTable();
      inList = true;
      const content = line.trim().replace(/^[-*]\s|^\d+\.\s/, "");
      listItems.push(content);
      continue;
    } else if (inList) {
      flushList();
    }

    // Empty line
    if (line.trim() === "") {
      flushTable();
      flushList();
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
  }

  flushTable();
  flushList();

  return elements;
}

function renderInline(text: string, onClickSuggestion?: (text: string) => void): React.ReactNode {
  // Process bold, italic, links, inline code, and "quoted suggestions"
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*"?(.+?)"?\*\*)|(\*"?(.+?)"?\*)|(\[(.+?)\]\((.+?)\))|(`(.+?)`)|("([^"]{8,}[?]?)")/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold — make clickable if looks like a question/suggestion
      const boldText = match[2];
      const looksClickable = onClickSuggestion && (boldText.includes("?") || /^(what|how|show|who|give|list|when|get)/i.test(boldText));
      if (looksClickable) {
        parts.push(
          <button key={`b-${match.index}`} onClick={() => onClickSuggestion(boldText)} className="text-left font-semibold text-violet-600 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors">
            {boldText}
          </button>
        );
      } else {
        parts.push(
          <strong key={`b-${match.index}`} className="font-semibold">
            {boldText}
          </strong>
        );
      }
    } else if (match[3]) {
      // Italic — make clickable if looks like a suggestion
      const italicText = match[4];
      if (onClickSuggestion && (italicText.includes("?") || italicText.length > 10)) {
        parts.push(
          <button key={`i-${match.index}`} onClick={() => onClickSuggestion(italicText)} className="text-left italic text-violet-600 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors">
            {italicText}
          </button>
        );
      } else {
        parts.push(
          <em key={`i-${match.index}`} className="italic text-gray-500">
            {italicText}
          </em>
        );
      }
    } else if (match[5]) {
      // Link
      parts.push(
        <a
          key={`a-${match.index}`}
          href={match[7]}
          className="text-brand-600 hover:text-brand-700 underline underline-offset-2"
        >
          {match[6]}
        </a>
      );
    } else if (match[8]) {
      // Code
      parts.push(
        <code
          key={`c-${match.index}`}
          className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono"
        >
          {match[9]}
        </code>
      );
    } else if (match[10]) {
      // "Quoted text" — make clickable as suggestion
      const quoted = match[11];
      if (onClickSuggestion) {
        parts.push(
          <button key={`q-${match.index}`} onClick={() => onClickSuggestion(quoted)} className="text-left text-violet-600 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors">
            &ldquo;{quoted}&rdquo;
          </button>
        );
      } else {
        parts.push(<span key={`q-${match.index}`}>&ldquo;{quoted}&rdquo;</span>);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const time = new Date(message.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div
        className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-brand-100" : "bg-gradient-to-br from-violet-500 to-purple-600"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-brand-700" />
        ) : (
          <Bot className="h-4 w-4 text-white" />
        )}
      </div>
      <div className={`max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isUser
              ? "bg-brand-600 text-white rounded-br-md"
              : "bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm"
          }`}
        >
          <div className={`text-sm ${isUser ? "text-white" : "text-gray-800"}`}>
            {isUser ? message.content : renderMarkdown(message.content, handleSend)}
          </div>
        </div>
        <p className={`text-[10px] text-gray-400 mt-1 ${isUser ? "text-right" : "text-left"}`}>
          {time}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Typing Indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
        <Bot className="h-4 w-4 text-white" />
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex gap-1.5 items-center h-5">
          <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ChatbotPage() {
  const queryClient = useQueryClient();
  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["chatbot-conversations"],
    queryFn: () => api.get("/chatbot/conversations").then((r) => r.data.data),
  });

  // Fetch messages for active conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["chatbot-messages", activeConvoId],
    queryFn: () =>
      api.get(`/chatbot/conversations/${activeConvoId}`).then((r) => r.data.data),
    enabled: !!activeConvoId,
  });

  // Fetch AI status
  const { data: aiStatus } = useQuery<{ engine: string; provider: string }>({
    queryKey: ["chatbot-ai-status"],
    queryFn: () => api.get("/chatbot/ai-status").then((r) => r.data.data),
    staleTime: 60_000,
  });

  // Fetch suggestions
  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ["chatbot-suggestions"],
    queryFn: () => api.get("/chatbot/suggestions").then((r) => r.data.data),
  });

  // Create conversation
  const createConvo = useMutation({
    mutationFn: () => api.post("/chatbot/conversations"),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-conversations"] });
      setActiveConvoId(res.data.data.id);
      setShowSidebar(false);
    },
  });

  // Send message
  const sendMsg = useMutation({
    mutationFn: (payload: { conversationId: number; message: string }) =>
      api.post(`/chatbot/conversations/${payload.conversationId}/send`, {
        message: payload.message,
      }),
    onMutate: () => {
      setIsTyping(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-messages", activeConvoId] });
      queryClient.invalidateQueries({ queryKey: ["chatbot-conversations"] });
      setIsTyping(false);
    },
    onError: () => {
      setIsTyping(false);
    },
  });

  // Delete conversation
  const deleteConvo = useMutation({
    mutationFn: (id: number) => api.delete(`/chatbot/conversations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-conversations"] });
      if (activeConvoId) setActiveConvoId(null);
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Focus input when conversation changes
  useEffect(() => {
    if (activeConvoId) inputRef.current?.focus();
  }, [activeConvoId]);

  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || inputValue).trim();
      if (!msg || !activeConvoId || sendMsg.isPending) return;
      setInputValue("");
      sendMsg.mutate({ conversationId: activeConvoId, message: msg });
    },
    [inputValue, activeConvoId, sendMsg]
  );

  const handleNewChat = useCallback(() => {
    createConvo.mutate();
  }, [createConvo]);

  const handleSelectConvo = useCallback((id: number) => {
    setActiveConvoId(id);
    setShowSidebar(false);
  }, []);

  return (
    <div className="h-[calc(100vh-7rem)] flex rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Sidebar — conversation list */}
      <div
        className={`${
          showSidebar ? "flex" : "hidden md:flex"
        } flex-col w-full md:w-80 border-r border-gray-200 bg-gray-50 shrink-0`}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">AI Assistant</h2>
                <p className="text-[10px] text-gray-400">
                  {aiStatus?.engine === "ai" ? "AI-powered" : "Basic mode"}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleNewChat}
            disabled={createConvo.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {createConvo.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            New Conversation
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No conversations yet</p>
              <p className="text-xs text-gray-400 mt-1">Start a new conversation above</p>
            </div>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-lg cursor-pointer transition-colors ${
                  activeConvoId === c.id
                    ? "bg-brand-50 border border-brand-200"
                    : "hover:bg-gray-100 border border-transparent"
                }`}
              >
                <button
                  onClick={() => handleSelectConvo(c.id)}
                  className="flex-1 text-left px-3 py-2.5 min-w-0"
                >
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {c.title || "New conversation"}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(c.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    &middot; {c.message_count} messages
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConvo.mutate(c.id);
                  }}
                  className="shrink-0 p-1.5 mr-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeConvoId ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
              <button
                onClick={() => setShowSidebar(true)}
                className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  {conversations.find((c) => c.id === activeConvoId)?.title || "New Conversation"}
                </h3>
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] text-green-600 font-medium">Online</p>
                  {aiStatus?.engine === "ai" ? (
                    <span className="inline-flex items-center gap-0.5 bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full text-[9px] font-medium">
                      <Sparkles className="h-2.5 w-2.5" /> AI-powered
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full text-[9px]">
                      Basic mode
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
              {messages.length === 0 && !isTyping && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-200">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    How can I help you today?
                  </h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-md">
                    I can answer questions about leave, attendance, policies, holidays, and more.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                    {suggestions.slice(0, 6).map((s, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(s)}
                        className="text-left px-3 py-2.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors shadow-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {isTyping && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>

            {/* Suggestion chips when conversation has messages */}
            {messages.length > 0 && messages.length < 6 && (
              <div className="px-4 py-2 border-t border-gray-100 bg-white flex gap-2 overflow-x-auto shrink-0">
                {suggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    className="shrink-0 text-xs px-3 py-1.5 text-brand-700 bg-brand-50 border border-brand-200 rounded-full hover:bg-brand-100 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input area */}
            <div className="px-4 py-3 border-t border-gray-200 bg-white shrink-0">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type your message..."
                  disabled={sendMsg.isPending}
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!inputValue.trim() || sendMsg.isPending}
                  className="h-10 w-10 flex items-center justify-center bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {sendMsg.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                {aiStatus?.engine === "ai"
                  ? "AI-powered HR assistant with real-time data access. For complex issues, contact your HR team."
                  : "Basic HR assistant. For complex issues, contact your HR team."}
              </p>
            </div>
          </>
        ) : (
          /* Empty state — no conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/50">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-6 shadow-xl shadow-violet-200">
              <Sparkles className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">AI HR Assistant</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm text-center">
              Get instant answers to your HR questions. Ask about leave, attendance, policies, holidays, and more.
            </p>
            <button
              onClick={handleNewChat}
              disabled={createConvo.isPending}
              className="flex items-center gap-2 px-6 py-3 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-700 transition-colors shadow-lg shadow-brand-200 disabled:opacity-50"
            >
              {createConvo.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Start a Conversation
            </button>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full px-4">
              {suggestions.slice(0, 4).map((s, i) => (
                <div
                  key={i}
                  className="text-left px-3 py-2.5 text-sm text-gray-500 bg-white border border-gray-200 rounded-xl"
                >
                  <span className="text-gray-400 mr-1">&quot;</span>
                  {s}
                  <span className="text-gray-400 ml-1">&quot;</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
