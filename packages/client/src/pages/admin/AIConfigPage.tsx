// =============================================================================
// EMP CLOUD — AI Configuration Page (Super Admin)
// Configure AI providers (Claude, OpenAI, Gemini, DeepSeek, Groq, Ollama)
// =============================================================================

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import {
  Sparkles,
  Check,
  X,
  Loader2,
  Eye,
  EyeOff,
  Zap,
  AlertCircle,
  Settings,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIConfigRow {
  id: number;
  config_key: string;
  config_value: string | null;
  is_active: boolean;
  updated_at: string;
}

interface ProviderStatus {
  provider: string;
  model: string;
  status: string;
}

interface TestResult {
  success: boolean;
  message: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// Provider definitions
// ---------------------------------------------------------------------------

interface ProviderDef {
  id: string;
  name: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  keyField: string;
  baseUrlField?: string;
  defaultBaseUrl?: string;
  models: { value: string; label: string }[];
  needsApiKey: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    description: "Advanced reasoning and analysis with Claude models",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    keyField: "anthropic_api_key",
    models: [
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
    needsApiKey: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-4o and GPT-4 Turbo models from OpenAI",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    keyField: "openai_api_key",
    models: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    ],
    needsApiKey: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini Pro and Flash models from Google",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    keyField: "gemini_api_key",
    models: [
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    needsApiKey: true,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "Cost-effective reasoning models from DeepSeek",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    keyField: "openai_api_key",
    baseUrlField: "openai_base_url",
    defaultBaseUrl: "https://api.deepseek.com",
    models: [
      { value: "deepseek-chat", label: "DeepSeek Chat" },
      { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
    needsApiKey: true,
  },
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference with Groq LPU hardware",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    keyField: "openai_api_key",
    baseUrlField: "openai_base_url",
    defaultBaseUrl: "https://api.groq.com/openai",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
    ],
    needsApiKey: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally with Ollama — no API key needed",
    color: "text-gray-700",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    keyField: "",
    baseUrlField: "openai_base_url",
    defaultBaseUrl: "http://localhost:11434",
    models: [
      { value: "llama3", label: "Llama 3" },
      { value: "mistral", label: "Mistral" },
      { value: "codellama", label: "Code Llama" },
    ],
    needsApiKey: false,
  },
  {
    id: "openai-compatible",
    name: "Custom OpenAI-Compatible",
    description: "Any provider with an OpenAI-compatible API endpoint",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    keyField: "openai_api_key",
    baseUrlField: "openai_base_url",
    models: [],
    needsApiKey: true,
  },
];

// ---------------------------------------------------------------------------
// Status badge component
// ---------------------------------------------------------------------------

function StatusBadge({
  status,
}: {
  status: "active" | "configured" | "not_configured";
}) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle2 className="w-3 h-3" />
        Active
      </span>
    );
  }
  if (status === "configured") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        <Circle className="w-3 h-3" />
        Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
      <XCircle className="w-3 h-3" />
      Not configured
    </span>
  );
}

// ---------------------------------------------------------------------------
// Provider Card Component
// ---------------------------------------------------------------------------

