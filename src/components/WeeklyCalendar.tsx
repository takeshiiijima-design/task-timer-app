import { useState, useMemo, useEffect, useRef } from "react";
import type { Task } from "../types";

interface WeeklyCalendarProps {
  tasks: Task[];
  onEditTask: (id: number) => void;
}

const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

// 表示する時間帯 (0〜23)
const HOUR_START = 7;
const HOUR_END = 23;
const HOUR_COUNT = HOUR_END - HOUR_START;
const PX_PER_HOUR = 64; // 1時間あたりのピクセル高さ

const PRIORITY_BG: Record<string, string> = {
  high: "bg-red-100 border-red-300",
  medium: "bg-blue-100 border-blue-300",
  low: "bg-gray-100 border-gray-300",
};

const PRIORITY_TEXT: Record<string, string> = {
  high: "text-red-700",
  medium: "text-blue-700",
  low: "text-gray-600",
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

/** "HH:MM" → 時刻グリッド上のtop位置(px) */
function timeToTop(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  const totalMin = (h - HOUR_START) * 60 + m;
  return (totalMin / 60) * PX_PER_HOUR;
}

/** 分数 → ピクセル高さ */
function durationToHeight(minutes: number): number {
  return Math.max((minutes / 60) * PX_PER_HOUR, 20);
}

export default function WeeklyCalendar({ tasks, onEditTask }: WeeklyCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = toDateStr(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  // 現在時刻ライン用
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // マウント時・週変更時に現在時刻付近にスクロール
  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const top = timeToTop(`${now.getHours()}:${now.getMinutes()}`);
      scrollRef.current.scrollTop = Math.max(0, top - PX_PER_HOUR * 1.5);
    }
  }, [weekOffset]);

  const allTasks = useMemo(() => {
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    return flattenTasks(tasks).filter(
      (t) => !t.archivedAt || now - new Date(t.archivedAt).getTime() < SEVEN_DAYS
    );
  }, [tasks]);

  // 日付ごとのタスク（開始時刻あり → 時刻グリッド、なし → 終日エリア）
  const tasksByDate = useMemo(() => {
    const map: Record<string, { timed: Task[]; allDay: Task[] }> = {};
    for (const task of allTasks) {
      const date = task.dueDate ?? task.startDate;
      if (!date) continue;
      if (!map[date]) map[date] = { timed: [], allDay: [] };
      if (task.startTime) {
        map[date].timed.push(task);
      } else {
        map[date].allDay.push(task);
      }
    }
    return map;
  }, [allTasks]);

  const noDateTasks = useMemo(
    () => allTasks.filter((t) => !t.dueDate && !t.startDate && t.status !== "done"),
    [allTasks]
  );

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth()) {
      return `${s.getFullYear()}年${s.getMonth() + 1}月 ${s.getDate()}日〜${e.getDate()}日`;
    }
    return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`;
  })();

  // 現在時刻ラインのtop
  const nowTop = (() => {
    const h = currentTime.getHours();
    const m = currentTime.getMinutes();
    if (h < HOUR_START || h >= HOUR_END) return null;
    return timeToTop(`${h}:${m}`);
  })();


  return (
    <div className="flex flex-col h-full gap-0">
      {/* ナビゲーションヘッダー */}
      <div className="flex items-center gap-2 shrink-0 pb-2">
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

      {/* カレンダー本体 */}
      <div className="flex flex-col flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">

        {/* 曜日ヘッダー */}
        <div className="flex shrink-0 border-b border-gray-100">
          {/* 時刻列の幅分のスペーサー */}
          <div className="w-10 shrink-0" />
          {weekDays.map((date, i) => {
            const dateKey = toDateStr(date);
            const isToday = dateKey === today;
            const isSat = i === 5;
            const isSun = i === 6;
            const allDayTasks = tasksByDate[dateKey]?.allDay ?? [];
            return (
              <div key={dateKey} className="flex-1 border-l border-gray-100 min-w-0">
                {/* 日付 */}
                <div className={`flex flex-col items-center py-1.5 ${isToday ? "bg-indigo-50" : ""}`}>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${
                    isToday ? "text-indigo-400" : isSat ? "text-blue-400" : isSun ? "text-rose-400" : "text-gray-400"
                  }`}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className={`text-base font-bold leading-tight ${
                    isToday
                      ? "flex items-center justify-center h-7 w-7 rounded-full bg-indigo-600 text-white"
                      : isSat ? "text-blue-600" : isSun ? "text-rose-500" : "text-gray-700"
                  }`}>
                    {date.getDate()}
                  </span>
                </div>
                {/* 終日タスク */}
                {allDayTasks.length > 0 && (
                  <div className="px-0.5 pb-1 space-y-0.5 border-t border-gray-100">
                    {allDayTasks.map((task) => (
                      <button
                        key={task.id}
                        onClick={() => onEditTask(task.id)}
                        className={`w-full text-left rounded px-1 py-0.5 text-[9px] font-semibold truncate border ${
                          PRIORITY_BG[task.priority]
                        } ${PRIORITY_TEXT[task.priority]} ${task.status === "done" ? "opacity-50 line-through" : ""}`}
                      >
                        {task.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* スクロール可能な時刻グリッド */}
        <div ref={scrollRef} className="flex flex-1 overflow-y-auto overflow-x-hidden">
          {/* 時刻ラベル列 */}
          <div className="w-10 shrink-0 relative">
            {Array.from({ length: HOUR_COUNT }, (_, i) => {
              const hour = HOUR_START + i;
              return (
                <div
                  key={hour}
                  style={{ height: PX_PER_HOUR }}
                  className="flex items-start justify-end pr-1.5 pt-0.5"
                >
                  <span className="text-[9px] text-gray-300 leading-none">
                    {hour}:00
                  </span>
                </div>
              );
            })}
          </div>

          {/* 日別列 */}
          <div className="flex flex-1 relative min-w-0">
            {weekDays.map((date) => {
              const dateKey = toDateStr(date);
              const isToday = dateKey === today;
              const timedTasks = tasksByDate[dateKey]?.timed ?? [];

              return (
                <div
                  key={dateKey}
                  className={`flex-1 border-l border-gray-100 relative min-w-0 ${isToday ? "bg-indigo-50/20" : ""}`}
                  style={{ height: HOUR_COUNT * PX_PER_HOUR }}
                >
                  {/* 時間の横罫線 */}
                  {Array.from({ length: HOUR_COUNT }, (_, hi) => (
                    <div
                      key={hi}
                      className="absolute left-0 right-0 border-t border-gray-100"
                      style={{ top: hi * PX_PER_HOUR }}
                    />
                  ))}
                  {/* 30分罫線 */}
                  {Array.from({ length: HOUR_COUNT }, (_, hi) => (
                    <div
                      key={`h-${hi}`}
                      className="absolute left-0 right-0 border-t border-gray-50"
                      style={{ top: hi * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                    />
                  ))}

                  {/* 現在時刻ライン（今日の列のみ） */}
                  {isToday && nowTop !== null && (
                    <div
                      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                      style={{ top: nowTop }}
                    >
                      <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                      <div className="flex-1 h-px bg-red-400" />
                    </div>
                  )}

                  {/* 時刻付きタスク */}
                  {timedTasks.map((task) => {
                    const top = timeToTop(task.startTime!);
                    const height = durationToHeight(task.estimatedMinutes);
                    const isShort = height <= 28;
                    return (
                      <button
                        key={task.id}
                        onClick={() => onEditTask(task.id)}
                        className={`absolute left-0.5 right-0.5 z-10 rounded border text-left overflow-hidden transition-all hover:brightness-95 hover:z-20 hover:shadow-md ${
                          PRIORITY_BG[task.priority]
                        } ${task.status === "done" ? "opacity-50" : ""}`}
                        style={{ top, height }}
                      >
                        <div className={`px-1 ${isShort ? "py-0" : "py-0.5"}`}>
                          <p className={`font-semibold leading-tight truncate ${PRIORITY_TEXT[task.priority]} ${
                            isShort ? "text-[9px]" : "text-[10px]"
                          } ${task.status === "done" ? "line-through" : ""}`}>
                            {task.startTime} {task.title}
                          </p>
                          {!isShort && task.estimatedMinutes > 0 && (
                            <p className="text-[8px] text-gray-400 leading-none mt-0.5">
                              {task.estimatedMinutes}分
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

          </div>
        </div>
      </div>

      {/* 日付未設定タスク */}
      {noDateTasks.length > 0 && (
        <div className="shrink-0 mt-2 rounded-xl border border-gray-100 bg-white px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            日付未設定 ({noDateTasks.length}件)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {noDateTasks.slice(0, 8).map((task) => (
              <button
                key={task.id}
                onClick={() => onEditTask(task.id)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-semibold truncate max-w-[140px] ${
                  PRIORITY_BG[task.priority]
                } ${PRIORITY_TEXT[task.priority]}`}
              >
                {task.title}
              </button>
            ))}
            {noDateTasks.length > 8 && (
              <span className="text-[10px] text-gray-400 self-center">他 {noDateTasks.length - 8}件...</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
