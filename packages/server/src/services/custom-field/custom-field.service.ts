// =============================================================================
// EMP CLOUD — Custom Field Service
// CRUD for custom field definitions + value storage per entity
// =============================================================================

import { getDB } from "../../db/connection.js";
import { NotFoundError, ValidationError } from "../../utils/errors.js";
import type {
  CreateCustomFieldDefinitionInput,
  UpdateCustomFieldDefinitionInput,
  SetCustomFieldValueInput,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a display name to a snake_case key: "T-Shirt Size" -> "t_shirt_size" */
function toFieldKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const TEXT_TYPES = new Set([
  "text",
  "textarea",
  "dropdown",
  "email",
  "phone",
  "url",
  "file",
]);
const NUMBER_TYPES = new Set(["number", "decimal"]);
const DATE_TYPES = new Set(["date", "datetime"]);
const BOOLEAN_TYPES = new Set(["checkbox"]);
const JSON_TYPES = new Set(["multi_select"]);

function valueColumns(fieldType: string, rawValue: unknown) {
  const cols: Record<string, unknown> = {
    value_text: null,
    value_number: null,
    value_date: null,
    value_boolean: null,
    value_json: null,
  };

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return cols;
  }

  if (TEXT_TYPES.has(fieldType)) {
    cols.value_text = String(rawValue);
  } else if (NUMBER_TYPES.has(fieldType)) {
    const n = Number(rawValue);
    if (isNaN(n)) throw new ValidationError(`Invalid number value: ${rawValue}`);
    cols.value_number = n;
  } else if (DATE_TYPES.has(fieldType)) {
    const d = new Date(rawValue as string);
    if (isNaN(d.getTime())) throw new ValidationError(`Invalid date value: ${rawValue}`);
    cols.value_date = d;
  } else if (BOOLEAN_TYPES.has(fieldType)) {
    cols.value_boolean = Boolean(rawValue);
  } else if (JSON_TYPES.has(fieldType)) {
    cols.value_json = typeof rawValue === "string" ? rawValue : JSON.stringify(rawValue);
  }

  return cols;
}

