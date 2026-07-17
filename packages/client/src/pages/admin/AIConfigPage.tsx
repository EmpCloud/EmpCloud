// =============================================================================
// EMP CLOUD — AI Configuration Page (Super Admin)
// Configure AI providers (Claude, OpenAI, Gemini, DeepSeek, Groq, Ollama)
// =============================================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
    color: "text-amber-700 dark:text-amber-300",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
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
    color: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-50 dark:bg-green-950/40",
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
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
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
    color: "text-indigo-700 dark:text-indigo-300",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/40",
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
    color: "text-orange-700 dark:text-orange-300",
    bgColor: "bg-orange-50 dark:bg-orange-950/40",
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
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    borderColor: "border-border",
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
    color: "text-purple-700 dark:text-purple-300",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
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
  const { t } = useTranslation();
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-950/40 text-green-800 dark:text-green-200">
        <CheckCircle2 className="w-3 h-3" />
        {t("aiConfig.status.active")}
      </span>
    );
  }
  if (status === "configured") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-200">
        <Circle className="w-3 h-3" />
        {t("aiConfig.status.configured")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <XCircle className="w-3 h-3" />
      {t("aiConfig.status.notConfigured")}
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
  const { t } = useTranslation();
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
          : "border-border hover:border-border"
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
              <h3 className="font-semibold text-foreground">{provider.name}</h3>
              <StatusBadge status={cardStatus} />
            </div>
            <p className="text-sm text-muted-foreground">{provider.description}</p>
          </div>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          {/* API Key */}
          {provider.needsApiKey && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {t("aiConfig.field.apiKey")}
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    configMap[provider.keyField]
                      ? t("aiConfig.placeholder.apiKeyCurrent", {
                          value: configMap[provider.keyField],
                        })
                      : t("aiConfig.placeholder.apiKeyEnter")
                  }
                  className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
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
              <label className="block text-sm font-medium text-muted-foreground mb-1">
                {t("aiConfig.field.baseUrl")}
              </label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={
                  provider.defaultBaseUrl || t("aiConfig.placeholder.baseUrl")
                }
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          )}

          {/* Model selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t("aiConfig.field.model")}
            </label>
            {provider.models.length > 0 ? (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-card"
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
                placeholder={t("aiConfig.placeholder.customModel")}
                className="bg-card text-foreground w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            )}
          </div>

          {/* Test result */}
          {testResult && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                testResult.success
                  ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200"
                  : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200"
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
                  {t("aiConfig.testResult.latency", {
                    ms: testResult.latency_ms,
                  })}
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
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground bg-card border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {t("aiConfig.button.testConnection")}
            </button>

            <button
              onClick={handleSaveAndActivate}
              disabled={
                isSaving ||
                (provider.needsApiKey && !apiKey && !configMap[provider.keyField])
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                isActive
                  ? "text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950/40 border border-green-300"
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
              {isActive
                ? t("aiConfig.button.active")
                : t("aiConfig.button.saveActivate")}
            </button>

            {isActive && (
              <button
                onClick={() => onActivate("none", "", "")}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40"
              >
                <X className="w-4 h-4" />
                {t("aiConfig.button.deactivate")}
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
  const { t } = useTranslation();
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
        message:
          err?.response?.data?.error?.message ||
          t("aiConfig.testResult.requestFailed"),
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
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
          {t("aiConfig.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("aiConfig.subtitle")}
        </p>
      </div>

      {/* Active provider banner */}
      <div
        className={`rounded-xl p-4 ${
          activeProvider !== "none"
            ? "bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200"
            : "bg-muted border border-border"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                activeProvider !== "none"
                  ? "bg-indigo-100 dark:bg-indigo-950/40"
                  : "bg-muted"
              }`}
            >
              {activeProvider !== "none" ? (
                <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <AlertCircle className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-foreground">
                {activeProvider !== "none" ? (
                  <>
                    {t("aiConfig.banner.aiPoweredMode")}{" "}
                    <span className="text-indigo-600 dark:text-indigo-400 capitalize">
                      ({PROVIDERS.find((p) => p.id === activeProvider)?.name ||
                        activeProvider})
                    </span>
                  </>
                ) : (
                  t("aiConfig.banner.basicMode")
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {activeProvider !== "none" ? (
                  <>
                    {t("aiConfig.banner.modelStatus", {
                      model: currentModel,
                      status: statusData?.status,
                    })}
                  </>
                ) : (
                  t("aiConfig.banner.basicModeHint")
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Provider cards */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          {t("aiConfig.section.providers")}
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
      <div className="border border-border rounded-xl p-4 space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          {t("aiConfig.section.generalSettings")}
        </h2>

        {/* Max tokens */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            {t("aiConfig.field.maxTokens", { count: maxTokens })}
          </label>
          <input
            type="range"
            min={1024}
            max={8192}
            step={256}
            value={maxTokens}
            onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1024</span>
            <span>4096</span>
            <span>8192</span>
          </div>
          <button
            onClick={handleMaxTokensSave}
            disabled={updateMutation.isPending}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-950/40 disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {t("aiConfig.button.saveMaxTokens")}
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{t("aiConfig.info.title")}</p>
            <ul className="mt-1 list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
              <li>{t("aiConfig.info.encryption")}</li>
              <li>{t("aiConfig.info.overrideEnv")}</li>
              <li>{t("aiConfig.info.singleActive")}</li>
              <li>{t("aiConfig.info.testFirst")}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
