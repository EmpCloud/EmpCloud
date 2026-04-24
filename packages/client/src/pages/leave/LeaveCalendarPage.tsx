import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/api/client";
import { leaveTypeLabel } from "@/lib/leave-type-label";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarLeave {
  id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  days_count: number;
  first_name: string;
  last_name: string;
  emp_code: string | null;
  leave_type_name: string;
  leave_type_code?: string | null;
  leave_type_color: string | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

export default function LeaveCalendarPage() {
  const { t } = useTranslation();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());

  const { data: leaves = [], isLoading } = useQuery<CalendarLeave[]>({
    queryKey: ["leave-calendar", month, year],
    queryFn: () =>
      api.get("/leave/calendar", { params: { month, year } }).then((r) => r.data.data),
  });

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const getLeavesForDay = (day: number): CalendarLeave[] => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return leaves.filter((l) => l.start_date <= dateStr && l.end_date >= dateStr);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad remaining cells
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Calendar</h1>
          <p className="text-gray-500 mt-1">View approved leaves across your organization.</p>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 uppercase py-3">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {isLoading ? (
          <div className="py-20 text-center text-gray-400">Loading calendar...</div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((day, idx) => {
              const dayLeaves = day ? getLeavesForDay(day) : [];
              const isToday =
                day === today.getDate() &&
                month === today.getMonth() + 1 &&
                year === today.getFullYear();

              return (
                <div
                  key={idx}
                  className={`min-h-[100px] border-b border-r border-gray-100 p-2 ${
                    day ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  {day && (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          isToday
                            ? "bg-brand-600 text-white rounded-full w-7 h-7 flex items-center justify-center"
                            : "text-gray-700"
                        }`}
                      >
                        {day}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayLeaves.slice(0, 3).map((leave) => (
                          <div
                            key={leave.id}
                            className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate"
                            style={{
                              backgroundColor: (leave.leave_type_color ?? "#6366f1") + "20",
                              color: leave.leave_type_color ?? "#6366f1",
                            }}
                            title={`${leave.first_name} ${leave.last_name} - ${leaveTypeLabel(t, { code: leave.leave_type_code, name: leave.leave_type_name })}`}
                          >
                            {leave.first_name} {leave.last_name[0]}.
                          </div>
                        ))}
                        {dayLeaves.length > 3 && (
                          <div className="text-[10px] text-gray-400 px-1.5">
                            +{dayLeaves.length - 3} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
