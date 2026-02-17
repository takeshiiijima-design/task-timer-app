import { useEffect, useRef, useState } from "react";
import type { Task, TaskStatus, Priority } from "../types";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "../types";
import { getTotalElapsed } from "../taskTree";
import TagInput from "./TagInput";
import ProjectSelect from "./ProjectSelect";
import DateBadge from "./DateBadge";

interface TaskEditModalProps {
  task: Task;
  availableTags: string[];
  availableProjects: string[];
  onUpdate: (id: number, patch: Partial<Task>) => void;
  onDelete: (id: number) => void;
  onToggleTimer: (id: number) => void;
  onAddChild: (parentId: number, title: string, estimatedMinutes: number) => void;
  onEditTask: (id: number) => void;
  onClose: () => void;
  formatTime: (seconds: number) => string;
}

export default function TaskEditModal({
  task,
  availableTags,
  availableProjects,
  onUpdate,
  onDelete,
  onToggleTimer,
  onAddChild,
  onEditTask,
  onClose,
  formatTime,
}: TaskEditModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [childTitle, setChildTitle] = useState("");
  const [childMinutes, setChildMinutes] = useState("");
  const [editingElapsed, setEditingElapsed] = useState(false);
  const [elapsedH, setElapsedH] = useState("");
  const [elapsedM, setElapsedM] = useState("");
  const [elapsedS, setElapsedS] = useState("");

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const val = titleInputRef.current?.value.trim();
    if (val && val !== task.title) {
      onUpdate(task.id, { title: val });
    }
  };

  const handleAddChild = () => {
    const trimmed = childTitle.trim();
    if (!trimmed) return;
    onAddChild(task.id, trimmed, Number(childMinutes) || 0);
    setChildTitle("");
    setChildMinutes("");
  };

  const totalElapsed = getTotalElapsed(task);
  const hasChildren = task.children.length > 0;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl shadow-gray-200/50 overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
            Edit Task
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* タスク名（インプレース編集） */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Task Name
            </label>
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                defaultValue={task.title}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) commitTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="w-full rounded-xl border border-blue-300 bg-blue-50/30 px-4 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
              />
            ) : (
              <div
                onClick={() => setEditingTitle(true)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm font-medium text-gray-800 cursor-text hover:border-blue-300 hover:bg-blue-50/20 transition-all"
              >
                {task.title}
              </div>
            )}
          </div>

          {/* タイマー + 実績時間の修正 */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Timer
            </label>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => onToggleTimer(task.id)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                  task.isRunning
                    ? "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100"
                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                }`}
              >
                {task.isRunning
                  ? "Stop"
                  : task.elapsedSeconds > 0
                    ? "Resume"
                    : "Start"}
              </button>
              {!editingElapsed ? (
                <span
                  onClick={() => {
                    if (task.isRunning) return;
                    const h = Math.floor(task.elapsedSeconds / 3600);
                    const m = Math.floor((task.elapsedSeconds % 3600) / 60);
                    const s = task.elapsedSeconds % 60;
                    setElapsedH(String(h));
                    setElapsedM(String(m));
                    setElapsedS(String(s));
                    setEditingElapsed(true);
                  }}
                  className={`font-mono text-base tabular-nums font-bold cursor-pointer hover:bg-blue-50 rounded-lg px-2 py-0.5 transition-all ${
                    task.isRunning ? "text-blue-600 cursor-default" : "text-gray-600"
                  }`}
                  title={task.isRunning ? "" : "クリックで修正"}
                >
                  {formatTime(task.elapsedSeconds)}
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={elapsedH}
                    onChange={(e) => setElapsedH(e.target.value)}
                    className="w-12 rounded-lg border border-blue-300 bg-blue-50/30 px-1.5 py-1 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="h"
                  />
                  <span className="text-gray-400 text-xs">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={elapsedM}
                    onChange={(e) => setElapsedM(e.target.value)}
                    className="w-12 rounded-lg border border-blue-300 bg-blue-50/30 px-1.5 py-1 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="m"
                  />
                  <span className="text-gray-400 text-xs">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={elapsedS}
                    onChange={(e) => setElapsedS(e.target.value)}
                    className="w-12 rounded-lg border border-blue-300 bg-blue-50/30 px-1.5 py-1 text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="s"
                  />
                  <button
                    onClick={() => {
                      const total =
                        (Number(elapsedH) || 0) * 3600 +
                        (Number(elapsedM) || 0) * 60 +
                        (Number(elapsedS) || 0);
                      onUpdate(task.id, { elapsedSeconds: Math.max(0, total) });
                      setEditingElapsed(false);
                    }}
                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 transition-all"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingElapsed(false)}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-200 transition-all"
                  >
                    取消
                  </button>
                </div>
              )}
              {hasChildren && (
                <span className="text-xs text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1">
                  Total {formatTime(totalElapsed)}
                </span>
              )}
            </div>
            {!editingElapsed && !task.isRunning && (
              <p className="text-[10px] text-gray-400">
                時間をクリックすると手動で修正できます
              </p>
            )}
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Status
            </label>
            <div className="flex gap-2">
              {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdate(task.id, { status: s })}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                    task.status === s
                      ? STATUS_COLORS[s] + " ring-2 ring-offset-1 ring-blue-300"
                      : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* 重要度 */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Priority
            </label>
            <div className="flex gap-2">
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => onUpdate(task.id, { priority: p })}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                    task.priority === p
                      ? PRIORITY_COLORS[p] + " ring-2 ring-offset-1 ring-blue-300"
                      : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* 予測時間 */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Estimate (min)
            </label>
            <input
              type="number"
              min={0}
              value={task.estimatedMinutes}
              onChange={(e) =>
                onUpdate(task.id, {
                  estimatedMinutes: Number(e.target.value) || 0,
                })
              }
              className="w-28 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
            />
          </div>

          {/* 着手予定日・期日 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={task.startDate || ""}
                onChange={(e) =>
                  onUpdate(task.id, { startDate: e.target.value || null })
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Due Date
              </label>
              <input
                type="date"
                value={task.dueDate || ""}
                onChange={(e) =>
                  onUpdate(task.id, { dueDate: e.target.value || null })
                }
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
            </div>
          </div>

          {/* プロジェクト */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Project
            </label>
            <ProjectSelect
              value={task.project}
              availableProjects={availableProjects}
              onChange={(project) => onUpdate(task.id, { project })}
            />
          </div>

          {/* タグ */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Tags
            </label>
            <TagInput
              tags={task.tags}
              availableTags={availableTags}
              onChange={(tags) => onUpdate(task.id, { tags })}
            />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Memo
            </label>
            <textarea
              value={task.memo ?? ""}
              onChange={(e) => onUpdate(task.id, { memo: e.target.value })}
              placeholder="メモやコメントを入力..."
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all resize-y"
            />
          </div>

          {/* サブタスク一覧（フル機能） */}
          {hasChildren && (
            <div>
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Subtasks ({task.children.length})
              </label>
              <ul className="space-y-2">
                {task.children.map((child) => (
                  <li
                    key={child.id}
                    className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 hover:bg-gray-100/50 hover:border-gray-300 cursor-pointer transition-all"
                    onClick={() => onEditTask(child.id)}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-medium text-gray-800 flex-1 min-w-0 truncate">
                        {child.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[child.status]}`}
                        >
                          {STATUS_LABELS[child.status]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_COLORS[child.priority]}`}
                        >
                          {PRIORITY_LABELS[child.priority]}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleTimer(child.id);
                        }}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all ${
                          child.isRunning
                            ? "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100"
                            : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                        }`}
                      >
                        {child.isRunning ? "Stop" : child.elapsedSeconds > 0 ? "Resume" : "Start"}
                      </button>
                      <span
                        className={`font-mono text-[11px] tabular-nums font-semibold ${
                          child.isRunning ? "text-blue-600" : "text-gray-500"
                        }`}
                      >
                        {formatTime(child.elapsedSeconds)}
                      </span>
                      {child.estimatedMinutes > 0 && (
                        <span className="text-[10px] text-gray-400">
                          / {child.estimatedMinutes}m
                        </span>
                      )}
                      {(child.startDate || child.dueDate) && (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <DateBadge label="着手予定" date={child.startDate} icon="start" />
                          <DateBadge
                            label="期日"
                            date={child.dueDate}
                            icon="due"
                            warnIfPast={child.status !== "done"}
                          />
                        </div>
                      )}
                    </div>
                    {child.children.length > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {child.children.length} subtasks
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* サブタスク追加 */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Add Subtask
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="サブタスク名"
                value={childTitle}
                onChange={(e) => setChildTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    handleAddChild();
                  }
                }}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
              <input
                type="number"
                placeholder="分"
                min={0}
                value={childMinutes}
                onChange={(e) => setChildMinutes(e.target.value)}
                className="w-16 rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
              <button
                onClick={handleAddChild}
                className="rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <button
            onClick={() => {
              onDelete(task.id);
              onClose();
            }}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 transition-all"
          >
            Delete
          </button>
          <button
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
