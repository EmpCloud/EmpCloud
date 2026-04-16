import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  GripVertical,
  Eye,
} from "lucide-react";
import api from "@/api/client";

const ENTITY_TYPES = [
  { key: "employee", label: "Employee" },
  { key: "department", label: "Department" },
  { key: "location", label: "Location" },
  { key: "project", label: "Project" },
  { key: "document", label: "Document" },
] as const;

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "number", label: "Number" },
  { value: "decimal", label: "Decimal" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multi_select", label: "Multi Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "file", label: "File" },
] as const;

type FieldDefinition = {
  id: number;
  entity_type: string;
  field_name: string;
  field_key: string;
  field_type: string;
  options: string[] | null;
  default_value: string | null;
  placeholder: string | null;
  is_required: boolean;
  is_active: boolean;
  is_searchable: boolean;
  validation_regex: string | null;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
  section: string;
  help_text: string | null;
};

const INITIAL_FORM = {
  field_name: "",
  field_type: "text" as string,
  options: [] as string[],
  default_value: "",
  placeholder: "",
  is_required: false,
  is_searchable: false,
  validation_regex: "",
  min_value: "" as string | number,
  max_value: "" as string | number,
  section: "Custom Fields",
  help_text: "",
};

export default function CustomFieldsSettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("employee");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [optionInput, setOptionInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  // #1491 — After the create/edit form is rendered, scroll it into view so the
  // user doesn't have to manually scroll up. Previously the form rendered above
  // the list but the page stayed scrolled near the row the user clicked, making
  // it look like nothing happened.
  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [showForm, editingId]);

  // Fetch definitions
  const { data: fields = [], isLoading } = useQuery<FieldDefinition[]>({
    queryKey: ["custom-field-definitions", activeTab],
    queryFn: () =>
      api
        .get("/custom-fields/definitions", {
          params: { entity_type: activeTab },
        })
        .then((r) => r.data.data),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/custom-fields/definitions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions"],
      });
      resetForm();
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      api.put(`/custom-fields/definitions/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions"],
      });
      resetForm();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/custom-fields/definitions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions"],
      });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: (data: { entity_type: string; field_ids: number[] }) =>
      api.put("/custom-fields/definitions/reorder", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["custom-field-definitions"],
      });
    },
  });

  function resetForm() {
    setForm({ ...INITIAL_FORM });
    setEditingId(null);
    setShowForm(false);
    setOptionInput("");
    setShowPreview(false);
  }

  function startEdit(field: FieldDefinition) {
    setForm({
      field_name: field.field_name,
      field_type: field.field_type,
      options: field.options || [],
      default_value: field.default_value || "",
      placeholder: field.placeholder || "",
      is_required: field.is_required,
      is_searchable: field.is_searchable,
      validation_regex: field.validation_regex || "",
      min_value: field.min_value ?? "",
      max_value: field.max_value ?? "",
      section: field.section || "Custom Fields",
      help_text: field.help_text || "",
    });
    setEditingId(field.id);
    setShowForm(true);
    // #1491 — scrollIntoView on the form ref runs via useEffect above once the
    // form mounts; this ensures the edit form is actually visible on screen.
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      field_name: form.field_name,
      field_type: form.field_type,
      is_required: form.is_required,
      is_searchable: form.is_searchable,
      section: form.section || "Custom Fields",
    };

    if (form.options.length > 0) payload.options = form.options;
    if (form.default_value) payload.default_value = form.default_value;
    if (form.placeholder) payload.placeholder = form.placeholder;
    if (form.validation_regex) payload.validation_regex = form.validation_regex;
    if (form.min_value !== "" && form.min_value !== null)
      payload.min_value = Number(form.min_value);
    if (form.max_value !== "" && form.max_value !== null)
      payload.max_value = Number(form.max_value);
    if (form.help_text) payload.help_text = form.help_text;

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      payload.entity_type = activeTab;
      createMutation.mutate(payload);
    }
  }

  function addOption() {
    const trimmed = optionInput.trim();
    if (trimmed && !form.options.includes(trimmed)) {
      setForm({ ...form, options: [...form.options, trimmed] });
      setOptionInput("");
    }
  }

  function removeOption(idx: number) {
    setForm({
      ...form,
      options: form.options.filter((_, i) => i !== idx),
    });
  }

  function moveField(fieldId: number, direction: "up" | "down") {
    const idx = fields.findIndex((f) => f.id === fieldId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === fields.length - 1) return;

    const newFields = [...fields];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newFields[idx], newFields[swapIdx]] = [newFields[swapIdx], newFields[idx]];

    reorderMutation.mutate({
      entity_type: activeTab,
      field_ids: newFields.map((f) => f.id),
    });
  }

  const needsOptions = form.field_type === "dropdown" || form.field_type === "multi_select";
  const isNumeric = form.field_type === "number" || form.field_type === "decimal";

  // Group fields by section
  const sections: Record<string, FieldDefinition[]> = {};
  for (const f of fields) {
    const sec = f.section || "Custom Fields";
    if (!sections[sec]) sections[sec] = [];
    sections[sec].push(f);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define custom data fields for employees, departments, and other entities
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Field
          </button>
        )}
      </div>

      {/* Entity Type Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {ENTITY_TYPES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                resetForm();
              }}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div
          ref={formRef}
          className="bg-white rounded-xl border border-gray-200 p-6 mb-6 scroll-mt-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? "Edit Field" : "New Field"}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <Eye className="h-4 w-4" />
                {showPreview ? "Hide Preview" : "Preview"}
              </button>
              <button
                onClick={resetForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Field Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Name *
                </label>
                <input
                  type="text"
                  value={form.field_name}
                  onChange={(e) =>
                    setForm({ ...form, field_name: e.target.value })
                  }
                  placeholder="e.g. T-Shirt Size"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>

              {/* Field Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Field Type *
                </label>
                <select
                  value={form.field_type}
                  onChange={(e) =>
                    setForm({ ...form, field_type: e.target.value, options: [] })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {FIELD_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Section
                </label>
                <input
                  type="text"
                  value={form.section}
                  onChange={(e) =>
                    setForm({ ...form, section: e.target.value })
                  }
                  placeholder="Custom Fields"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Placeholder */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Placeholder
                </label>
                <input
                  type="text"
                  value={form.placeholder}
                  onChange={(e) =>
                    setForm({ ...form, placeholder: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Default Value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Value
                </label>
                <input
                  type="text"
                  value={form.default_value}
                  onChange={(e) =>
                    setForm({ ...form, default_value: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Validation Regex */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Validation Regex
                </label>
                <input
                  type="text"
                  value={form.validation_regex}
                  onChange={(e) =>
                    setForm({ ...form, validation_regex: e.target.value })
                  }
                  placeholder="^[A-Z]{2}\d{4}$"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Min/Max for numeric fields */}
              {isNumeric && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min Value
                    </label>
                    <input
                      type="number"
                      value={form.min_value}
                      onChange={(e) =>
                        setForm({ ...form, min_value: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Value
                    </label>
                    <input
                      type="number"
                      value={form.max_value}
                      onChange={(e) =>
                        setForm({ ...form, max_value: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Help Text */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Help Text
              </label>
              <textarea
                value={form.help_text}
                onChange={(e) =>
                  setForm({ ...form, help_text: e.target.value })
                }
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Tooltip or description shown to users"
              />
            </div>

            {/* Options for dropdown/multi-select */}
            {needsOptions && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Options
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                    placeholder="Type option and press Enter"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={addOption}
                    className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
                {form.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.options.map((opt, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full text-sm"
                      >
                        {opt}
                        <button
                          type="button"
                          onClick={() => removeOption(idx)}
                          className="text-brand-400 hover:text-brand-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Checkboxes */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_required}
                  onChange={(e) =>
                    setForm({ ...form, is_required: e.target.checked })
                  }
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.is_searchable}
                  onChange={(e) =>
                    setForm({ ...form, is_searchable: e.target.checked })
                  }
                  className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Searchable
              </label>
            </div>

            {/* Preview */}
            {showPreview && (
              <div className="border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50">
                <p className="text-xs font-medium text-gray-400 mb-2 uppercase">
                  Field Preview
                </p>
                <FieldPreview form={form} />
              </div>
            )}

            {/* Error Display */}
            {(createMutation.isError || updateMutation.isError) && (() => {
              // #1372 — Surface backend validation errors clearly. Some Zod errors
              // arrive as { error: { message, details: [...] } }; render details too
              // so users can tell *why* a Required + Searchable combo was rejected.
              const err: any = createMutation.error || updateMutation.error;
              const resp = err?.response?.data?.error;
              const details: any[] = Array.isArray(resp?.details) ? resp.details : [];
              const message =
                resp?.message
                || err?.response?.data?.message
                || err?.message
                || "Failed to save field. Please try again.";
              return (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  <div className="font-medium">{message}</div>
                  {details.length > 0 && (
                    <ul className="list-disc list-inside mt-1 text-xs">
                      {details.map((d, i) => (
                        <li key={i}>
                          {(d?.path && d.path.length > 0 ? `${d.path.join(".")}: ` : "") +
                            (d?.message || JSON.stringify(d))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : editingId ? "Update Field" : "Create Field"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Field Definitions List */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Loading fields...</div>
      ) : fields.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-gray-400">
            No custom fields defined for{" "}
            {ENTITY_TYPES.find((t) => t.key === activeTab)?.label || activeTab}.
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Click "Add Field" to create your first custom field.
          </p>
        </div>
      ) : (
        Object.entries(sections).map(([sectionName, sectionFields]) => (
          <div key={sectionName} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {sectionName}
            </h3>
            {/*
              #1492 — overflow-x-auto on the scroll container and min-w on the
              table keep the action column (edit/delete icons) reachable on
              narrow widths instead of clipping them off-screen.
            */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-10" />
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Field Name
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Key
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Type
                    </th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Required
                    </th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Searchable
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sectionFields.map((field) => (
                    <tr key={field.id} className="hover:bg-gray-50">
                      <td className="px-2">
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            onClick={() => moveField(field.id, "up")}
                            className="text-gray-300 hover:text-gray-500 p-0.5"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <GripVertical className="h-3.5 w-3.5 text-gray-300" />
                          <button
                            onClick={() => moveField(field.id, "down")}
                            className="text-gray-300 hover:text-gray-500 p-0.5"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {field.field_name}
                        </div>
                        {field.help_text && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {field.help_text}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 font-mono">
                        {field.field_key}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                          {field.field_type}
                        </span>
                        {field.options && field.options.length > 0 && (
                          <span className="text-xs text-gray-400 ml-1">
                            ({field.options.length} options)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {field.is_required ? (
                          <span className="text-green-600 text-xs font-medium">
                            Yes
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {field.is_searchable ? (
                          <span className="text-green-600 text-xs font-medium">
                            Yes
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">No</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1 flex-shrink-0">
                          <button
                            onClick={() => startEdit(field)}
                            aria-label="Edit field"
                            className="p-1.5 text-gray-400 hover:text-brand-600 rounded hover:bg-gray-100 flex-shrink-0"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `Deactivate field "${field.field_name}"? Existing values will be preserved.`
                                )
                              ) {
                                deleteMutation.mutate(field.id);
                              }
                            }}
                            aria-label="Delete field"
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 flex-shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field Preview Component
// ---------------------------------------------------------------------------

function FieldPreview({ form }: { form: typeof INITIAL_FORM }) {
  const commonClass =
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white";

  return (
    <div className="max-w-md">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {form.field_name || "Field Name"}
        {form.is_required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {form.field_type === "text" ||
      form.field_type === "email" ||
      form.field_type === "phone" ||
      form.field_type === "url" ? (
        <input
          type={
            form.field_type === "email"
              ? "email"
              : form.field_type === "phone"
              ? "tel"
              : form.field_type === "url"
              ? "url"
              : "text"
          }
          placeholder={form.placeholder || `Enter ${form.field_name || "value"}`}
          className={commonClass}
          disabled
        />
      ) : form.field_type === "textarea" ? (
        <textarea
          placeholder={form.placeholder || `Enter ${form.field_name || "value"}`}
          rows={3}
          className={commonClass}
          disabled
        />
      ) : form.field_type === "number" || form.field_type === "decimal" ? (
        <input
          type="number"
          placeholder={form.placeholder || "0"}
          className={commonClass}
          disabled
        />
      ) : form.field_type === "date" ? (
        <input type="date" className={commonClass} disabled />
      ) : form.field_type === "datetime" ? (
        <input type="datetime-local" className={commonClass} disabled />
      ) : form.field_type === "dropdown" ? (
        <select className={commonClass} disabled>
          <option>Select {form.field_name || "option"}...</option>
          {form.options.map((opt, i) => (
            <option key={i}>{opt}</option>
          ))}
        </select>
      ) : form.field_type === "multi_select" ? (
        <div className="flex flex-wrap gap-2 p-2 border border-gray-300 rounded-lg bg-white min-h-[38px]">
          {form.options.length > 0 ? (
            form.options.map((opt, i) => (
              <span
                key={i}
                className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs"
              >
                {opt}
              </span>
            ))
          ) : (
            <span className="text-sm text-gray-400">No options defined</span>
          )}
        </div>
      ) : form.field_type === "checkbox" ? (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="rounded border-gray-300"
            disabled
          />
          {form.field_name || "Checkbox"}
        </label>
      ) : form.field_type === "file" ? (
        <input type="file" className={commonClass} disabled />
      ) : (
        <input type="text" className={commonClass} disabled />
      )}

      {form.help_text && (
        <p className="text-xs text-gray-400 mt-1">{form.help_text}</p>
      )}
    </div>
  );
}
