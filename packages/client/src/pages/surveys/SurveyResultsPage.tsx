import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Users, BarChart3, Download } from "lucide-react";

const ENPS_COLOR = (score: number) =>
  score >= 50 ? "text-green-600" : score >= 0 ? "text-yellow-600" : "text-red-600";

export default function SurveyResultsPage() {
  const { id } = useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["survey-results", id],
    queryFn: () => api.get(`/surveys/${id}/results`).then((r) => r.data.data),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-400">Loading results...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-400">Survey not found.</div>
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
        <Link to="/surveys/list" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              data.status === "active" ? "bg-green-100 text-green-700" :
              data.status === "closed" ? "bg-blue-100 text-blue-700" :
              "bg-gray-100 text-gray-600"
            }`}>
              {data.status}
            </span>
            <span className="text-sm text-gray-500 capitalize">{data.type}</span>
          </div>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Responses</p>
              <p className="text-xl font-bold text-gray-900">{data.response_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Questions</p>
              <p className="text-xl font-bold text-gray-900">{data.questions.length}</p>
            </div>
          </div>
        </div>

        {data.overall_enps && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                data.overall_enps.score >= 0 ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
              }`}>
                <span className="text-lg font-bold">{data.overall_enps.score >= 0 ? "+" : ""}{data.overall_enps.score}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500">eNPS Score</p>
                <p className="text-sm text-gray-600">
                  P:{data.overall_enps.promoter_pct}% / D:{data.overall_enps.detractor_pct}%
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* eNPS Breakdown */}
      {data.overall_enps && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">eNPS Breakdown</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{data.overall_enps.promoters}</p>
              <p className="text-sm text-green-700 font-medium">Promoters (9-10)</p>
              <p className="text-xs text-green-600">{data.overall_enps.promoter_pct}%</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">{data.overall_enps.passives}</p>
              <p className="text-sm text-yellow-700 font-medium">Passives (7-8)</p>
              <p className="text-xs text-yellow-600">
                {data.overall_enps.total > 0
                  ? Math.round((data.overall_enps.passives / data.overall_enps.total) * 100)
                  : 0}%
              </p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{data.overall_enps.detractors}</p>
              <p className="text-sm text-red-700 font-medium">Detractors (0-6)</p>
              <p className="text-xs text-red-600">{data.overall_enps.detractor_pct}%</p>
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
      <div className="space-y-4 pb-8">
        {data.questions.map((q: any, idx: number) => (
          <div key={q.question_id} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-sm font-mono text-gray-400">{idx + 1}.</span>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{q.question_text}</p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{q.question_type.replace(/_/g, " ")} | {q.total_answers} answers</p>
              </div>
            </div>

            {/* Rating Distribution */}
            {["rating_1_5", "rating_1_10", "enps_0_10", "scale"].includes(q.question_type) && (
              <div>
                {q.avg_rating !== null && (
                  <p className="text-sm text-gray-600 mb-3">
                    Average: <span className="font-bold text-gray-900">{q.avg_rating}</span>
                    {q.min_rating !== null && (
                      <span className="text-gray-400 ml-2">(min: {q.min_rating}, max: {q.max_rating})</span>
                    )}
                  </p>
                )}

                {q.enps && (
                  <div className="mb-3 inline-flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg">
                    <span className="text-xs text-gray-500">eNPS:</span>
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
                    <span className="text-sm text-green-700 font-medium">Yes</span>
                    <span className="text-sm text-gray-500">
                      {q.distribution.yes || 0} ({q.total_answers > 0 ? Math.round(((q.distribution.yes || 0) / q.total_answers) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${q.total_answers > 0 ? ((q.distribution.yes || 0) / q.total_answers) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-red-700 font-medium">No</span>
                    <span className="text-sm text-gray-500">
                      {q.distribution.no || 0} ({q.total_answers > 0 ? Math.round(((q.distribution.no || 0) / q.total_answers) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
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
                          <span className="text-sm text-gray-700">{option}</span>
                          <span className="text-sm text-gray-500">{count as number} ({pct}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
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
                <p className="text-xs text-gray-400 mb-2">{q.text_responses.length} responses</p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {q.text_responses.map((text: string, i: number) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
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
              <span className="text-[10px] text-gray-500 mb-0.5">{count}</span>
            )}
            <div
              className={`w-full rounded-t ${barColor} min-h-[2px]`}
              style={{ height: `${Math.max(heightPct, 2)}%` }}
            />
            <span className="text-[10px] text-gray-400 mt-1">{val}</span>
          </div>
        );
      })}
    </div>
  );
}
