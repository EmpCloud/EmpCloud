// =============================================================================
// EMP CLOUD — NAS request validation (Zod)
// Mirrors emp-monitor's nas.validation.js Joi schemas 1:1 so clients hitting
// either backend see the same required-field errors.
// =============================================================================

import { z } from "zod";

export const fetchImageQuerySchema = z.object({
  url: z.string().min(1, "url is required"),
});

export const uploadBodySchema = z.object({
  email: z.string().min(1).max(50),
  secretKey: z.string().min(1),
});

export const deleteBodySchema = z.object({
  email: z.string().min(1).max(50),
  image: z.string().min(1),
  secretKey: z.string().min(1),
});

export const updateBodySchema = z.object({
  oldImageUrl: z.string().min(1),
  email: z.string().min(1).max(50),
  secretKey: z.string().min(1),
});

export const listBodySchema = z.object({
  email: z.string().min(1).max(50),
  secretKey: z.string().min(1),
});
