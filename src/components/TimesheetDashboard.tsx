import { useState, useMemo, useRef, useEffect } from "react";
import type { Task } from "../types";

type GroupBy = "task" | "project" | "tag";

interface TimesheetDashboardProps {
  tasks: Task[];
  formatTime: (seconds: number) => string;
  onUpdateTask?: (id: number, patch: Partial<Task>) => void;
  onEditTask?: (id: number) => void;
}

/** 短い時間表示 (例: 1h 23m, 45m) */
function shortTime(seconds: number): string {
  if (seconds <= 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDayOfWeek(dateStr: string): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(dateStr + "T00:00:00");
  return days[d.getDay()];
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDays(weekStart: Date): string[] {
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    days.push(toDateKey(d));
  }
  return days;
}

function flattenTasks(tasks: Task[]): Task[] {
  const result: Task[] = [];
  for (const t of tasks) {
    result.push(t);
    if (t.children.length > 0) {
      result.push(...flattenTasks(t.children));
    }
  }
  return result;
}

interface Row {
  label: string;
  taskObj?: Task; // task groupBy 時のみ
  seconds: Record<string, number>;
  weekTotal: number;
  totalElapsed: number; // 全期間の実績秒
  estimatedSeconds: number; // 予測（秒換算）
}

/** 差分テキスト (+1h 23m / -45m) */
function diffText(actual: number, estimated: number): string {
  if (estimated === 0) return "";
  const diff = actual - estimated;
  const prefix = diff > 0 ? "+" : diff < 0 ? "-" : "±";
  return `${prefix}${shortTime(Math.abs(diff)) || "0m"}`;
}

/** 効率テキスト (85%) */
function efficiencyText(actual: number, estimated: number): string {
  if (estimated === 0 || actual === 0) return "";
  return `${Math.round((actual / estimated) * 100)}%`;
}

/** 差分の色クラス */
function diffColor(actual: number, estimated: number): string {
  if (estimated === 0) return "text-gray-400";
  if (actual > estimated) return "text-red-500";
  if (actual < estimated) return "text-emerald-600";
  return "text-gray-500";
}

export default function TimesheetDashboard({
  tasks,
  formatTime,
  onUpdateTask,
  onEditTask,
}: TimesheetDashboardProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [groupBy, setGroupBy] = useState<GroupBy>("task");
  const [editingCell, setEditingCell] = useState<{
    taskId: number;
    date: string;
    minutes: string;
  } | null>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell) cellInputRef.current?.focus();
  }, [editingCell]);

  const handleCellClick = (taskId: number, date: string, currentSeconds: number) => {
    if (!onUpdateTask) return;
    setEditingCell({
      taskId,
      date,
      minutes: currentSeconds > 0 ? String(Math.round(currentSeconds / 60)) : "",
    });
  };

  const handleCellSave = () => {
    if (!editingCell || !onUpdateTask) return;
    const task = allTasks.find((t) => t.id === editingCell.taskId);
    if (!task) { setEditingCell(null); return; }
    const newSeconds = Math.max(0, (Number(editingCell.minutes) || 0) * 60);
    const newDailyLog = { ...task.dailyLog };
    if (newSeconds > 0) {
      newDailyLog[editingCell.date] = newSeconds;
    } else {
      delete newDailyLog[editingCell.date];
    }
    const newElapsedSeconds = Object.values(newDailyLog).reduce((sum, v) => sum + v, 0);
    onUpdateTask(task.id, { dailyLog: newDailyLog, elapsedSeconds: newElapsedSeconds });
    setEditingCell(null);
  };

  const weekStart = useMemo(() => {
    const now = new Date();
    const ws = getWeekStart(now);
    ws.setDate(ws.getDate() + weekOffset * 7);
    return ws;
  }, [weekOffset]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekLabel = `${formatDayLabel(weekDays[0])} - ${formatDayLabel(weekDays[6])}`;
  const allTasks = useMemo(() => flattenTasks(tasks), [tasks]);

  // --- 行データを生成 ---
  const rows: Row[] = useMemo(() => {
    if (groupBy === "task") {
      return allTasks
        .map((t) => {
          const log = t.dailyLog ?? {};
          const seconds: Record<string, number> = {};
          let weekTotal = 0;
          for (const day of weekDays) {
            const s = log[day] || 0;
            seconds[day] = s;
            weekTotal += s;
          }
          return {
            label: t.title + (t.project ? ` / ${t.project}` : ""),
            taskObj: t,
            seconds,
            weekTotal,
            totalElapsed: t.elapsedSeconds,
            estimatedSeconds: t.estimatedMinutes * 60,
          };
        })
        .filter((r) => r.weekTotal > 0 || r.totalElapsed > 0);
    }

    if (groupBy === "project") {
      const map = new Map<
        string,
        { seconds: Record<string, number>; est: number; total: number }
      >();
      for (const t of allTasks) {
        const key = t.project || "（未設定）";
        const log = t.dailyLog ?? {};
        if (!map.has(key)) map.set(key, { seconds: {}, est: 0, total: 0 });
        const entry = map.get(key)!;
        entry.est += t.estimatedMinutes * 60;
        entry.total += t.elapsedSeconds;
        for (const day of weekDays) {
          entry.seconds[day] = (entry.seconds[day] || 0) + (log[day] || 0);
        }
      }
      return Array.from(map.entries())
        .map(([label, { seconds, est, total }]) => {
          let weekTotal = 0;
          for (const day of weekDays) weekTotal += seconds[day] || 0;
          return { label, seconds, weekTotal, totalElapsed: total, estimatedSeconds: est };
        })
        .filter((r) => r.weekTotal > 0 || r.totalElapsed > 0);
    }

    // groupBy === "tag"
    const map = new Map<
      string,
      { seconds: Record<string, number>; est: number; total: number }
    >();
    for (const t of allTasks) {
      const tagList = t.tags.length > 0 ? t.tags : ["（タグなし）"];
      const log = t.dailyLog ?? {};
      for (const tag of tagList) {
        if (!map.has(tag)) map.set(tag, { seconds: {}, est: 0, total: 0 });
        const entry = map.get(tag)!;
        entry.est += t.estimatedMinutes * 60;
        entry.total += t.elapsedSeconds;
        for (const day of weekDays) {
          entry.seconds[day] = (entry.seconds[day] || 0) + (log[day] || 0);
        }
      }
    }
    return Array.from(map.entries())
      .map(([label, { seconds, est, total }]) => {
        let weekTotal = 0;
        for (const day of weekDays) weekTotal += seconds[day] || 0;
        return { label, seconds, weekTotal, totalElapsed: total, estimatedSeconds: est };
      })
      .filter((r) => r.weekTotal > 0 || r.totalElapsed > 0);
  }, [allTasks, weekDays, groupBy]);

  // --- 列合計 ---
  const dayTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const day of weekDays) {
      totals[day] = rows.reduce((sum, r) => sum + (r.seconds[day] || 0), 0);
    }
    return totals;
  }, [rows, weekDays]);

  const weekGrandTotal = rows.reduce((sum, r) => sum + r.weekTotal, 0);
  const weekGrandEstimated = rows.reduce((sum, r) => sum + r.estimatedSeconds, 0);

  const isToday = (dateStr: string) => toDateKey(new Date()) === dateStr;

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 shadow-sm transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-bold text-gray-800 min-w-[140px] text-center">
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 shadow-sm transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50 shadow-sm transition-all"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex rounded-xl bg-gray-100 p-0.5">
          {(
            [
              { key: "task", label: "Task" },
              { key: "project", label: "Project" },
              { key: "tag", label: "Tag" },
            ] as { key: GroupBy; label: string }[]
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setGroupBy(opt.key)}
              className={`rounded-[10px] px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
                groupBy === opt.key
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* サマリーカード（今週のデータに統一） */}
      <div className="grid grid-cols-3 gap-3">
        {/* 今週の実績 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            今週の実績
          </div>
          <div className="text-lg font-bold text-gray-900 font-mono tabular-nums">
            {formatTime(weekGrandTotal)}
          </div>
        </div>
        {/* 今週の予測 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            今週の予測
          </div>
          <div className="text-lg font-bold text-gray-900 font-mono tabular-nums">
            {weekGrandEstimated > 0 ? formatTime(weekGrandEstimated) : "--"}
          </div>
        </div>
        {/* 今週の差分 / 効率 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            差分 / 効率
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-bold font-mono tabular-nums ${diffColor(weekGrandTotal, weekGrandEstimated)}`}>
              {diffText(weekGrandTotal, weekGrandEstimated) || "--"}
            </span>
            {weekGrandEstimated > 0 && (
              <span className={`text-sm font-semibold ${diffColor(weekGrandTotal, weekGrandEstimated)}`}>
                ({efficiencyText(weekGrandTotal, weekGrandEstimated)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* テーブル */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider min-w-[200px]">
                {groupBy === "task" ? "Task / Project" : groupBy === "project" ? "Project" : "Tag"}
              </th>
              {weekDays.map((day) => (
                <th
                  key={day}
                  className={`text-center px-2 py-3 min-w-[80px] ${
                    isToday(day) ? "bg-blue-50/60" : ""
                  }`}
                >
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {getDayOfWeek(day)}
                  </div>
                  <div className={`text-xs font-bold mt-0.5 ${
                    isToday(day) ? "text-blue-600" : "text-gray-700"
                  }`}>
                    {formatDayLabel(day)}
                  </div>
                  <div className="text-[10px] font-medium text-gray-400 mt-0.5">
                    {shortTime(dayTotals[day] || 0) || "0m"}
                  </div>
                </th>
              ))}
              <th className="text-center px-3 py-3 min-w-[80px] bg-gray-50/60">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  週計
                </div>
              </th>
              <th className="text-center px-3 py-3 min-w-[70px] bg-gray-50/60">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  予測
                </div>
              </th>
              <th className="text-center px-3 py-3 min-w-[80px] bg-gray-50/60">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  差分
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={weekDays.length + 4}
                  className="text-center py-12 text-sm text-gray-400"
                >
                  この週の実績データはありません
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    {row.taskObj && onEditTask ? (
                      <button
                        onClick={() => onEditTask(row.taskObj!.id)}
                        className="text-xs font-medium text-gray-800 hover:text-indigo-600 hover:underline text-left truncate max-w-[200px] block"
                      >
                        {row.label}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-gray-800">{row.label}</span>
                    )}
                  </td>
                  {weekDays.map((day) => {
                    const s = row.seconds[day] || 0;
                    const isEditing =
                      editingCell?.taskId === row.taskObj?.id &&
                      editingCell?.date === day;
                    const canEdit = !!row.taskObj && !!onUpdateTask;
                    return (
                      <td
                        key={day}
                        className={`text-center px-2 py-3 ${
                          isToday(day) ? "bg-blue-50/40" : ""
                        } ${canEdit && !isEditing ? "cursor-pointer group/cell" : ""}`}
                        onClick={() => {
                          if (canEdit && !isEditing && !editingCell) {
                            handleCellClick(row.taskObj!.id, day, s);
                          }
                        }}
                      >
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              ref={cellInputRef}
                              type="number"
                              min={0}
                              value={editingCell!.minutes}
                              onChange={(e) =>
                                setEditingCell({ ...editingCell!, minutes: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.nativeEvent.isComposing) handleCellSave();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              className="w-12 rounded border border-blue-300 bg-white px-1 py-0.5 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="分"
                            />
                            <span className="text-[9px] text-gray-400">m</span>
                            <button
                              onClick={handleCellSave}
                              className="rounded bg-blue-500 px-1 py-0.5 text-[9px] text-white hover:bg-blue-600"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setEditingCell(null)}
                              className="rounded bg-gray-200 px-1 py-0.5 text-[9px] text-gray-600 hover:bg-gray-300"
                            >
                              ✗
                            </button>
                          </div>
                        ) : s > 0 ? (
                          <span className={`inline-block rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 tabular-nums ${canEdit ? "group-hover/cell:ring-1 group-hover/cell:ring-indigo-300 group-hover/cell:bg-indigo-50 group-hover/cell:text-indigo-700" : ""}`}>
                            {shortTime(s)}
                          </span>
                        ) : (
                          <span className={`text-xs ${canEdit ? "text-gray-200 group-hover/cell:text-indigo-300" : "text-gray-300"}`}>
                            {canEdit ? "+" : "--"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {/* 週計 */}
                  <td className="text-center px-3 py-3 bg-gray-50/40">
                    <span className="text-xs font-bold text-gray-800 tabular-nums">
                      {row.weekTotal > 0 ? shortTime(row.weekTotal) : "--"}
                    </span>
                  </td>
                  {/* 予測 */}
                  <td className="text-center px-3 py-3 bg-gray-50/40">
                    <span className="text-xs font-medium text-gray-500 tabular-nums">
                      {row.estimatedSeconds > 0 ? shortTime(row.estimatedSeconds) : "--"}
                    </span>
                  </td>
                  {/* 差分 */}
                  <td className="text-center px-3 py-3 bg-gray-50/40">
                    {row.estimatedSeconds > 0 && row.weekTotal > 0 ? (
                      <div>
                        <span className={`text-xs font-semibold tabular-nums ${diffColor(row.weekTotal, row.estimatedSeconds)}`}>
                          {diffText(row.weekTotal, row.estimatedSeconds)}
                        </span>
                        <div className={`text-[10px] font-medium ${diffColor(row.weekTotal, row.estimatedSeconds)}`}>
                          {efficiencyText(row.weekTotal, row.estimatedSeconds)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">--</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50/60">
                <td className="px-4 py-3">
                  <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Total
                  </span>
                </td>
                {weekDays.map((day) => (
                  <td
                    key={day}
                    className={`text-center px-2 py-3 ${
                      isToday(day) ? "bg-blue-50/60" : ""
                    }`}
                  >
                    <span className="text-xs font-bold text-gray-700 tabular-nums">
                      {shortTime(dayTotals[day] || 0) || "0m"}
                    </span>
                  </td>
                ))}
                <td className="text-center px-3 py-3 bg-gray-100/80">
                  <span className="text-sm font-bold text-gray-900 tabular-nums">
                    {formatTime(weekGrandTotal)}
                  </span>
                </td>
                <td className="text-center px-3 py-3 bg-gray-100/80">
                  <span className="text-xs font-bold text-gray-700 tabular-nums">
                    {weekGrandEstimated > 0 ? shortTime(weekGrandEstimated) : "--"}
                  </span>
                </td>
                <td className="text-center px-3 py-3 bg-gray-100/80">
                  {weekGrandEstimated > 0 ? (
                    <div>
                      <span className={`text-xs font-bold tabular-nums ${diffColor(weekGrandTotal, weekGrandEstimated)}`}>
                        {diffText(weekGrandTotal, weekGrandEstimated) || "--"}
                      </span>
                      <div className={`text-[10px] font-semibold ${diffColor(weekGrandTotal, weekGrandEstimated)}`}>
                        {efficiencyText(weekGrandTotal, weekGrandEstimated)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-300 text-xs">--</span>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