function ProviderCard({
  provider,
  configMap,
  activeProvider,
  currentModel,
  onSave,
  onActivate,
  onTest,
  isSaving,
}: {
  provider: ProviderDef;
  configMap: Record<string, string | null>;
  activeProvider: string;
  currentModel: string;
  onSave: (key: string, value: string) => void;
  onActivate: (providerId: string, model: string, baseUrl?: string) => void;
  onTest: (
    providerId: string,
    apiKey: string,
    model: string,
    baseUrl?: string
  ) => Promise<TestResult | null>;
  isSaving: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.defaultBaseUrl || "");
  const [customModel, setCustomModel] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    provider.models[0]?.value || ""
  );
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isActive = activeProvider === provider.id;
  const hasKey = provider.keyField
    ? !!configMap[provider.keyField] &&
      configMap[provider.keyField] !== null
    : true;
  const cardStatus: "active" | "configured" | "not_configured" = isActive
    ? "active"
    : hasKey
    ? "configured"
    : "not_configured";

  // Set model from current config if this provider is active
  useEffect(() => {
    if (isActive && currentModel) {
      const match = provider.models.find((m) => m.value === currentModel);
      if (match) {
        setSelectedModel(currentModel);
      } else if (provider.models.length === 0) {
        setCustomModel(currentModel);
      }
    }
  }, [isActive, currentModel, provider.models]);

  // Set base URL from config
  useEffect(() => {
    if (provider.baseUrlField && configMap[provider.baseUrlField]) {
      setBaseUrl(configMap[provider.baseUrlField] || provider.defaultBaseUrl || "");
    }
  }, [configMap, provider.baseUrlField, provider.defaultBaseUrl]);

  const effectiveModel =
    provider.models.length === 0 ? customModel : selectedModel;

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(
      provider.id,
      apiKey || "",
      effectiveModel,
      provider.baseUrlField ? baseUrl : undefined
    );
    setTestResult(result);
    setTesting(false);
  }

  async function handleSaveAndActivate() {
    // Save API key if provided
    if (provider.keyField && apiKey) {
      onSave(provider.keyField, apiKey);
    }
    // Save base URL if applicable
    if (provider.baseUrlField && baseUrl) {
      onSave(provider.baseUrlField, baseUrl);
    }
    // Save model
    if (effectiveModel) {
      onSave("ai_model", effectiveModel);
    }
    // Activate provider
    onActivate(provider.id, effectiveModel, baseUrl);
  }

  return (
    <div
      className={`border rounded-xl transition-all ${
        isActive
          ? `${provider.borderColor} ring-2 ring-offset-1 ring-${provider.id === "anthropic" ? "amber" : provider.id === "openai" ? "green" : provider.id === "gemini" ? "blue" : "indigo"}-300`
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${provider.bgColor} flex items-center justify-center`}
          >
            <Sparkles className={`w-5 h-5 ${provider.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{provider.name}</h3>
              <StatusBadge status={cardStatus} />
            </div>
            <p className="text-sm text-gray-500">{provider.description}</p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* API Key */}
          {provider.needsApiKey && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    configMap[provider.keyField]
                      ? `Current: ${configMap[provider.keyField]}`
                      : "Enter API key..."
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Base URL */}
          {provider.baseUrlField && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base URL
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider.defaultBaseUrl || "https://api.example.com"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}

          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Model
            </label>
            {provider.models.length > 0 ? (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
              >
                {provider.models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="Enter model name (e.g., my-model)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p>{testResult.message}</p>
                <p className="text-xs mt-1 opacity-75">
                  Latency: {testResult.latency_ms}ms
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleTest}
              disabled={
                testing ||
                (provider.needsApiKey && !apiKey && !configMap[provider.keyField])
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Test Connection
            </button>

            <button
              onClick={handleSaveAndActivate}
              disabled={
                isSaving ||
                (provider.needsApiKey && !apiKey && !configMap[provider.keyField])
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? "text-green-700 bg-green-100 border border-green-300"
                  : "text-white bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isActive ? (
                <Check className="w-4 h-4" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {isActive ? "Active" : "Save & Activate"}
            </button>

            {isActive && (
              <button
                onClick={() => onActivate("none", "", "")}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
              >
                <X className="w-4 h-4" />
                Deactivate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function AIConfigPage() {
  const queryClient = useQueryClient();
  const [maxTokens, setMaxTokens] = useState(4096);

  // Fetch all config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["ai-config"],
    queryFn: async () => {
      const res = await api.get("/admin/ai-config");
      return res.data.data as AIConfigRow[];
    },
  });

  // Fetch status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ["ai-config-status"],
    queryFn: async () => {
      const res = await api.get("/admin/ai-config/status");
      return res.data.data as ProviderStatus;
    },
  });

  // Build config map
  const configMap: Record<string, string | null> = {};
  if (configData) {
    for (const row of configData) {
      configMap[row.config_key] = row.config_value;
    }
  }

  // Sync max tokens from config
  useEffect(() => {
    if (configMap["ai_max_tokens"]) {
      setMaxTokens(parseInt(configMap["ai_max_tokens"], 10) || 4096);
    }
  }, [configData]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: string;
      value: string | null;
    }) => {
      await api.put(`/admin/ai-config/${key}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config"] });
      queryClient.invalidateQueries({ queryKey: ["ai-config-status"] });
    },
  });

  // Test mutation
  const testMutation = useMutation({
    mutationFn: async (params: {
      provider: string;
      api_key: string;
      model: string;
      base_url?: string;
    }) => {
      const res = await api.post("/admin/ai-config/test", params);
      return res.data.data as TestResult;
    },
  });

  function handleSave(key: string, value: string) {
    updateMutation.mutate({ key, value });
  }

  function handleActivate(
    providerId: string,
    model: string,
    baseUrl?: string
  ) {
    updateMutation.mutate({ key: "active_provider", value: providerId });
    if (model) {
      updateMutation.mutate({ key: "ai_model", value: model });
    }
    if (baseUrl) {
      updateMutation.mutate({ key: "openai_base_url", value: baseUrl });
    }
  }

  async function handleTest(
    providerId: string,
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestResult | null> {
    try {
      return await testMutation.mutateAsync({
        provider: providerId,
        api_key: apiKey,
        model,
        base_url: baseUrl,
      });
    } catch (err: any) {
      return {
        success: false,
        message: err?.response?.data?.error?.message || "Test request failed",
        latency_ms: 0,
      };
    }
  }

  function handleMaxTokensSave() {
    updateMutation.mutate({ key: "ai_max_tokens", value: String(maxTokens) });
  }

  const activeProvider = statusData?.provider || "none";
  const currentModel = statusData?.model || "";

  if (configLoading || statusLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-indigo-600" />
          AI Configuration
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Configure AI providers for the HR chatbot assistant. Keys set here
          override environment variables.
        </p>
      </div>

      {/* Active provider banner */}
      <div
        className={`rounded-xl p-4 ${
          activeProvider !== "none"
            ? "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"
            : "bg-gray-50 border border-gray-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                activeProvider !== "none"
                  ? "bg-indigo-100"
                  : "bg-gray-200"
              }`}
            >
              {activeProvider !== "none" ? (
                <Sparkles className="w-5 h-5 text-indigo-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                {activeProvider !== "none" ? (
                  <>
                    AI-Powered Mode{" "}
                    <span className="text-indigo-600 capitalize">
                      ({PROVIDERS.find((p) => p.id === activeProvider)?.name ||
                        activeProvider})
                    </span>
                  </>
                ) : (
                  "Basic Mode (No AI Provider Active)"
                )}
              </h2>
              <p className="text-sm text-gray-500">
                {activeProvider !== "none" ? (
                  <>
                    Model: <strong>{currentModel}</strong> | Status:{" "}
                    <span className="text-green-600 font-medium">
                      {statusData?.status}
                    </span>
                  </>
                ) : (
                  "The chatbot is running in rule-based mode. Activate a provider below to enable AI-powered responses."
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Providers
        </h2>

        {PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            configMap={configMap}
            activeProvider={activeProvider}
            currentModel={currentModel}
            onSave={handleSave}
            onActivate={handleActivate}
            onTest={handleTest}
            isSaving={updateMutation.isPending}
          />
        ))}
      </div>

      {/* General settings */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Settings className="w-5 h-5" />
          General Settings
        </h2>

        {/* Max tokens */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Tokens: <strong>{maxTokens}</strong>
          </label>
          <input
            type="range"
            min={1024}
            max={8192}
            step={256}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>1024</span>
            <span>4096</span>
            <span>8192</span>
          </div>
          <button
            onClick={handleMaxTokensSave}
            disabled={updateMutation.isPending}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Save Max Tokens
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">How it works</p>
            <ul className="mt-1 list-disc list-inside space-y-1 text-amber-700">
              <li>
                API keys are encrypted at rest using AES-256-GCM and never
                returned unmasked
              </li>
              <li>
                Settings stored here override environment variables (.env)
              </li>
              <li>
                Only one provider can be active at a time. Switching providers
                takes effect immediately.
              </li>
              <li>
                Use "Test Connection" to verify your API key and model before
                activating
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
