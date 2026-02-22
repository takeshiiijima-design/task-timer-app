import { useState, useRef, useEffect } from "react";
import type { Task } from "../types";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
} from "../types";
import { getTotalElapsed, getTotalEstimated } from "../taskTree";

interface TaskCardProps {
  task: Task;
  depth: number;
  onDelete: (id: number) => void;
  onToggleTimer: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onClick: (task: Task) => void;
  formatTime: (seconds: number) => string;
}

/** 期限を絶対日付で表示（今日のみ「今日」） */
function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "今日";
  return `${target.getMonth() + 1}/${target.getDate()}`;
}

/** 期限の色クラス */
function dueDateColor(dateStr: string | null, status: string): string {
  if (!dateStr || status === "done") return "text-gray-400";
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "text-red-500 font-semibold";
  if (diffDays === 0) return "text-orange-500 font-semibold";
  if (diffDays <= 2) return "text-amber-500";
  return "text-gray-500";
}

/** ステータスに対応するドットの色 */
const STATUS_DOT: Record<string, string> = {
  todo: "bg-gray-400",
  in_progress: "bg-blue-500",
  done: "bg-green-500",
};

/** 優先度アイコン */
function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "high") {
    return (
      <svg className="h-3.5 w-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 3l-7 14h14L10 3z" />
      </svg>
    );
  }
  if (priority === "low") {
    return (
      <svg className="h-3.5 w-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 17l-7-14h14L10 17z" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
      <rect x="4" y="8" width="12" height="4" rx="1" />
    </svg>
  );
}

