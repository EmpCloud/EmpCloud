// =============================================================================
// EMP CLOUD — Survey Service
// Pulse surveys, eNPS, engagement surveys, custom surveys
// =============================================================================

import crypto from "crypto";
import { getDB } from "../../db/connection.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors.js";
import type {
  CreateSurveyInput,
  UpdateSurveyInput,
  SubmitSurveyResponseInput,
} from "@empcloud/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashAnonymousId(surveyId: number, userId: number): string {
  return crypto
    .createHash("sha256")
    .update(`survey:${surveyId}:user:${userId}:salt:empcloud-anon`)
    .digest("hex")
    .substring(0, 64);
}

// ---------------------------------------------------------------------------
// Create Survey
// ---------------------------------------------------------------------------

export async function createSurvey(
  orgId: number,
  userId: number,
  data: CreateSurveyInput
) {
  const db = getDB();

  const [id] = await db("surveys").insert({
    organization_id: orgId,
    title: data.title,
    description: data.description || null,
    type: data.type || "pulse",
    status: "draft",
    is_anonymous: data.is_anonymous !== undefined ? data.is_anonymous : true,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    target_type: data.target_type || "all",
    target_ids: data.target_ids ? JSON.stringify(data.target_ids) : null,
    recurrence: data.recurrence || "none",
    created_by: userId,
    response_count: 0,
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Insert questions
  if (data.questions && data.questions.length > 0) {
    const questionRows = data.questions.map((q, idx) => ({
      survey_id: id,
      organization_id: orgId,
      question_text: q.question_text,
      question_type: q.question_type || "rating_1_5",
      options: q.options ? JSON.stringify(q.options) : null,
      is_required: q.is_required !== undefined ? q.is_required : true,
      sort_order: q.sort_order !== undefined ? q.sort_order : idx,
      created_at: new Date(),
    }));
    await db("survey_questions").insert(questionRows);
  }

  return getSurvey(orgId, id);
}

// ---------------------------------------------------------------------------
// List Surveys
// ---------------------------------------------------------------------------

export async function listSurveys(
  orgId: number,
  params?: {
    page?: number;
    perPage?: number;
    status?: string;
    type?: string;
  }
) {
  const db = getDB();
  const page = params?.page || 1;
  const perPage = params?.perPage || 20;

  let query = db("surveys").where({ organization_id: orgId });

  if (params?.status) {
    query = query.where("status", params.status);
  }
  if (params?.type) {
    query = query.where("type", params.type);
  }

  const countQuery = query.clone().count("id as count");
  const [{ count }] = await countQuery;

  const surveys = await query
    .clone()
    .select("*")
    .orderBy("created_at", "desc")
    .limit(perPage)
    .offset((page - 1) * perPage);

  return {
    surveys,
    total: Number(count),
  };
}

// ---------------------------------------------------------------------------
// Get Survey with questions + response stats
// ---------------------------------------------------------------------------

export async function getSurvey(orgId: number, surveyId: number) {
  const db = getDB();

  const survey = await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .first();
  if (!survey) throw new NotFoundError("Survey");

  const questions = await db("survey_questions")
    .where({ survey_id: surveyId, organization_id: orgId })
    .orderBy("sort_order", "asc");

  // Parse JSON fields
  for (const q of questions) {
    if (q.options && typeof q.options === "string") {
      try { q.options = JSON.parse(q.options); } catch { /* keep as string */ }
    }
  }

  if (survey.target_ids && typeof survey.target_ids === "string") {
    try { survey.target_ids = JSON.parse(survey.target_ids); } catch { /* keep as string */ }
  }

  return {
    ...survey,
    questions,
  };
}

// ---------------------------------------------------------------------------
// Update Survey (draft only)
// ---------------------------------------------------------------------------

export async function updateSurvey(
  orgId: number,
  surveyId: number,
  data: UpdateSurveyInput
) {
  const db = getDB();

  const existing = await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Survey");
  if (existing.status !== "draft") {
    throw new ForbiddenError("Only draft surveys can be edited");
  }

  const updateData: Record<string, any> = { updated_at: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.type !== undefined) updateData.type = data.type;
  if (data.is_anonymous !== undefined) updateData.is_anonymous = data.is_anonymous;
  if (data.start_date !== undefined) updateData.start_date = data.start_date;
  if (data.end_date !== undefined) updateData.end_date = data.end_date;
  if (data.target_type !== undefined) updateData.target_type = data.target_type;
  if (data.target_ids !== undefined) updateData.target_ids = data.target_ids ? JSON.stringify(data.target_ids) : null;
  if (data.recurrence !== undefined) updateData.recurrence = data.recurrence;

  await db("surveys").where({ id: surveyId }).update(updateData);

  // Replace questions if provided
  if (data.questions !== undefined) {
    await db("survey_questions").where({ survey_id: surveyId }).delete();
    if (data.questions.length > 0) {
      const questionRows = data.questions.map((q, idx) => ({
        survey_id: surveyId,
        organization_id: orgId,
        question_text: q.question_text,
        question_type: q.question_type || "rating_1_5",
        options: q.options ? JSON.stringify(q.options) : null,
        is_required: q.is_required !== undefined ? q.is_required : true,
        sort_order: q.sort_order !== undefined ? q.sort_order : idx,
        created_at: new Date(),
      }));
      await db("survey_questions").insert(questionRows);
    }
  }

  return getSurvey(orgId, surveyId);
}

// ---------------------------------------------------------------------------
// Publish Survey
// ---------------------------------------------------------------------------

export async function publishSurvey(orgId: number, surveyId: number) {
  const db = getDB();

  const existing = await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Survey");
  if (existing.status !== "draft" && existing.status !== "closed") {
    throw new ForbiddenError("Only draft or closed surveys can be published");
  }

  // Must have at least one question
  const questionCount = await db("survey_questions")
    .where({ survey_id: surveyId, organization_id: orgId })
    .count("id as count");
  if (Number(questionCount[0].count) === 0) {
    throw new ValidationError("Survey must have at least one question before publishing");
  }

  await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .update({
      status: "active",
      start_date: existing.start_date || new Date(),
      updated_at: new Date(),
    });

  return getSurvey(orgId, surveyId);
}

// ---------------------------------------------------------------------------
// Close Survey
// ---------------------------------------------------------------------------

export async function closeSurvey(orgId: number, surveyId: number) {
  const db = getDB();

  const existing = await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Survey");
  if (existing.status !== "active") {
    throw new ForbiddenError("Only active surveys can be closed");
  }

  await db("surveys").where({ id: surveyId }).update({
    status: "closed",
    end_date: new Date(),
    updated_at: new Date(),
  });

  return getSurvey(orgId, surveyId);
}

// ---------------------------------------------------------------------------
// Delete Survey (draft only)
// ---------------------------------------------------------------------------

export async function deleteSurvey(
  orgId: number,
  surveyId: number
): Promise<void> {
  const db = getDB();

  const existing = await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .first();
  if (!existing) throw new NotFoundError("Survey");
  if (existing.status !== "draft") {
    throw new ForbiddenError("Only draft surveys can be deleted");
  }

  // Cascading deletes handle questions
  await db("surveys").where({ id: surveyId }).delete();
}

// ---------------------------------------------------------------------------
// Submit Response
// ---------------------------------------------------------------------------

export async function submitResponse(
  orgId: number,
  surveyId: number,
  userId: number,
  answers: SubmitSurveyResponseInput["answers"]
) {
  const db = getDB();

  const survey = await db("surveys")
    .where({ id: surveyId, organization_id: orgId, status: "active" })
    .first();
  if (!survey) throw new NotFoundError("Active survey");

  // Check date window
  if (survey.end_date && new Date(survey.end_date) < new Date()) {
    throw new ForbiddenError("This survey has expired");
  }

  // Check for duplicate response
  const anonymousId = hashAnonymousId(surveyId, userId);

  if (survey.is_anonymous) {
    const existing = await db("survey_responses")
      .where({ survey_id: surveyId, anonymous_id: anonymousId })
      .first();
    if (existing) {
      throw new ForbiddenError("You have already responded to this survey");
    }
  } else {
    const existing = await db("survey_responses")
      .where({ survey_id: surveyId, user_id: userId })
      .first();
    if (existing) {
      throw new ForbiddenError("You have already responded to this survey");
    }
  }

  // Validate required questions
  const questions = await db("survey_questions")
    .where({ survey_id: surveyId })
    .select("id", "is_required", "question_type");

  const requiredIds = questions.filter((q) => q.is_required).map((q) => q.id);
  const answeredIds = answers.map((a) => a.question_id);
  const missing = requiredIds.filter((id) => !answeredIds.includes(id));
  if (missing.length > 0) {
    throw new ValidationError(`Missing answers for required questions: ${missing.join(", ")}`);
  }

  // Insert response
  const [responseId] = await db("survey_responses").insert({
    survey_id: surveyId,
    organization_id: orgId,
    user_id: survey.is_anonymous ? null : userId,
    anonymous_id: survey.is_anonymous ? anonymousId : null,
    submitted_at: new Date(),
    created_at: new Date(),
  });

  // Insert answers
  if (answers.length > 0) {
    const answerRows = answers.map((a) => ({
      response_id: responseId,
      question_id: a.question_id,
      organization_id: orgId,
      rating_value: a.rating_value ?? null,
      text_value: a.text_value ?? null,
      created_at: new Date(),
    }));
    await db("survey_answers").insert(answerRows);
  }

  // Increment response count
  await db("surveys")
    .where({ id: surveyId })
    .increment("response_count", 1);

  return { response_id: responseId, message: "Response submitted successfully" };
}

// ---------------------------------------------------------------------------
// Get Survey Results (aggregated)
// ---------------------------------------------------------------------------

export async function getSurveyResults(orgId: number, surveyId: number) {
  const db = getDB();

  const survey = await db("surveys")
    .where({ id: surveyId, organization_id: orgId })
    .first();
  if (!survey) throw new NotFoundError("Survey");

  const questions = await db("survey_questions")
    .where({ survey_id: surveyId })
    .orderBy("sort_order", "asc");

  const responseCount = Number(survey.response_count);

  const questionResults = [];

  for (const q of questions) {
    // Parse options
    let options = q.options;
    if (options && typeof options === "string") {
      try { options = JSON.parse(options); } catch { /* ignore */ }
    }

    const answers = await db("survey_answers")
      .where({ question_id: q.id, organization_id: orgId });

    const result: any = {
      question_id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options,
      total_answers: answers.length,
    };

    if (["rating_1_5", "rating_1_10", "enps_0_10", "scale"].includes(q.question_type)) {
      const ratings = answers.filter((a) => a.rating_value !== null).map((a) => a.rating_value);
      result.avg_rating = ratings.length > 0
        ? Math.round((ratings.reduce((s: number, v: number) => s + v, 0) / ratings.length) * 100) / 100
        : null;
      result.min_rating = ratings.length > 0 ? Math.min(...ratings) : null;
      result.max_rating = ratings.length > 0 ? Math.max(...ratings) : null;

      // Distribution
      const dist: Record<number, number> = {};
      for (const r of ratings) {
        dist[r] = (dist[r] || 0) + 1;
      }
      result.distribution = dist;

      // eNPS specific calculation
      if (q.question_type === "enps_0_10") {
        const enps = calculateENPSFromRatings(ratings);
        result.enps = enps;
      }
    } else if (q.question_type === "yes_no") {
      const yesCount = answers.filter((a) => a.text_value === "yes").length;
      const noCount = answers.filter((a) => a.text_value === "no").length;
      result.distribution = { yes: yesCount, no: noCount };
    } else if (q.question_type === "multiple_choice") {
      const choiceDist: Record<string, number> = {};
      for (const a of answers) {
        if (a.text_value) {
          choiceDist[a.text_value] = (choiceDist[a.text_value] || 0) + 1;
        }
      }
      result.distribution = choiceDist;
    } else if (q.question_type === "text") {
      result.text_responses = answers
        .filter((a) => a.text_value)
        .map((a) => a.text_value);
    }

    questionResults.push(result);
  }

  // Overall eNPS if survey type is enps
  let overallENPS = null;
  if (survey.type === "enps") {
    const enpsQuestion = questions.find((q: any) => q.question_type === "enps_0_10");
    if (enpsQuestion) {
      const enpsAnswers = await db("survey_answers")
        .where({ question_id: enpsQuestion.id, organization_id: orgId });
      const ratings = enpsAnswers.filter((a) => a.rating_value !== null).map((a) => a.rating_value);
      overallENPS = calculateENPSFromRatings(ratings);
    }
  }

  return {
    survey_id: surveyId,
    title: survey.title,
    type: survey.type,
    status: survey.status,
    response_count: responseCount,
    overall_enps: overallENPS,
    questions: questionResults,
  };
}

// ---------------------------------------------------------------------------
// Get Active Surveys for Employee
// ---------------------------------------------------------------------------

export async function getActiveSurveys(orgId: number, userId: number) {
  const db = getDB();

  const surveys = await db("surveys")
    .where({ organization_id: orgId, status: "active" })
    .where(function () {
      this.whereNull("end_date").orWhere("end_date", ">", new Date());
    })
    .orderBy("created_at", "desc");

  // Filter by target and check if already responded
  const result = [];
  for (const s of surveys) {
    // Target filtering
    if (s.target_type !== "all" && s.target_ids) {
      // For now include all — more advanced filtering can be added later
      // based on user's department/role
    }

    // Check if already responded
    const anonymousId = hashAnonymousId(s.id, userId);
    let hasResponded = false;

    if (s.is_anonymous) {
      const existing = await db("survey_responses")
        .where({ survey_id: s.id, anonymous_id: anonymousId })
        .first();
      hasResponded = !!existing;
    } else {
      const existing = await db("survey_responses")
        .where({ survey_id: s.id, user_id: userId })
        .first();
      hasResponded = !!existing;
    }

    // Parse target_ids
    if (s.target_ids && typeof s.target_ids === "string") {
      try { s.target_ids = JSON.parse(s.target_ids); } catch { /* ignore */ }
    }

    result.push({
      ...s,
      has_responded: hasResponded,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Get My Responses
// ---------------------------------------------------------------------------

export async function getMyResponses(orgId: number, userId: number) {
  const db = getDB();

  // Non-anonymous responses
  const directResponses = await db("survey_responses as sr")
    .join("surveys as s", "sr.survey_id", "s.id")
    .where({ "sr.organization_id": orgId, "sr.user_id": userId })
    .select(
      "sr.id as response_id",
      "sr.survey_id",
      "sr.submitted_at",
      "s.title",
      "s.type",
      "s.is_anonymous"
    );

  // Anonymous responses — use hash matching
  const activeSurveys = await db("surveys")
    .where({ organization_id: orgId, is_anonymous: true });

  const anonymousResponses = [];
  for (const s of activeSurveys) {
    const anonymousId = hashAnonymousId(s.id, userId);
    const resp = await db("survey_responses")
      .where({ survey_id: s.id, anonymous_id: anonymousId })
      .first();
    if (resp) {
      anonymousResponses.push({
        response_id: resp.id,
        survey_id: s.id,
        submitted_at: resp.submitted_at,
        title: s.title,
        type: s.type,
        is_anonymous: true,
      });
    }
  }

  return [...directResponses, ...anonymousResponses].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );
}

// ---------------------------------------------------------------------------
// Survey Dashboard
// ---------------------------------------------------------------------------

export async function getSurveyDashboard(orgId: number) {
  const db = getDB();

  const [{ active_count }] = await db("surveys")
    .where({ organization_id: orgId, status: "active" })
    .count("id as active_count");

  const [{ total_count }] = await db("surveys")
    .where({ organization_id: orgId })
    .count("id as total_count");

  const [{ draft_count }] = await db("surveys")
    .where({ organization_id: orgId, status: "draft" })
    .count("id as draft_count");

  const [{ closed_count }] = await db("surveys")
    .where({ organization_id: orgId, status: "closed" })
    .count("id as closed_count");

  // Total responses across all surveys
  const [{ total_responses }] = await db("survey_responses")
    .where({ organization_id: orgId })
    .count("id as total_responses");

  // Average response rate
  const allSurveys = await db("surveys")
    .where({ organization_id: orgId })
    .whereIn("status", ["active", "closed"])
    .select("response_count");

  // Get total org users for calculating rate
  const [{ user_count }] = await db("users")
    .where({ organization_id: orgId, status: 1 })
    .count("id as user_count");

  const avgResponseRate =
    allSurveys.length > 0 && Number(user_count) > 0
      ? Math.round(
          (allSurveys.reduce((s, sv) => s + sv.response_count, 0) /
            (allSurveys.length * Number(user_count))) *
            100
        )
      : 0;

  // Latest eNPS score
  const latestEnps = await db("surveys")
    .where({ organization_id: orgId, type: "enps" })
    .whereIn("status", ["active", "closed"])
    .orderBy("created_at", "desc")
    .first();

  let enpsScore = null;
  if (latestEnps) {
    const enpsResult = await calculateENPS(latestEnps.id);
    enpsScore = enpsResult?.score ?? null;
  }

  // Recent surveys
  const recentSurveys = await db("surveys")
    .where({ organization_id: orgId })
    .orderBy("created_at", "desc")
    .limit(10);

  return {
    active_count: Number(active_count),
    total_count: Number(total_count),
    draft_count: Number(draft_count),
    closed_count: Number(closed_count),
    total_responses: Number(total_responses),
    avg_response_rate: avgResponseRate,
    enps_score: enpsScore,
    user_count: Number(user_count),
    recent_surveys: recentSurveys,
  };
}

// ---------------------------------------------------------------------------
// Calculate eNPS
// ---------------------------------------------------------------------------

function calculateENPSFromRatings(ratings: number[]): {
  score: number;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  promoter_pct: number;
  detractor_pct: number;
} {
  if (ratings.length === 0) {
    return { score: 0, promoters: 0, passives: 0, detractors: 0, total: 0, promoter_pct: 0, detractor_pct: 0 };
  }

  const promoters = ratings.filter((r) => r >= 9).length;
  const passives = ratings.filter((r) => r >= 7 && r <= 8).length;
  const detractors = ratings.filter((r) => r <= 6).length;
  const total = ratings.length;

  const promoterPct = Math.round((promoters / total) * 100);
  const detractorPct = Math.round((detractors / total) * 100);
  const score = promoterPct - detractorPct;

  return {
    score,
    promoters,
    passives,
    detractors,
    total,
    promoter_pct: promoterPct,
    detractor_pct: detractorPct,
  };
}

export async function calculateENPS(surveyId: number) {
  const db = getDB();

  const survey = await db("surveys").where({ id: surveyId }).first();
  if (!survey) return null;

  // Find the eNPS question (0-10 scale)
  const enpsQuestion = await db("survey_questions")
    .where({ survey_id: surveyId, question_type: "enps_0_10" })
    .first();

  if (!enpsQuestion) {
    // Fallback: use first rating question
    const firstRating = await db("survey_questions")
      .where({ survey_id: surveyId })
      .whereIn("question_type", ["rating_1_10", "enps_0_10"])
      .first();
    if (!firstRating) return null;

    const answers = await db("survey_answers")
      .where({ question_id: firstRating.id })
      .whereNotNull("rating_value");
    const ratings = answers.map((a) => a.rating_value);
    return calculateENPSFromRatings(ratings);
  }

  const answers = await db("survey_answers")
    .where({ question_id: enpsQuestion.id })
    .whereNotNull("rating_value");
  const ratings = answers.map((a) => a.rating_value);
  return calculateENPSFromRatings(ratings);
}
