import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, BarChart3, Download } from "lucide-react";

const ENPS_COLOR = (score: number) =>
  score >= 50 ? "text-green-600 dark:text-green-400" : score >= 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";

export default function SurveyResultsPage() {
  const { t } = useTranslation();
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["survey-results", id],
    queryFn: () => api.get(`/surveys/${id}/results`).then((r) => r.data.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-muted-foreground">{t("surveyResults.loading")}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-muted-foreground">{t("surveyResults.notFound")}</div>
    );
  }

  const exportCSV = () => {
    let csv = "Question,Type,Total Answers,Avg Rating,Distribution\n";
    for (const q of data.questions) {
      const dist = q.distribution ? JSON.stringify(q.distribution) : "";
      csv += `"${q.question_text}","${q.question_type}",${q.total_answers},${q.avg_rating ?? ""},${dist.replace(/"/g, '""')}\n`;
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey-results-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/surveys/list" className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{data.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              data.status === "active" ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300" :
              data.status === "closed" ? "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300" :
              "bg-muted text-muted-foreground"
            }`}>
              {t(`surveyResults.status.${data.status}`)}
            </span>
            <span className="text-sm text-muted-foreground capitalize">{data.type}</span>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted"
        >
          <Download className="h-4 w-4" /> {t("surveyResults.actions.exportCsv")}
        </button>
      </div>

      {/* Summary Cards — clickable, scroll to the matching section below. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("per-question-results")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          aria-label={t("surveyResults.a11y.jumpToPerQuestion")}
          className="bg-card rounded-xl border border-border p-5 text-left transition hover:border-brand-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("surveyResults.summary.totalResponses")}</p>
              <p className="text-xl font-bold text-foreground">{data.response_count}</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() =>
            document
              .getElementById("per-question-results")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          aria-label={t("surveyResults.a11y.jumpToQuestionsBreakdown")}
          className="bg-card rounded-xl border border-border p-5 text-left transition hover:border-brand-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("surveyResults.summary.questions")}</p>
              <p className="text-xl font-bold text-foreground">{data.questions.length}</p>
            </div>
          </div>
        </button>

        {data.overall_enps && (
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("enps-breakdown")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            aria-label={t("surveyResults.a11y.jumpToEnpsBreakdown")}
            className="bg-card rounded-xl border border-border p-5 text-left transition hover:border-brand-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                data.overall_enps.score >= 0 ? "bg-green-100 dark:bg-green-950/40 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
              }`}>
                <span className="text-lg font-bold">{data.overall_enps.score >= 0 ? "+" : ""}{data.overall_enps.score}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("surveyResults.summary.enpsScore")}</p>
                <p className="text-sm text-muted-foreground">
                  P:{data.overall_enps.promoter_pct}% / D:{data.overall_enps.detractor_pct}%
                </p>
              </div>
            </div>
          </button>
        )}
      </div>

      {/* eNPS Breakdown */}
      {data.overall_enps && (
        <div id="enps-breakdown" className="bg-card rounded-xl border border-border p-6 mb-6 scroll-mt-4">
          <h2 className="text-lg font-semibold text-foreground mb-4">{t("surveyResults.enps.breakdownTitle")}</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/40 rounded-lg">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{data.overall_enps.promoters}</p>
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">{t("surveyResults.enps.promoters")}</p>
              <p className="text-xs text-green-600 dark:text-green-400">{data.overall_enps.promoter_pct}%</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-950/40 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{data.overall_enps.passives}</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 font-medium">{t("surveyResults.enps.passives")}</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {data.overall_enps.total > 0
                  ? Math.round((data.overall_enps.passives / data.overall_enps.total) * 100)
                  : 0}%
              </p>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-950/40 rounded-lg">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{data.overall_enps.detractors}</p>
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">{t("surveyResults.enps.detractors")}</p>
              <p className="text-xs text-red-600 dark:text-red-400">{data.overall_enps.detractor_pct}%</p>
            </div>
          </div>

          {/* eNPS bar */}
          <div className="mt-4">
            <div className="flex h-6 rounded-full overflow-hidden">
              {data.overall_enps.promoter_pct > 0 && (
                <div
                  className="bg-green-500 flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${data.overall_enps.promoter_pct}%` }}
                >
                  {data.overall_enps.promoter_pct}%
                </div>
              )}
              {data.overall_enps.total > 0 && (
                <div
                  className="bg-yellow-400 flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${Math.round((data.overall_enps.passives / data.overall_enps.total) * 100)}%` }}
                >
                </div>
              )}
              {data.overall_enps.detractor_pct > 0 && (
                <div
                  className="bg-red-500 flex items-center justify-center text-white text-xs font-medium"
                  style={{ width: `${data.overall_enps.detractor_pct}%` }}
                >
                  {data.overall_enps.detractor_pct}%
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Per-Question Results */}
      <div id="per-question-results" className="space-y-4 pb-8 scroll-mt-4">
        {data.questions.map((q: any, idx: number) => (
          <div key={q.question_id} className="bg-card rounded-xl border border-border p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-sm font-mono text-muted-foreground">{idx + 1}.</span>
              <div className="flex-1">
                <p className="font-medium text-foreground">{q.question_text}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("surveyResults.question.answersMeta", {
                    type: t(`surveyResults.questionType.${q.question_type}`),
                    count: q.total_answers,
                  })}
                </p>
              </div>
            </div>

            {/* Rating Distribution */}
            {["rating_1_5", "rating_1_10", "enps_0_10", "scale"].includes(q.question_type) && (
              <div>
                {q.avg_rating !== null && (
                  <p className="text-sm text-muted-foreground mb-3">
                    {t("surveyResults.question.average")} <span className="font-bold text-foreground">{q.avg_rating}</span>
                    {q.min_rating !== null && (
                      <span className="text-muted-foreground ml-2">{t("surveyResults.question.minMax", { min: q.min_rating, max: q.max_rating })}</span>
                    )}
                  </p>
                )}

                {q.enps && (
                  <div className="mb-3 inline-flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg">
                    <span className="text-xs text-muted-foreground">{t("surveyResults.enps.inlineLabel")}</span>
                    <span className={`text-sm font-bold ${ENPS_COLOR(q.enps.score)}`}>{q.enps.score}</span>
                  </div>
                )}

                {q.distribution && (
                  <RatingDistribution
                    distribution={q.distribution}
                    type={q.question_type}
                    total={q.total_answers}
                  />
                )}
              </div>
            )}

            {/* Yes/No Distribution */}
            {q.question_type === "yes_no" && q.distribution && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-green-700 dark:text-green-300 font-medium">{t("surveyResults.question.yes")}</span>
                    <span className="text-sm text-muted-foreground">
                      {q.distribution.yes || 0} ({q.total_answers > 0 ? Math.round(((q.distribution.yes || 0) / q.total_answers) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${q.total_answers > 0 ? ((q.distribution.yes || 0) / q.total_answers) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">{t("surveyResults.question.no")}</span>
                    <span className="text-sm text-muted-foreground">
                      {q.distribution.no || 0} ({q.total_answers > 0 ? Math.round(((q.distribution.no || 0) / q.total_answers) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full"
                      style={{ width: `${q.total_answers > 0 ? ((q.distribution.no || 0) / q.total_answers) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Multiple Choice Distribution */}
            {q.question_type === "multiple_choice" && q.distribution && (
              <div className="space-y-2">
                {Object.entries(q.distribution)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([option, count]) => {
                    const pct = q.total_answers > 0 ? Math.round(((count as number) / q.total_answers) * 100) : 0;
                    return (
                      <div key={option}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-muted-foreground">{option}</span>
                          <span className="text-sm text-muted-foreground">{count as number} ({pct}%)</span>
                        </div>
                        <div className="h-3 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Text Responses */}
            {q.question_type === "text" && q.text_responses && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">{t("surveyResults.question.responsesCount", { count: q.text_responses.length })}</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {q.text_responses.map((text: string, i: number) => (
                    <div key={i} className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rating Distribution Bar Chart
// ---------------------------------------------------------------------------

function RatingDistribution({
  distribution,
  type,
}: {
  distribution: Record<string, number>;
  type: string;
  total: number;
}) {
  const range =
    type === "enps_0_10" ? Array.from({ length: 11 }, (_, i) => i) :
    type === "rating_1_10" ? Array.from({ length: 10 }, (_, i) => i + 1) :
    type === "rating_1_5" ? [1, 2, 3, 4, 5] :
    Object.keys(distribution).map(Number).sort((a, b) => a - b);

  const maxCount = Math.max(...Object.values(distribution), 1);

  return (
    <div className="flex items-end gap-1" style={{ height: "120px" }}>
      {range.map((val) => {
        const count = distribution[val] || 0;
        const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const barColor =
          type === "enps_0_10"
            ? val <= 6 ? "bg-red-400" : val <= 8 ? "bg-yellow-400" : "bg-green-400"
            : "bg-brand-500";

        return (
          <div key={val} className="flex flex-col items-center flex-1 h-full justify-end">
            {count > 0 && (
              <span className="text-[10px] text-muted-foreground mb-0.5">{count}</span>
            )}
            <div
              className={`w-full rounded-t ${barColor} min-h-[2px]`}
              style={{ height: `${Math.max(heightPct, 2)}%` }}
            />
            <span className="text-[10px] text-muted-foreground mt-1">{val}</span>
          </div>
        );
      })}
    </div>
  );
}
