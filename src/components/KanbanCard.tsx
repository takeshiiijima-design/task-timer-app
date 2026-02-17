import type { Task } from "../types";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "../types";
import { getTotalElapsed } from "../taskTree";
import DateBadge from "./DateBadge";
import type { DragEvent } from "react";

interface KanbanCardProps {
  task: Task;
  formatTime: (seconds: number) => string;
  onToggleTimer: (id: number) => void;
  onDragStart: (e: DragEvent, id: number) => void;
  onClick: (task: Task) => void;
}

export default function KanbanCard({
  task,
  formatTime,
  onToggleTimer,
  onDragStart,
  onClick,
}: KanbanCardProps) {
  const totalElapsed = getTotalElapsed(task);
  const hasChildren = task.children.length > 0;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onClick={() => onClick(task)}
      className="group rounded-xl border border-gray-200/80 bg-white p-3.5 shadow-sm cursor-pointer hover:shadow-md hover:bg-gray-50/40 hover:border-gray-300/80 active:cursor-grabbing transition-all duration-200"
    >
      {/* タイトル行 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-gray-800 leading-snug">
          {task.title}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_COLORS[task.priority]}`}
        >
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>

      {/* プロジェクト */}
      {task.project && (
        <p className="text-[10px] text-gray-400 mb-1.5">{task.project}</p>
      )}

      {/* タグ */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* タイマー */}
      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleTimer(task.id);
          }}
          className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
            task.isRunning
              ? "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100"
              : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
          }`}
        >
          {task.isRunning ? "Stop" : task.elapsedSeconds > 0 ? "Resume" : "Start"}
        </button>
        <span
          className={`font-mono text-xs tabular-nums font-semibold ${
            task.isRunning ? "text-blue-600" : "text-gray-500"
          }`}
        >
          {formatTime(hasChildren ? totalElapsed : task.elapsedSeconds)}
        </span>
        {task.estimatedMinutes > 0 && (
          <span className="text-[10px] text-gray-400">
            / {task.estimatedMinutes}m
          </span>
        )}
      </div>

      {/* 日付 */}
      {(task.startDate || task.dueDate) && (
        <div className="flex items-center gap-2.5 mt-2">
          <DateBadge label="着手予定" date={task.startDate} icon="start" />
          <DateBadge
            label="期日"
            date={task.dueDate}
            icon="due"
            warnIfPast={task.status !== "done"}
          />
        </div>
      )}

      {/* サブタスク件数 */}
      {hasChildren && (
        <p className="text-[10px] text-gray-400 mt-2">
          {task.children.length} subtasks
        </p>
      )}
    </div>
  );
}