export default function TaskCard({
  task,
  depth,
  onDelete,
  onToggleTimer,
  onUpdate,
  onClick,
  formatTime,
}: TaskCardProps) {
  const [showChildren, setShowChildren] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState(false);
  const dueDateRef = useRef<HTMLInputElement>(null);
  const estimateRef = useRef<HTMLInputElement>(null);

  const totalElapsed = getTotalElapsed(task);
  const totalEstimated = getTotalEstimated(task);
  const hasChildren = task.children.length > 0;
  const displayElapsed = hasChildren ? totalElapsed : task.elapsedSeconds;
  const displayEstimate = hasChildren ? totalEstimated : task.estimatedMinutes;

  useEffect(() => {
    if (editingDueDate) dueDateRef.current?.focus();
  }, [editingDueDate]);

  useEffect(() => {
    if (editingEstimate) {
      estimateRef.current?.focus();
      estimateRef.current?.select();
    }
  }, [editingEstimate]);

  const commitDueDate = () => {
    const val = dueDateRef.current?.value || null;
    if (val !== task.dueDate) {
      onUpdate(task.id, { dueDate: val || null });
    }
    setEditingDueDate(false);
  };

  const commitEstimate = () => {
    const val = Number(estimateRef.current?.value) || 0;
    if (val !== task.estimatedMinutes) {
      onUpdate(task.id, { estimatedMinutes: val });
    }
    setEditingEstimate(false);
  };

  return (
    <li className="list-none">
      <div
        onClick={() => onClick(task)}
        className={`group flex items-center h-10 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
          task.isRunning ? "bg-blue-50/40" : ""
        } ${task.status === "done" ? "opacity-60" : ""}`}
        style={{ paddingLeft: depth > 0 ? `${depth * 24 + 12}px` : "12px" }}
      >
        {/* 展開ボタン + ステータスドット */}
        <div className="w-7 shrink-0 flex items-center justify-center">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowChildren(!showChildren);
              }}
              className="flex items-center justify-center h-5 w-5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-[10px] transition-colors"
            >
              {showChildren ? "▼" : "▶"}
            </button>
          ) : (
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[task.status] || "bg-gray-400"}`} />
          )}
        </div>

        {/* タスク名 */}
        <div className="flex-1 min-w-0 flex items-center gap-2 pr-3">
          <span
            className={`text-[13px] text-gray-800 truncate leading-tight ${
              task.status === "done" ? "line-through text-gray-400" : ""
            }`}
          >
            {task.title}
          </span>
          {hasChildren && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 leading-none">
              {task.children.length}
            </span>
          )}
          {task.project && (
            <span className="shrink-0 hidden sm:inline-block truncate max-w-[100px] rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-500 leading-none">
              {task.project}
            </span>
          )}
          {task.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="shrink-0 hidden md:inline-block truncate max-w-[60px] rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-500 leading-none"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* ステータスバッジ */}
        <div className="shrink-0 w-[72px] flex justify-center" onClick={(e) => e.stopPropagation()}>
          <select
            value={task.status}
            onChange={(e) => {
              const newStatus = e.target.value as Task["status"];
              if (newStatus === "done") {
                onUpdate(task.id, { status: newStatus, archivedAt: new Date().toISOString() });
              } else {
                onUpdate(task.id, { status: newStatus, archivedAt: null });
              }
            }}
            className={`appearance-none text-center rounded-full px-2 py-0.5 text-[10px] font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 ${
              task.status === "done"
                ? "bg-green-100 text-green-700"
                : task.status === "in_progress"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            <option value="todo">{STATUS_LABELS.todo}</option>
            <option value="in_progress">{STATUS_LABELS.in_progress}</option>
            <option value="done">{STATUS_LABELS.done}</option>
          </select>
        </div>

        {/* 優先度 */}
        <div
          className="shrink-0 w-[40px] flex justify-center"
          onClick={(e) => e.stopPropagation()}
          title={PRIORITY_LABELS[task.priority]}
        >
          <button
            onClick={() => {
              const order: Task["priority"][] = ["low", "medium", "high"];
              const idx = order.indexOf(task.priority);
              onUpdate(task.id, { priority: order[(idx + 1) % 3] });
            }}
            className="p-0.5 rounded hover:bg-gray-100 transition-colors"
          >
            <PriorityIcon priority={task.priority} />
          </button>
        </div>

        {/* 期限 */}
        <div
          className="shrink-0 w-[80px] text-center"
          onClick={(e) => e.stopPropagation()}
        >
          {editingDueDate ? (
            <input
              ref={dueDateRef}
              type="date"
              defaultValue={task.dueDate || ""}
              onBlur={commitDueDate}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitDueDate();
                if (e.key === "Escape") setEditingDueDate(false);
              }}
              className="w-full rounded border border-blue-300 bg-blue-50/30 px-1 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          ) : (
            <span
              onClick={() => setEditingDueDate(true)}
              className={`inline-block px-1 py-0.5 text-[11px] rounded hover:bg-gray-100 cursor-pointer transition-colors ${dueDateColor(task.dueDate, task.status)}`}
            >
              {task.dueDate ? formatDueDate(task.dueDate) : "—"}
            </span>
          )}
        </div>

        {/* タイマー */}
        <div
          className="shrink-0 w-[120px] flex items-center justify-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onToggleTimer(task.id)}
            className={`flex items-center justify-center h-6 w-6 rounded-full transition-all ${
              task.isRunning
                ? "bg-red-100 text-red-600 hover:bg-red-200"
                : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
            }`}
          >
            {task.isRunning ? (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span
            className={`font-mono text-[11px] tabular-nums ${
              task.isRunning ? "text-blue-600 font-semibold" : displayElapsed > 0 ? "text-gray-600" : "text-gray-300"
            }`}
          >
            {displayElapsed > 0 || task.isRunning ? formatTime(displayElapsed) : "—"}
          </span>
        </div>

        {/* 予測時間 */}
        <div
          className="shrink-0 w-[60px] text-center"
          onClick={(e) => e.stopPropagation()}
        >
          {editingEstimate ? (
            <input
              ref={estimateRef}
              type="number"
              min={0}
              defaultValue={task.estimatedMinutes}
              onBlur={commitEstimate}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) commitEstimate();
                if (e.key === "Escape") setEditingEstimate(false);
              }}
              className="w-full rounded border border-blue-300 bg-blue-50/30 px-1 py-0.5 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          ) : (
            <span
              onClick={() => !hasChildren && setEditingEstimate(true)}
              className={`inline-block px-1 py-0.5 text-[11px] rounded ${
                hasChildren ? "" : "hover:bg-gray-100 cursor-pointer"
              } transition-colors ${displayEstimate > 0 ? "text-gray-500" : "text-gray-300"}`}
            >
              {displayEstimate > 0 ? `${displayEstimate}m` : "—"}
            </span>
          )}
        </div>

        {/* 削除ボタン */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="shrink-0 flex items-center justify-center h-6 w-6 rounded text-gray-300 hover:bg-red-50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-1"
          aria-label="削除"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* サブタスク一覧（再帰） */}
      {showChildren && hasChildren && (
        <ul>
          {task.children.map((child) => (
            <TaskCard
              key={child.id}
              task={child}
              depth={depth + 1}
              onDelete={onDelete}
              onToggleTimer={onToggleTimer}
              onUpdate={onUpdate}
              onClick={onClick}
              formatTime={formatTime}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
