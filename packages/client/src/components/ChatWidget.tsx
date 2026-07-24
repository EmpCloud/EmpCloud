import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { usePermissions } from "@/lib/use-permissions";
import {
  MessageCircle,
  Send,
  X,
  Bot,
  User,
  Loader2,
  Sparkles,
  Maximize2,
} from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Mini markdown renderer for widget
// ---------------------------------------------------------------------------

function renderWidgetMarkdown(text: string, onClickSuggestion?: (text: string) => void): React.ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.trim() === "") return <div key={i} className="h-1.5" />;

    // Process inline markdown
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*"?(.+?)"?\*\*)|(\*"?(.+?)"?\*)|(\[(.+?)\]\((.+?)\))|("([^"]{8,}[?]?)")/g;
    let lastIdx = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIdx) parts.push(line.slice(lastIdx, match.index));
      if (match[1]) {
        // **bold text** — make clickable if it looks like a question/suggestion
        const boldText = match[2];
        const looksClickable = boldText.includes("?") || boldText.toLowerCase().startsWith("what") || boldText.toLowerCase().startsWith("how") || boldText.toLowerCase().startsWith("show") || boldText.toLowerCase().startsWith("who") || boldText.toLowerCase().startsWith("give") || boldText.toLowerCase().startsWith("list");
        if (looksClickable && onClickSuggestion) {
          parts.push(
            <button key={`b-${i}-${match.index}`} onClick={() => onClickSuggestion(boldText)} className="text-left font-semibold text-violet-600 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors">
              {boldText}
            </button>
          );
        } else {
          parts.push(<strong key={`b-${i}-${match.index}`} className="font-semibold">{boldText}</strong>);
        }
      } else if (match[3]) {
        // *italic text* — also make clickable if it looks like a suggestion
        const italicText = match[4];
        if (onClickSuggestion && (italicText.includes("?") || italicText.length > 10)) {
          parts.push(
            <button key={`i-${i}-${match.index}`} onClick={() => onClickSuggestion(italicText)} className="text-left italic text-violet-600 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors">
              {italicText}
            </button>
          );
        } else {
          parts.push(<em key={`i-${i}-${match.index}`}>{italicText}</em>);
        }
      } else if (match[5]) {
        parts.push(
          <a key={`a-${i}-${match.index}`} href={match[7]} className="text-brand-600 underline underline-offset-2 hover:text-brand-700">
            {match[6]}
          </a>
        );
      } else if (match[8]) {
        // "Quoted text" — make clickable as suggestion
        const quoted = match[9];
        if (onClickSuggestion) {
          parts.push(
            <button key={`q-${i}-${match.index}`} onClick={() => onClickSuggestion(quoted)} className="text-left text-violet-600 hover:text-violet-800 hover:underline underline-offset-2 cursor-pointer transition-colors">
              &ldquo;{quoted}&rdquo;
            </button>
          );
        } else {
          parts.push(<span key={`q-${i}-${match.index}`}>&ldquo;{quoted}&rdquo;</span>);
        }
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < line.length) parts.push(line.slice(lastIdx));

    // List items
    if (/^[-*]\s/.test(line.trim()) || /^\d+\.\s/.test(line.trim())) {
      const content = line.trim().replace(/^[-*]\s|^\d+\.\s/, "");
      return (
        <div key={i} className="flex gap-1.5 ml-2">
          <span className="text-gray-400 shrink-0">&bull;</span>
          <span>{parts.length > 1 ? parts : content}</span>
        </div>
      );
    }

    return <p key={i} className="leading-relaxed">{parts.length > 0 ? parts : line}</p>;
  });
}

// ---------------------------------------------------------------------------
// Draggable launcher position
// ---------------------------------------------------------------------------
// The launcher sits above the page in a fixed corner, where it covered action
// buttons on some screens. It can now be dragged anywhere; the chosen spot is
// remembered per browser. A press only counts as a drag once the pointer has
// travelled DRAG_THRESHOLD px, so an ordinary click still opens the assistant.

const LAUNCHER_POSITION_KEY = "empcloud.assistant-launcher-position";
const DRAG_THRESHOLD = 4;
const EDGE_MARGIN = 8;
/** Clicks landing within this long after a drag are the drag's own click — ignore them. */
const CLICK_SUPPRESS_MS = 250;

