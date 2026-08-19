import { z } from "zod";

const positiveId = z.coerce.number().int().positive();
const optionalId = z.preprocess((value) => (value === "" || value == null ? undefined : value), positiveId.optional());
const idArray = z.array(positiveId).transform((values) => [...new Set(values)]);
const requiredIdArray = z.array(positiveId).min(1, "organization_ids must contain at least one organization id").transform((values) => [...new Set(values)]);

export const multiOrgFieldEmployeeListSchema = z
  .object({
    organization_ids: requiredIdArray,
    department_id: z
      .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === "") return [];
        const values = Array.isArray(value) ? value : String(value).split(",");
        const parsed = values.map((item) => positiveId.safeParse(typeof item === "string" ? item.trim() : item));
        const invalid = parsed.find((result) => !result.success);
        if (invalid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "department_id must contain positive integers" });
          return z.NEVER;
        }
        return [...new Set(parsed.map((result) => (result as z.SafeParseSuccess<number>).data))];
      }),
    location_id: optionalId,
    role_id: optionalId,
    name: z.string().trim().optional().default(""),
    project_name: z.string().trim().optional().default(""),
    employee_ids: idArray.optional().default([]),
    status: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().int().refine((value) => value === 0 || value === 1, "status must be 0 or 1").optional(),
    ),
    non_admin_id: optionalId,
    skip: z.coerce.number().int().nonnegative().optional().default(0),
    limit: z.coerce.number().int().positive().optional().default(100),
  })
  .passthrough()
  .transform((value) => ({
    organization_ids: value.organization_ids,
    department_ids: value.department_id,
    location_id: value.location_id ?? null,
    role_id: value.role_id ?? null,
    name: value.name,
    project_name: value.project_name,
    employee_ids: value.employee_ids,
    status: value.status ?? null,
    non_admin_id: value.non_admin_id ?? null,
    skip: value.skip,
    limit: value.limit,
  }));

export type MultiOrgFieldEmployeeListInput = z.input<typeof multiOrgFieldEmployeeListSchema>;
export type ParsedMultiOrgFieldEmployeeListInput = {
  organization_ids: number[];
  department_ids: number[];
  location_id: number | null;
  role_id: number | null;
  name: string;
  project_name: string;
  employee_ids: number[];
  status: number | null;
  non_admin_id: number | null;
  skip: number;
  limit: number;
};
