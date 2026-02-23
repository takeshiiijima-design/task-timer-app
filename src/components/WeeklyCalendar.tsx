import { useState, useMemo } from "react";
import type { Task } from "../types";

interface WeeklyCalendarProps {
  tasks: Task[];
  onEditTask: (id: number) => void;
}

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

const PRIORITY_LEFT_BORDER: Record<string, string> = {
  high: "border-l-red-400",
  medium: "border-l-amber-400",
  low: "border-l-blue-300",
};

const PRIORITY_BG: Record<string, string> = {
  high: "bg-red-50",
  medium: "bg-white",
  low: "bg-blue-50",
};

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  todo: { text: "未着手", className: "text-gray-400" },
  in_progress: { text: "進行中", className: "text-indigo-500" },
  done: { text: "完了", className: "text-green-500" },
};

function flattenTasks(tasks: Task[]): Task[] {
  return tasks.flatMap((t) => [t, ...flattenTasks(t.children)]);
}

function getWeekDays(weekOffset: number): Date[] {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WeeklyCalendar({ tasks, onEditTask }: WeeklyCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = toDateStr(new Date());

  const allTasks = useMemo(() => {
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    return flattenTasks(tasks).filter(
      (t) => !t.archivedAt || now - new Date(t.archivedAt).getTime() < SEVEN_DAYS
    );
  }, [tasks]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of allTasks) {
      const date = task.dueDate ?? task.startDate;
      if (!date) continue;
      if (!map[date]) map[date] = [];
      map[date].push(task);
    }
    return map;
  }, [allTasks]);

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return `${s.getFullYear()}年${s.getMonth() + 1}月 ${s.getDate()}日〜${e.getDate()}日`;
    }
    return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`;
  })();

  return (
    <div className="flex flex-col gap-3">
      {/* ナビゲーションヘッダー */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="rounded-lg border border-gray-200 bg-white p-1.5 hover:bg-gray-50 transition-all"
        >
          <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-700 flex-1 text-center">{weekLabel}</span>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="rounded-lg border border-gray-200 bg-white p-1.5 hover:bg-gray-50 transition-all"
        >
          <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 transition-all"
          >
            今週
          </button>
        )}
      </div>

      {/* カレンダーグリッド */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-2 min-w-[560px] min-h-[500px]">
          {weekDays.map((date, i) => {
            const dateKey = toDateStr(date);
            const isToday = dateKey === today;
            const isPast = dateKey < today;
            const dayTasks = tasksByDate[dateKey] ?? [];
            const isSat = i === 5;
            const isSun = i === 6;

            return (
              <div key={dateKey} className="flex flex-col">
                {/* 日付ヘッダー */}
                <div
                  className={`flex flex-col items-center py-2 mb-2 rounded-xl ${
                    isToday
                      ? "bg-indigo-600"
                      : isPast
                      ? "bg-gray-50"
                      : isSat
                      ? "bg-blue-50"
                      : isSun
                      ? "bg-rose-50"
                      : "bg-gray-100"
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isToday
                        ? "text-indigo-200"
                        : isSat
                        ? "text-blue-400"
                        : isSun
                        ? "text-rose-400"
                        : "text-gray-400"
                    }`}
                  >
                    {DAY_LABELS[i]}
                  </span>
                  <span
                    className={`text-base font-bold leading-tight ${
                      isToday
                        ? "text-white"
                        : isPast
                        ? "text-gray-400"
                        : isSat
                        ? "text-blue-600"
                        : isSun
                        ? "text-rose-500"
                        : "text-gray-700"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayTasks.length > 0 && (
                    <span
                      className={`text-[9px] font-semibold mt-0.5 ${
                        isToday ? "text-indigo-200" : "text-gray-400"
                      }`}
                    >
                      {dayTasks.length}件
                    </span>
                  )}
                </div>

                {/* タスクリスト */}
                <div className="space-y-1.5">
                  {dayTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onEditTask(task.id)}
                      className={`w-full text-left rounded-lg border-l-2 border border-gray-100 pl-2 pr-1.5 py-1.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                        PRIORITY_LEFT_BORDER[task.priority]
                      } ${PRIORITY_BG[task.priority]} ${
                        task.status === "done" ? "opacity-50" : ""
                      }`}
                    >
                      <p
                        className={`text-[11px] font-semibold leading-snug line-clamp-2 ${
                          task.status === "done"
                            ? "line-through text-gray-400"
                            : "text-gray-800"
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span
                          className={`text-[9px] font-medium ${
                            STATUS_LABEL[task.status]?.className ?? "text-gray-400"
                          }`}
                        >
                          {STATUS_LABEL[task.status]?.text ?? ""}
                        </span>
                        {task.estimatedMinutes > 0 && (
                          <span className="text-[9px] text-gray-300 ml-auto">
                            {task.estimatedMinutes}m
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