type Point = { x: number; y: number };

function readStoredPosition(): Point | null {
  try {
    const raw = localStorage.getItem(LAUNCHER_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.x === "number" && typeof parsed?.y === "number"
      ? { x: parsed.x, y: parsed.y }
      : null;
  } catch {
    return null;
  }
}

/** Keep the launcher fully on screen — a stored spot can be off-viewport after a resize. */
function clampToViewport(p: Point, el: HTMLElement | null): Point {
  const w = el?.offsetWidth || 64;
  const h = el?.offsetHeight || 80;
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(p.x, EDGE_MARGIN), maxX),
    y: Math.min(Math.max(p.y, EDGE_MARGIN), maxY),
  };
}

// ---------------------------------------------------------------------------
// Floating Chat Widget
// ---------------------------------------------------------------------------

export default function ChatWidget() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const { has } = usePermissions();
  const canUseChatbot = has("assistant:use");
  // Hide the floating AI widget on the Messages page — its bottom-right launcher
  // overlaps the chat composer + message ticks, and an AI bubble inside a
  // person-to-person chat UI is redundant.
  const onMessagesPage = location.pathname.startsWith("/messages") || location.pathname.startsWith("/assistant");
  const [isOpen, setIsOpen] = useState(false);
  const [convoId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch AI status
  const { data: aiStatus } = useQuery<{ engine: string; provider: string }>({
    queryKey: ["chatbot-ai-status"],
    queryFn: () => api.get("/chatbot/ai-status").then((r) => r.data.data),
    enabled: isOpen && canUseChatbot,
    staleTime: 60_000,
  });

  // Fetch suggestions
  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ["chatbot-suggestions"],
    queryFn: () => api.get("/chatbot/suggestions").then((r) => r.data.data),
    enabled: isOpen && canUseChatbot,
  });

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["chatbot-widget-messages", convoId],
    queryFn: () => api.get(`/chatbot/conversations/${convoId}`).then((r) => r.data.data),
    enabled: !!convoId && canUseChatbot,
  });

  // Send message
  const sendMsg = useMutation({
    mutationFn: (payload: { conversationId: number; message: string }) =>
      api.post(`/chatbot/conversations/${payload.conversationId}/send`, {
        message: payload.message,
        language: i18n.language || "en",
      }),
    onMutate: () => setIsTyping(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-widget-messages", convoId] });
      setIsTyping(false);
    },
    onError: () => setIsTyping(false),
  });

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && convoId) inputRef.current?.focus();
  }, [isOpen, convoId]);

  const handleOpen = useCallback(() => {
    navigate("/assistant");
  }, [navigate]);

  const handleSend = useCallback(
    (text?: string) => {
      const msg = (text || input).trim();
      if (!msg || !convoId || sendMsg.isPending) return;
      setInput("");
      sendMsg.mutate({ conversationId: convoId, message: msg });
    },
    [input, convoId, sendMsg]
  );

  const handleExpand = useCallback(() => {
    setIsOpen(false);
    navigate("/assistant");
  }, [navigate]);

  // --- Launcher dragging -------------------------------------------------
  const launcherRef = useRef<HTMLButtonElement>(null);
  const [launcherPos, setLauncherPos] = useState<Point | null>(readStoredPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    grabX: number;
    grabY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const dragEndedAt = useRef(0);

  // A position stored on a wider window can land off-screen — clamp before paint.
  useLayoutEffect(() => {
    setLauncherPos((p) => (p ? clampToViewport(p, launcherRef.current) : p));
  }, []);

  useEffect(() => {
    function onResize() {
      setLauncherPos((p) => (p ? clampToViewport(p, launcherRef.current) : p));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onLauncherPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      // Offset of the grab point inside the button, so it doesn't jump to the cursor.
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onLauncherPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      setIsDragging(true);
    }
    setLauncherPos(
      clampToViewport({ x: e.clientX - drag.grabX, y: e.clientY - drag.grabY }, e.currentTarget),
    );
  }, []);

  const onLauncherPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!drag.moved) return; // a plain click — let onClick open the assistant
    setIsDragging(false);
    dragEndedAt.current = performance.now();
    const rect = e.currentTarget.getBoundingClientRect();
    try {
      localStorage.setItem(
        LAUNCHER_POSITION_KEY,
        JSON.stringify({ x: rect.left, y: rect.top }),
      );
    } catch {
      // Private mode / quota — position just won't survive a reload.
    }
  }, []);

  const onLauncherClick = useCallback(() => {
    // Releasing a drag also fires a click; timestamp beats a boolean flag, which
    // would stay set (and swallow the next real click) if no click followed.
    if (performance.now() - dragEndedAt.current < CLICK_SUPPRESS_MS) return;
    handleOpen();
  }, [handleOpen]);

  if (!canUseChatbot) return null;
  // Don't render the floating widget over the Messages page.
  if (onMessagesPage) return null;

  if (!isOpen) {
    return (
      <button
        ref={launcherRef}
        onClick={onLauncherClick}
        onPointerDown={onLauncherPointerDown}
        onPointerMove={onLauncherPointerMove}
        onPointerUp={onLauncherPointerUp}
        onPointerCancel={onLauncherPointerUp}
        style={
          launcherPos
            ? { left: launcherPos.x, top: launcherPos.y, right: "auto", bottom: "auto" }
            : undefined
        }
        className={`fixed z-[9999] flex flex-col items-center gap-1 group touch-none select-none ${
          launcherPos ? "" : "bottom-20 right-6"
        } ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        title="EMP AI — Your HR Assistant (drag to move)"
      >
        <div
          className={`relative h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-300 flex items-center justify-center ${
            isDragging
              ? "scale-105 shadow-xl shadow-violet-300"
              : "hover:shadow-xl hover:shadow-violet-300 hover:scale-105 transition-all"
          }`}
        >
          <MessageCircle className="h-6 w-6 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white">
            <span className="absolute inset-0 rounded-full bg-purple-500 animate-ping opacity-75" />
            <span className="absolute inset-0 rounded-full bg-purple-500" />
          </span>
        </div>
        <span className="text-[10px] font-semibold text-purple-600 bg-white px-2 py-0.5 rounded-full shadow-sm border border-purple-100">EMP AI</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">EMP AI &mdash; Your HR Assistant</h3>
            <p className="text-[10px] text-white/70">
              {aiStatus?.engine === "ai" ? "AI-powered" : "Basic mode"}{" "}
              <span className="inline-block ml-1">
                {aiStatus?.engine === "ai" ? (
                  <span className="inline-flex items-center gap-0.5 bg-white/20 px-1.5 py-0.5 rounded-full text-[9px] font-medium">
                    <Sparkles className="h-2.5 w-2.5" /> AI
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 bg-white/10 px-1.5 py-0.5 rounded-full text-[9px]">
                    Basic
                  </span>
                )}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpand}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Open full page"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50/80">
        {messages.length === 0 && !isTyping && (
          <div className="flex flex-col items-center justify-center h-full text-center px-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg shadow-violet-200">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">Hi there!</p>
            <p className="text-xs text-gray-500 mb-4">How can I help you today?</p>
            <div className="space-y-1.5 w-full">
              {suggestions.slice(0, 6).map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="w-full text-left px-3 py-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-brand-300 hover:bg-brand-50 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
              <div
                className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
                  isUser ? "bg-brand-100" : "bg-gradient-to-br from-violet-500 to-purple-600"
                }`}
              >
                {isUser ? (
                  <User className="h-3 w-3 text-brand-700" />
                ) : (
                  <Bot className="h-3 w-3 text-white" />
                )}
              </div>
              <div
                className={`max-w-[75%] rounded-xl px-3 py-2 text-xs ${
                  isUser
                    ? "bg-brand-600 text-white rounded-br-sm"
                    : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                }`}
              >
                {isUser ? msg.content : renderWidgetMarkdown(msg.content, handleSend)}
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex gap-2">
            <div className="shrink-0 h-6 w-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="h-3 w-3 text-white" />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {messages.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 bg-white shrink-0 flex gap-1.5 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          {["My leave balance", "Show team attendance", "Company policies", "Latest announcements", "Upcoming holidays"].map((q) => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              disabled={sendMsg.isPending}
              className="whitespace-nowrap text-[10px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-full border border-purple-200 transition-colors disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask me anything..."
            disabled={sendMsg.isPending}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sendMsg.isPending}
            className="h-8 w-8 flex items-center justify-center bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-40 shrink-0"
          >
            {sendMsg.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
