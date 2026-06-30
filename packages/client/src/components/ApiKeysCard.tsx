// =============================================================================
// EMP CLOUD — API Keys settings card
//
// Org admins generate programmatic API keys here. A key authenticates against
// EmpCloud APIs and any module that reads the EmpCloud master DB (e.g. the
// emp-payroll attendance / records APIs) — one token, both systems. The key
// mirrors the creating admin's permissions and can be revoked at any time.
// =============================================================================

import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  AlertTriangle,
  Info,
  ShieldCheck,
  Clock,
  Boxes,
} from "lucide-react";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  type ApiKey,
} from "@/api/hooks";
import { showToast } from "@/components/ui/Toast";

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;
function keyStatus(k: ApiKey, t: TFn): { label: string; cls: string } {
  if (k.revoked_at) return { label: t("apiKeys.statusRevoked"), cls: "bg-gray-100 text-gray-500" };
  if (k.expires_at && new Date(k.expires_at).getTime() <= Date.now())
    return { label: t("apiKeys.statusExpired"), cls: "bg-amber-100 text-amber-700" };
  return { label: t("apiKeys.statusActive"), cls: "bg-green-100 text-green-700" };
}

export default function ApiKeysCard() {
  const { t } = useTranslation();
  const { data: keys, isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState(""); // days, "" = never
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const expiresInDays = expiry.trim() ? Number(expiry) : null;
    createKey.mutate(
      { name: name.trim(), expiresInDays },
      {
        onSuccess: (data) => {
          setNewKey(data.key);
          setName("");
          setExpiry("");
          setShowForm(false);
        },
        onError: () => showToast("error", t("apiKeys.createError")),
      },
    );
  };

  const handleCopy = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("error", t("apiKeys.copyError"));
    }
  };

  const handleRevoke = (k: ApiKey) => {
    if (!confirm(t("apiKeys.revokeConfirm", { name: k.name })))
      return;
    revokeKey.mutate(k.id, {
      onSuccess: () => showToast("success", t("apiKeys.revoked")),
      onError: () => showToast("error", t("apiKeys.revokeError")),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mt-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-brand-600" />
          <h2 className="font-semibold text-gray-900">{t("apiKeys.title")}</h2>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> {t("apiKeys.newKey")}
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        {t("apiKeys.description")}
      </p>

      {/* How it works — help the user understand what the key is and how to send it */}
      <div className="mb-5 rounded-lg border border-brand-100 bg-brand-50/60 p-4">
        <div className="flex items-center gap-2 mb-3 text-brand-700">
          <Info className="h-4 w-4 shrink-0" />
          <p className="text-sm font-semibold">{t("apiKeys.howToTitle")}</p>
        </div>

        <p className="text-sm text-gray-600 mb-3">
          <Trans
            i18nKey="apiKeys.howToIntro"
            components={{
              strong: <strong />,
              code: <code className="rounded bg-white border border-gray-200 px-1 py-0.5 text-[12px]" />,
            }}
          />
        </p>

        <pre className="overflow-x-auto rounded-md bg-gray-900 px-3 py-2.5 text-[12px] leading-relaxed text-gray-100">
{`curl https://<your-domain>/api/v1/attendance/records \\
  -H "Authorization: Bearer empc_live_xxxxxxxxxxxx"`}
        </pre>

        <ul className="mt-3 space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <Boxes className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" />
            <span>
              <Trans i18nKey="apiKeys.bulletBothSystems" components={{ strong: <strong /> }} />
            </span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" />
            <span>
              <Trans i18nKey="apiKeys.bulletPermissions" components={{ strong: <strong /> }} />
            </span>
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
            <span>
              <Trans i18nKey="apiKeys.bulletShownOnce" components={{ strong: <strong /> }} />
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 shrink-0 text-brand-600" />
            <span>
              <Trans i18nKey="apiKeys.bulletRevocable" components={{ strong: <strong /> }} />
            </span>
          </li>
        </ul>
      </div>

      {/* One-time raw key reveal */}
      {newKey && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-2 mb-2 text-amber-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm font-medium">
              Copy this key now — it won't be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white border border-amber-200 px-3 py-2 text-sm text-gray-800">
              {newKey}
            </code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={() => setNewKey(null)}
              className="rounded-md p-2 text-amber-700 hover:bg-amber-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Ready-to-use Bearer header so the user knows exactly how to send it */}
          <p className="mt-3 mb-1 text-xs font-medium text-amber-800">
            Use it as a Bearer token in the Authorization header:
          </p>
          <code className="block break-all rounded bg-white border border-amber-200 px-3 py-2 text-[12px] text-gray-700">
            Authorization: Bearer {newKey}
          </code>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Key name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Attendance export"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Expires in (days)</label>
              <input
                value={expiry}
                onChange={(e) => setExpiry(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Never"
                inputMode="numeric"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="submit"
              disabled={!name.trim() || createKey.isPending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {createKey.isPending ? "Generating…" : "Generate key"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setName("");
                setExpiry("");
              }}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Key list */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Loading keys…</p>
      ) : !keys || keys.length === 0 ? (
        <p className="text-sm text-gray-400">No API keys yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Key</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Last used</th>
                <th className="py-2 pr-4 font-medium">Expires</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const st = keyStatus(k, t);
                return (
                  <tr key={k.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-gray-900">{k.name}</td>
                    <td className="py-2.5 pr-4">
                      <code className="text-gray-600">{k.key_prefix}…</code>
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{fmtDate(k.last_used_at)}</td>
                    <td className="py-2.5 pr-4 text-gray-500">
                      {k.expires_at ? fmtDate(k.expires_at) : "Never"}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-500">{fmtDate(k.created_at)}</td>
                    <td className="py-2.5 text-right">
                      {!k.revoked_at && (
                        <button
                          onClick={() => handleRevoke(k)}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
