import { useState } from "react";
import type { DragEvent } from "react";
import type { Task, TaskStatus } from "../types";
import { STATUS_LABELS } from "../types";
import KanbanCard from "./KanbanCard";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

const COLUMN_STYLES: Record<TaskStatus, { accent: string; bg: string; dropBg: string }> = {
  todo: {
    accent: "bg-gray-400",
    bg: "bg-gray-50/80",
    dropBg: "bg-blue-50/60 ring-2 ring-blue-200 ring-inset",
  },
  in_progress: {
    accent: "bg-blue-500",
    bg: "bg-blue-50/30",
    dropBg: "bg-blue-50/60 ring-2 ring-blue-200 ring-inset",
  },
  done: {
    accent: "bg-emerald-500",
    bg: "bg-emerald-50/30",
    dropBg: "bg-emerald-50/60 ring-2 ring-emerald-200 ring-inset",
  },
};

interface KanbanBoardProps {
  tasks: Task[];
  onUpdateStatus: (id: number, status: TaskStatus) => void;
  onToggleTimer: (id: number) => void;
  onCardClick: (task: Task) => void;
  formatTime: (seconds: number) => string;
}

export default function KanbanBoard({
  tasks,
  onUpdateStatus,
  onToggleTimer,
  onCardClick,
  formatTime,
}: KanbanBoardProps) {
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  const handleDragStart = (e: DragEvent, id: number) => {
    e.dataTransfer.setData("text/plain", String(id));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverColumn(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    if (!isNaN(id)) {
      onUpdateStatus(id, status);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {COLUMNS.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        const style = COLUMN_STYLES[status];
        return (
          <div
            key={status}
            onDragOver={(e) => handleDragOver(e, status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, status)}
            className={`rounded-2xl p-3 min-h-[240px] transition-all duration-200 ${
              dragOverColumn === status ? style.dropBg : style.bg
            }`}
          >
            {/* カラムヘッダー */}
            <div className="flex items-center gap-2.5 mb-3 px-1">
              <span className={`h-2 w-2 rounded-full ${style.accent}`} />
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                {STATUS_LABELS[status]}
              </h3>
              <span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-gray-400 font-semibold shadow-sm">
                {columnTasks.length}
              </span>
            </div>

            {/* カード一覧 */}
            <div className="space-y-2.5">
              {columnTasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  formatTime={formatTime}
                  onToggleTimer={onToggleTimer}
                  onDragStart={handleDragStart}
                  onClick={onCardClick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
