import { Router, Response } from "express";
import { locationsDepartmentsByOrgSchema } from "@empcloud/shared";
import { ZodError } from "zod";
import { fieldAuthenticate } from "../../services/field-legacy/field-auth.middleware.js";
import { getLocationsDepartmentsByOrg } from "../../services/location-legacy/location-legacy.service.js";
import { logger } from "../../utils/logger.js";
import { sendLegacyResponse } from "../../utils/legacy-response.js";

const router = Router();

function resp(res: Response, code: number, data: unknown, message: string | null, error: unknown = null) {
  return sendLegacyResponse(res, code, data, message, error);
}

router.post("/get-locations-dept-by-org", (req, res, next) => {
  try {
    req.body = locationsDepartmentsByOrgSchema.parse(req.body || {});
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return resp(res, 400, null, err.errors[0]?.message || "Validation Failed", "VALIDATION_ERROR");
    }
    return next(err);
  }
}, fieldAuthenticate, async (req, res) => {
  try {
    const result = await getLocationsDepartmentsByOrg(req.body.organization_id);

    return res.json({
      code: 200,
      data: result.locations,
      orgtimezone: result.orgtimezone,
      message: "Locations fetched successfully",
      error: null,
    });
  } catch (err) {
    logger.error("Location legacy handler error", { error: (err as Error)?.message });
    return resp(res, 400, null, "Unable to fetch locations", "LOCATION_FETCH_FAILED");
  }
});

export default router;