function extractValue(row: any): unknown {
  if (row.value_text !== null && row.value_text !== undefined) return row.value_text;
  if (row.value_number !== null && row.value_number !== undefined) return Number(row.value_number);
  if (row.value_date !== null && row.value_date !== undefined) return row.value_date;
  if (row.value_boolean !== null && row.value_boolean !== undefined) return Boolean(row.value_boolean);
  if (row.value_json !== null && row.value_json !== undefined) {
    try {
      return typeof row.value_json === "string" ? JSON.parse(row.value_json) : row.value_json;
    } catch {
      return row.value_json;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Field Definitions — CRUD
// ---------------------------------------------------------------------------

export async function createFieldDefinition(
  orgId: number,
  userId: number,
  data: CreateCustomFieldDefinitionInput
) {
  const db = getDB();
  const fieldKey = toFieldKey(data.field_name);

  // Check uniqueness
  const existing = await db("custom_field_definitions")
    .where({
      organization_id: orgId,
      entity_type: data.entity_type,
      field_key: fieldKey,
    })
    .first();

  if (existing) {
    throw new ValidationError(
      `A custom field with key "${fieldKey}" already exists for ${data.entity_type}`
    );
  }

  // Get max sort_order for this entity type
  const maxSort = await db("custom_field_definitions")
    .where({ organization_id: orgId, entity_type: data.entity_type })
    .max("sort_order as max")
    .first();

  const [id] = await db("custom_field_definitions").insert({
    organization_id: orgId,
    entity_type: data.entity_type,
    field_name: data.field_name,
    field_key: fieldKey,
    field_type: data.field_type,
    options: data.options ? JSON.stringify(data.options) : null,
    default_value: data.default_value || null,
    placeholder: data.placeholder || null,
    is_required: data.is_required ?? false,
    is_active: true,
    is_searchable: data.is_searchable ?? false,
    validation_regex: data.validation_regex || null,
    min_value: data.min_value ?? null,
    max_value: data.max_value ?? null,
    sort_order: (maxSort?.max ?? 0) + 1,
    section: data.section || "Custom Fields",
    help_text: data.help_text || null,
    created_by: userId,
    created_at: new Date(),
    updated_at: new Date(),
  });

  return getFieldDefinition(orgId, id);
}

export async function listFieldDefinitions(orgId: number, entityType?: string) {
  const db = getDB();
  const query = db("custom_field_definitions")
    .where({ organization_id: orgId, is_active: true });

  if (entityType) {
    query.where("entity_type", entityType);
  }

  return query.orderBy("sort_order", "asc");
}

export async function getFieldDefinition(orgId: number, fieldId: number) {
  const db = getDB();
  const field = await db("custom_field_definitions")
    .where({ id: fieldId, organization_id: orgId })
    .first();

  if (!field) throw new NotFoundError("Custom field definition");

  // Parse JSON options
  if (field.options && typeof field.options === "string") {
    try {
      field.options = JSON.parse(field.options);
    } catch {
      // keep as-is
    }
  }

  return field;
}

export async function updateFieldDefinition(
  orgId: number,
  fieldId: number,
  data: UpdateCustomFieldDefinitionInput
) {
  const db = getDB();
  const existing = await db("custom_field_definitions")
    .where({ id: fieldId, organization_id: orgId })
    .first();

  if (!existing) throw new NotFoundError("Custom field definition");

  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (data.field_name !== undefined) {
    updates.field_name = data.field_name;
    // Re-generate key only if name changed
    const newKey = toFieldKey(data.field_name);
    // Check uniqueness of new key
    const dup = await db("custom_field_definitions")
      .where({
        organization_id: orgId,
        entity_type: existing.entity_type,
        field_key: newKey,
      })
      .whereNot("id", fieldId)
      .first();
    if (dup) {
      throw new ValidationError(
        `A custom field with key "${newKey}" already exists for ${existing.entity_type}`
      );
    }
    updates.field_key = newKey;
  }

  if (data.field_type !== undefined) updates.field_type = data.field_type;
  if (data.options !== undefined)
    updates.options = data.options ? JSON.stringify(data.options) : null;
  if (data.default_value !== undefined) updates.default_value = data.default_value;
  if (data.placeholder !== undefined) updates.placeholder = data.placeholder;
  if (data.is_required !== undefined) updates.is_required = data.is_required;
  if (data.is_searchable !== undefined) updates.is_searchable = data.is_searchable;
  if (data.validation_regex !== undefined) updates.validation_regex = data.validation_regex;
  if (data.min_value !== undefined) updates.min_value = data.min_value;
  if (data.max_value !== undefined) updates.max_value = data.max_value;
  if (data.section !== undefined) updates.section = data.section;
  if (data.help_text !== undefined) updates.help_text = data.help_text;

  await db("custom_field_definitions").where({ id: fieldId }).update(updates);

  return getFieldDefinition(orgId, fieldId);
}

export async function deleteFieldDefinition(orgId: number, fieldId: number) {
  const db = getDB();
  const existing = await db("custom_field_definitions")
    .where({ id: fieldId, organization_id: orgId })
    .first();

  if (!existing) throw new NotFoundError("Custom field definition");

  // Soft delete — keep existing values
  await db("custom_field_definitions")
    .where({ id: fieldId })
    .update({ is_active: false, updated_at: new Date() });
}

export async function reorderFields(
  orgId: number,
  entityType: string,
  fieldIds: number[]
) {
  const db = getDB();

  // Verify all IDs belong to this org + entity type
  const fields = await db("custom_field_definitions")
    .where({ organization_id: orgId, entity_type: entityType, is_active: true })
    .select("id");

  const validIds = new Set(fields.map((f: any) => f.id));
  for (const id of fieldIds) {
    if (!validIds.has(id)) {
      throw new ValidationError(`Field ID ${id} not found for this entity type`);
    }
  }

  // Update sort_order
  for (let i = 0; i < fieldIds.length; i++) {
    await db("custom_field_definitions")
      .where({ id: fieldIds[i], organization_id: orgId })
      .update({ sort_order: i + 1, updated_at: new Date() });
  }
}

// ---------------------------------------------------------------------------
// Field Values — Read / Write
// ---------------------------------------------------------------------------

export async function setFieldValues(
  orgId: number,
  entityType: string,
  entityId: number,
  values: SetCustomFieldValueInput[]
) {
  const db = getDB();

  for (const item of values) {
    // Fetch field definition for validation
    const field = await db("custom_field_definitions")
      .where({ id: item.fieldId, organization_id: orgId, is_active: true })
      .first();

    if (!field) {
      throw new ValidationError(`Custom field ${item.fieldId} not found or inactive`);
    }

    if (field.entity_type !== entityType) {
      throw new ValidationError(
        `Field ${item.fieldId} is for "${field.entity_type}", not "${entityType}"`
      );
    }

    // Required validation
    if (
      field.is_required &&
      (item.value === null || item.value === undefined || item.value === "")
    ) {
      throw new ValidationError(`Field "${field.field_name}" is required`);
    }

    // Dropdown validation
    if (field.field_type === "dropdown" && item.value) {
      let opts: string[] = [];
      try {
        opts = typeof field.options === "string" ? JSON.parse(field.options) : field.options || [];
      } catch {
        opts = [];
      }
      if (opts.length > 0 && !opts.includes(String(item.value))) {
        throw new ValidationError(
          `Invalid option "${item.value}" for field "${field.field_name}". Valid options: ${opts.join(", ")}`
        );
      }
    }

    // Multi-select validation
    if (field.field_type === "multi_select" && item.value) {
      let opts: string[] = [];
      try {
        opts = typeof field.options === "string" ? JSON.parse(field.options) : field.options || [];
      } catch {
        opts = [];
      }
      const selected = Array.isArray(item.value) ? item.value : [item.value];
      if (opts.length > 0) {
        for (const v of selected) {
          if (!opts.includes(String(v))) {
            throw new ValidationError(
              `Invalid option "${v}" for field "${field.field_name}". Valid options: ${opts.join(", ")}`
            );
          }
        }
      }
    }

    // Regex validation
    if (field.validation_regex && item.value) {
      const re = new RegExp(field.validation_regex);
      if (!re.test(String(item.value))) {
        throw new ValidationError(
          `Value for "${field.field_name}" does not match required format`
        );
      }
    }

    // Number range validation
    if (NUMBER_TYPES.has(field.field_type) && item.value !== null && item.value !== undefined && item.value !== "") {
      const num = Number(item.value);
      if (field.min_value !== null && num < Number(field.min_value)) {
        throw new ValidationError(
          `Value for "${field.field_name}" must be >= ${field.min_value}`
        );
      }
      if (field.max_value !== null && num > Number(field.max_value)) {
        throw new ValidationError(
          `Value for "${field.field_name}" must be <= ${field.max_value}`
        );
      }
    }

    const cols = valueColumns(field.field_type, item.value);

    // Upsert
    const existingValue = await db("custom_field_values")
      .where({ field_id: item.fieldId, entity_id: entityId })
      .first();

    if (existingValue) {
      await db("custom_field_values")
        .where({ id: existingValue.id })
        .update({ ...cols, updated_at: new Date() });
    } else {
      await db("custom_field_values").insert({
        field_id: item.fieldId,
        organization_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        ...cols,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  }

  return getFieldValues(orgId, entityType, entityId);
}

export async function getFieldValues(
  orgId: number,
  entityType: string,
  entityId: number
) {
  const db = getDB();

  const rows = await db("custom_field_values as v")
    .join("custom_field_definitions as d", "v.field_id", "d.id")
    .where({
      "v.organization_id": orgId,
      "v.entity_type": entityType,
      "v.entity_id": entityId,
      "d.is_active": true,
    })
    .select(
      "d.id as field_id",
      "d.field_name",
      "d.field_key",
      "d.field_type",
      "d.section",
      "d.is_required",
      "d.help_text",
      "d.options",
      "v.value_text",
      "v.value_number",
      "v.value_date",
      "v.value_boolean",
      "v.value_json"
    )
    .orderBy("d.sort_order", "asc");

  return rows.map((row: any) => ({
    field_id: row.field_id,
    field_name: row.field_name,
    field_key: row.field_key,
    field_type: row.field_type,
    section: row.section,
    is_required: row.is_required,
    help_text: row.help_text,
    options: row.options ? (typeof row.options === "string" ? JSON.parse(row.options) : row.options) : null,
    value: extractValue(row),
  }));
}

export async function getFieldValuesForEntities(
  orgId: number,
  entityType: string,
  entityIds: number[]
) {
  if (!entityIds.length) return {};

  const db = getDB();

  const rows = await db("custom_field_values as v")
    .join("custom_field_definitions as d", "v.field_id", "d.id")
    .where({
      "v.organization_id": orgId,
      "v.entity_type": entityType,
      "d.is_active": true,
    })
    .whereIn("v.entity_id", entityIds)
    .select(
      "v.entity_id",
      "d.id as field_id",
      "d.field_name",
      "d.field_key",
      "d.field_type",
      "v.value_text",
      "v.value_number",
      "v.value_date",
      "v.value_boolean",
      "v.value_json"
    )
    .orderBy("d.sort_order", "asc");

  const result: Record<number, Array<{ field_id: number; field_key: string; field_name: string; value: unknown }>> = {};
  for (const id of entityIds) {
    result[id] = [];
  }

  for (const row of rows) {
    if (!result[row.entity_id]) result[row.entity_id] = [];
    result[row.entity_id].push({
      field_id: row.field_id,
      field_key: row.field_key,
      field_name: row.field_name,
      value: extractValue(row),
    });
  }

  return result;
}

export async function searchByFieldValue(
  orgId: number,
  entityType: string,
  fieldId: number,
  searchValue: string
) {
  const db = getDB();

  // Get the field definition to determine the type
  const field = await db("custom_field_definitions")
    .where({ id: fieldId, organization_id: orgId, is_active: true })
    .first();

  if (!field) throw new NotFoundError("Custom field definition");

  if (!field.is_searchable) {
    throw new ValidationError(`Field "${field.field_name}" is not searchable`);
  }

  let query = db("custom_field_values")
    .where({
      organization_id: orgId,
      entity_type: entityType,
      field_id: fieldId,
    });

  if (TEXT_TYPES.has(field.field_type)) {
    query = query.where("value_text", "like", `%${searchValue}%`);
  } else if (NUMBER_TYPES.has(field.field_type)) {
    query = query.where("value_number", Number(searchValue));
  } else if (BOOLEAN_TYPES.has(field.field_type)) {
    query = query.where("value_boolean", searchValue === "true" || searchValue === "1");
  } else if (DATE_TYPES.has(field.field_type)) {
    query = query.whereRaw("DATE(value_date) = ?", [searchValue]);
  } else if (JSON_TYPES.has(field.field_type)) {
    query = query.where("value_json", "like", `%${searchValue}%`);
  }

  const rows = await query.select("entity_id");
  return rows.map((r: any) => r.entity_id);
}
