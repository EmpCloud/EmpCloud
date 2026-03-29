# AI Chatbot Module — End-to-End Test Plan

## Module Overview
AI-powered HR assistant chatbot with conversation management, markdown-rendered responses, suggested questions, and multi-session support. Supports both AI-powered and basic (fallback) modes.

---

## Test Phases

### Phase 1: Conversation Management

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Create new conversation | Session created, appears in sidebar |
| 2 | Conversation shows in sidebar | Title, updated date, message count |
| 3 | List conversations | All user conversations listed |
| 4 | Select conversation | Messages load in main area |
| 5 | Delete conversation | Removed from sidebar, chat area clears |
| 6 | Delete currently selected conversation | Unselects and shows empty state |
| 7 | Multiple conversations | Can switch between them |

### Phase 2: Messaging

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 8 | Send message in conversation | User message appears right-aligned |
| 9 | AI response received | Bot message appears left-aligned |
| 10 | Typing indicator during AI response | 3 animated dots shown |
| 11 | Send empty message | Button disabled / blocked |
| 12 | Enter key sends message | Message submitted |
| 13 | Shift+Enter for multi-line | New line inserted |
| 14 | Auto-scroll to latest message | View scrolls down |
| 15 | Message timestamps | HH:MM format shown |

### Phase 3: Empty State & Suggestions

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 16 | No conversation selected | Bot icon, "How can I help?" heading |
| 17 | Suggested questions grid (up to 6) | Clickable suggestion cards |
| 18 | Click suggestion | Starts new conversation with that question |
| 19 | "Start a Conversation" button | Creates new session |
| 20 | Follow-up suggestions after messages | Up to 4 suggestions (while < 6 messages) |

### Phase 4: Markdown Rendering

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 21 | Bold text in response | **Bold** rendered correctly |
| 22 | Italic text in response | *Italic* rendered |
| 23 | Inline code in response | `code` with gray background |
| 24 | Links in response | Clickable hyperlinks |
| 25 | Unordered/ordered lists | Proper list formatting |
| 26 | Tables in response | Headers + alternating row colors |
| 27 | Quoted text as clickable suggestions | Quotes auto-detect as suggestions |
| 28 | Question patterns as clickable buttons | What/How/Show patterns clickable |

### Phase 5: AI Status & Mode

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | Check AI status endpoint | Returns engine + provider info |
| 30 | AI-powered mode indicator | "AI-powered" badge with sparkles |
| 31 | Basic mode fallback | "Basic mode" badge if AI unavailable |
| 32 | Status indicator: "Online" | Green dot in header |

### Phase 6: UI Responsiveness

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 33 | Desktop: sidebar + chat visible | Side-by-side layout |
| 34 | Mobile: sidebar toggle | Back button hides sidebar |
| 35 | Select conversation on mobile | Sidebar hides, chat shows |
| 36 | User avatar with initials | Correct initials displayed |
| 37 | Bot avatar with gradient | Consistent bot styling |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/chatbot/conversations` | GET/POST | List/Create conversations |
| `/api/v1/chatbot/conversations/:id` | GET/DELETE | Messages/Archive |
| `/api/v1/chatbot/conversations/:id/send` | POST | Send message + get response |
| `/api/v1/chatbot/suggestions` | GET | Suggested questions |
| `/api/v1/chatbot/ai-status` | GET | AI engine status |

## Message Roles

| Role | Description | Alignment |
|------|-------------|-----------|
| `user` | Employee message | Right-aligned, brand color |
| `assistant` | AI response | Left-aligned, white bg |
| `system` | System context | Not displayed |

## AI Response Features

- Markdown rendering (bold, italic, code, lists, tables, links)
- Clickable question suggestions extracted from responses
- Follow-up suggestions based on conversation context
- Typing indicator animation during response generation
