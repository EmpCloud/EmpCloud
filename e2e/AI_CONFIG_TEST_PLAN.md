# AI Configuration — End-to-End Test Plan

## Module Overview
Super admin control panel for configuring the AI chatbot's provider, API keys, models, and settings. Supports 7 AI providers with test-connection capability.

---

## Test Phases

### Phase 1: Configuration Overview

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 1 | Navigate to `/admin/ai-config` as super admin | Config page loads |
| 2 | Active provider banner shows current provider | Provider name + model displayed |
| 3 | All 7 provider cards listed | Anthropic, OpenAI, Gemini, DeepSeek, Groq, Ollama, Custom |
| 4 | Status badges: Active/Configured/Not configured | Correct per provider |

### Phase 2: Provider Configuration

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 5 | Configure Anthropic: set API key + select model | Key saved (masked on reload) |
| 6 | Anthropic models: claude-sonnet-4, claude-haiku-4-5 | Dropdown options correct |
| 7 | Configure OpenAI: set API key + select model | Key saved |
| 8 | OpenAI models: gpt-4o, gpt-4o-mini, gpt-4-turbo | Dropdown options correct |
| 9 | Configure Gemini: set API key + select model | Key saved |
| 10 | Gemini models: gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | Correct |
| 11 | Configure DeepSeek: API key + base URL + model | All fields saved |
| 12 | DeepSeek default base URL: api.deepseek.com | Pre-filled |
| 13 | Configure Groq: API key + base URL + model | All fields saved |
| 14 | Configure Ollama (no API key needed): base URL + model | Only URL + model needed |
| 15 | Ollama default URL: localhost:11434 | Pre-filled |
| 16 | Custom OpenAI-compatible: all fields | Custom model text input |
| 17 | API key field: password type with show/hide toggle | Masked by default |
| 18 | API keys masked on reload (GET response) | Keys not returned in plain text |

### Phase 3: Provider Activation

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 19 | "Save & Activate" a provider | Provider becomes active |
| 20 | Previous provider deactivated | Only one active at a time |
| 21 | Active provider banner updates | Shows new provider |
| 22 | "Deactivate" active provider | active_provider = "none" |
| 23 | Chatbot falls back to basic mode | AI status shows "Basic mode" |

### Phase 4: Test Connection

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 24 | Test Anthropic connection (valid key) | Success + latency_ms shown |
| 25 | Test with invalid API key | Failure message |
| 26 | Test Ollama (local) | Success if running, failure if not |
| 27 | Test result: success badge (green) | Latency displayed |
| 28 | Test result: failure badge (red) | Error message shown |

### Phase 5: General Settings

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 29 | Max tokens slider (1024-8192) | Default: 4096 |
| 30 | Save max tokens | Value persists on reload |
| 31 | ai_max_tokens range: 256-32768 | API validation |

### Phase 6: Access Control

| # | Test Case | Expected Result |
|---|-----------|-----------------|
| 32 | Non-super-admin accesses AI config | 403 Forbidden |
| 33 | org_admin accesses AI config | 403 Forbidden |
| 34 | Super admin has full access | All operations available |

---

## Key API Endpoints Under Test

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/admin/ai-config` | GET | Get all config (keys masked) |
| `/api/v1/admin/ai-config/status` | GET | Active provider + status |
| `/api/v1/admin/ai-config/:key` | PUT | Update config value |
| `/api/v1/admin/ai-config/test` | POST | Test provider connection |

## Supported Providers

| Provider | API Key Required | Base URL | Models |
|----------|-----------------|----------|--------|
| Anthropic | Yes | N/A | claude-sonnet-4, claude-haiku-4-5 |
| OpenAI | Yes | N/A | gpt-4o, gpt-4o-mini, gpt-4-turbo |
| Gemini | Yes | N/A | gemini-2.5-pro, gemini-2.5-flash |
| DeepSeek | Yes | api.deepseek.com | deepseek-chat, deepseek-reasoner |
| Groq | Yes | api.groq.com/openai | llama-3.3-70b, mixtral-8x7b |
| Ollama | No | localhost:11434 | llama3, mistral, codellama |
| Custom | Yes | Configurable | Custom input |
