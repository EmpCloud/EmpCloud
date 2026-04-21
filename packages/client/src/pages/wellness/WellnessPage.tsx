import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { Link } from "react-router-dom";
import {
  Heart,
  Dumbbell,
  Brain,
  Apple,
  Flower2,
  Users,
  Stethoscope,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trophy,
  ArrowRight,
} from "lucide-react";

const PROGRAM_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  fitness: { label: "Fitness", color: "bg-green-100 text-green-700", icon: Dumbbell },
  mental_health: { label: "Mental Health", color: "bg-purple-100 text-purple-700", icon: Brain },
  nutrition: { label: "Nutrition", color: "bg-orange-100 text-orange-700", icon: Apple },
  meditation: { label: "Meditation", color: "bg-indigo-100 text-indigo-700", icon: Flower2 },
  yoga: { label: "Yoga", color: "bg-pink-100 text-pink-700", icon: Sparkles },
  team_activity: { label: "Team Activity", color: "bg-blue-100 text-blue-700", icon: Users },
  health_checkup: { label: "Health Checkup", color: "bg-red-100 text-red-700", icon: Stethoscope },
  other: { label: "Other", color: "bg-gray-100 text-gray-700", icon: Heart },
};

export default function WellnessPage() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  // #1375 — Surface enroll errors and confirmations inline
  const [enrollMessage, setEnrollMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  // Programs list
  const { data: programsData, isLoading } = useQuery({
    queryKey: ["wellness-programs", page, typeFilter],
    queryFn: () =>
      api
        .get("/wellness/programs", {
          params: {
            page,
            per_page: 12,
            ...(typeFilter ? { program_type: typeFilter } : {}),
            is_active: true,
          },
        })
        .then((r) => r.data),
  });

  // My summary (quick glance)
  const { data: summaryData } = useQuery({
    queryKey: ["wellness-summary"],
    queryFn: () => api.get("/wellness/summary").then((r) => r.data.data),
  });

  const enrollMutation = useMutation({
    mutationFn: (programId: number) =>
      api.post(`/wellness/programs/${programId}/enroll`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-programs"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-summary"] });
      setEnrollMessage({ type: "success", text: "Successfully enrolled in program" });
      setTimeout(() => setEnrollMessage(null), 4000);
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        "Failed to enroll in program";
      setEnrollMessage({ type: "error", text: msg });
      setTimeout(() => setEnrollMessage(null), 5000);
    },
  });

  const programs = programsData?.data || [];
  const total = programsData?.meta?.total || 0;
  const totalPages = programsData?.meta?.total_pages || 1;
  const enrolledProgramIds = new Set<number>(
    (summaryData?.enrolled_programs || []).map((p: any) => p.program_id)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {enrollMessage && (
        <div
          className={`p-3 rounded-lg border text-sm ${
            enrollMessage.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {enrollMessage.text}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Wellness Programs</h1>
          <p className="text-gray-500 mt-1">
            Explore programs, track your well-being, and achieve your health goals
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/wellness/check-in"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            Daily Check-in
          </Link>
          <Link
            to="/wellness/my"
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
          >
            My Wellness
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      {/* #1538 — Each stat card is now a <Link> so the cards are
          clickable and route to the relevant destination page. Previously
          these were plain <div>s, so clicking them did nothing. */}
      {summaryData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            to="/wellness/check-in"
            className="block text-left w-full bg-white rounded-xl border border-gray-200 p-4 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Heart className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Check-in Streak</p>
                <p className="text-xl font-bold text-gray-900">{summaryData.checkin_streak} days</p>
              </div>
            </div>
          </Link>
          <Link
            to="/wellness/my"
            className="block text-left w-full bg-white rounded-xl border border-gray-200 p-4 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Dumbbell className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Active Programs</p>
                <p className="text-xl font-bold text-gray-900">{summaryData.enrolled_programs?.length || 0}</p>
              </div>
            </div>
          </Link>
          <Link
            to="/wellness/my"
            className="block text-left w-full bg-white rounded-xl border border-gray-200 p-4 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Goals Completed</p>
                <p className="text-xl font-bold text-gray-900">{summaryData.completed_goals_count || 0}</p>
              </div>
            </div>
          </Link>
          <Link
            to="/wellness/check-in"
            className="block text-left w-full bg-white rounded-xl border border-gray-200 p-4 transition-all hover:border-brand-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Latest Mood</p>
                <p className="text-xl font-bold text-gray-900 capitalize">{summaryData.latest_mood || "---"}</p>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">All Types</option>
          {Object.entries(PROGRAM_TYPE_CONFIG).map(([key, { label }]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{total} programs available</span>
      </div>

      {/* Programs Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading programs...</div>
      ) : programs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Heart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No wellness programs available yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program: any) => {
            const cfg = PROGRAM_TYPE_CONFIG[program.program_type] || PROGRAM_TYPE_CONFIG.other;
            const Icon = cfg.icon;
            return (
              <div
                key={program.id}
                className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${cfg.color.split(" ")[0]} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${cfg.color.split(" ")[1]}`} />
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {program.points_reward > 0 && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      +{program.points_reward} pts
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2">{program.title}</h3>
                {program.description && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{program.description}</p>
                )}

                <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                  {program.start_date && (
                    <span>
                      {new Date(program.start_date).toLocaleDateString()} —{" "}
                      {program.end_date
                        ? new Date(program.end_date).toLocaleDateString()
                        : "Ongoing"}
                    </span>
                  )}
                  <span>
                    {program.enrolled_count}
                    {program.max_participants ? `/${program.max_participants}` : ""} enrolled
                  </span>
                </div>

                {enrolledProgramIds.has(program.id) ? (
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-medium cursor-not-allowed"
                  >
                    Enrolled
                  </button>
                ) : (
                  <button
                    onClick={() => enrollMutation.mutate(program.id)}
                    disabled={enrollMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    Enroll Now <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
