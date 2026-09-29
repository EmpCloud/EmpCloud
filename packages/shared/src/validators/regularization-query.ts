import { z } from "zod";

const dateFilterSchema = z.string().date().refine(
  (value) => value >= "1000-01-01",
  "Date must be within the supported calendar range",
);

export const regularizationSortQuerySchema = z.object({
  sort_order: z.enum(["asc", "desc"]).default("desc"),
});

export const regularizationListFiltersSchema = regularizationSortQuerySchema.extend({
  department_id: z.string().regex(/^\d+$/).pipe(
    z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ).optional(),
  date_from: dateFilterSchema.optional(),
  date_to: dateFilterSchema.optional(),
}).refine(
  ({ date_from, date_to }) => !date_from || !date_to || date_from <= date_to,
  { message: "Start date must not be after end date", path: ["date_to"] },
);
