import { useState } from "react";
import type { Task, TaskStatus } from "../types";
import TaskCard from "./TaskCard";

interface StatusGroupProps {
  status: TaskStatus;
  tasks: Task[];
  onDelete: (id: number) => void;
  onToggleTimer: (id: number) => void;
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onClick: (task: Task) => void;
  formatTime: (seconds: number) => string;
}

const GROUP_CONFIG: Record<TaskStatus, { label: string; color: string; dotColor: string; bgColor: string }> = {
  in_progress: {
    label: "進行中",
    color: "text-blue-700",
    dotColor: "bg-blue-500",
    bgColor: "bg-blue-50",
  },
  todo: {
    label: "未着手",
    color: "text-gray-600",
    dotColor: "bg-gray-400",
    bgColor: "bg-gray-50",
  },
  done: {
    label: "完了",
    color: "text-green-700",
    dotColor: "bg-green-500",
    bgColor: "bg-green-50",
  },
};

export default function StatusGroup({
  status,
  tasks,
  onDelete,
  onToggleTimer,
  onUpdate,
  onClick,
  formatTime,
}: StatusGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const config = GROUP_CONFIG[status];

  if (tasks.length === 0) return null;

  return (
    <div className="mb-2">
      {/* グループヘッダー */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-t-lg ${config.bgColor} hover:brightness-95 transition-all select-none`}
      >
        <span className="text-[10px] text-gray-400 transition-transform" style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>
          ▼
        </span>
        <span className={`h-2 w-2 rounded-full ${config.dotColor}`} />
        <span className={`text-xs font-bold uppercase tracking-wide ${config.color}`}>
          {config.label}
        </span>
        <span className="text-[11px] font-medium text-gray-400">
          {tasks.length}
        </span>
      </button>

      {/* テーブルヘッダー + タスク行 */}
      {!collapsed && (
        <div className="border border-gray-100 border-t-0 rounded-b-lg bg-white overflow-hidden">
          {/* カラムヘッダー */}
          <div className="flex items-center h-7 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
            <div className="w-7 shrink-0" />
            <div className="flex-1 min-w-0">タスク名</div>
            <div className="shrink-0 w-[72px] text-center">状態</div>
            <div className="shrink-0 w-[40px] text-center">優先</div>
            <div className="shrink-0 w-[80px] text-center">期限</div>
            <div className="shrink-0 w-[120px] text-center">実績</div>
            <div className="shrink-0 w-[60px] text-center">予測</div>
            <div className="shrink-0 w-6 ml-1" />
          </div>

          {/* タスク行 */}
          <ul>
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                depth={0}
                onDelete={onDelete}
                onToggleTimer={onToggleTimer}
                onUpdate={onUpdate}
                onClick={onClick}
                formatTime={formatTime}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
