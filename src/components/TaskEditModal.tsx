import { useEffect, useRef, useState } from "react";
import type { Task, TaskStatus, Priority } from "../types";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
} from "../types";
import { getTotalElapsed, todayKey } from "../taskTree";
import TagInput from "./TagInput";
import ProjectSelect from "./ProjectSelect";

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

/** 秒数を "1h 30m" / "45m" / "0m" 形式に変換 */
function secondsToDisplay(s: number): string {
  const totalMin = Math.floor(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** "1h 30m" / "90m" / "1:30" / "90" などを秒数に変換 */
function parseElapsedInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // "1h 30m" / "1h30m" / "1h"
  const hm = trimmed.match(/^(\d+)\s*h\s*(\d*)\s*m?$/i);
  if (hm) {
    return (parseInt(hm[1]) * 60 + parseInt(hm[2] || "0")) * 60;
  }
  // "90m" / "90"
  const mOnly = trimmed.match(/^(\d+)\s*m?$/i);
  if (mOnly) {
    return parseInt(mOnly[1]) * 60;
  }
  // "1:30"
  const colon = trimmed.match(/^(\d+):(\d{2})$/);
  if (colon) {
    return (parseInt(colon[1]) * 60 + parseInt(colon[2])) * 60;
  }
  return null;
}

const ADJUST_BUTTONS = [
  { label: "-30m", delta: -1800 },
  { label: "-5m", delta: -300 },
  { label: "+5m", delta: 300 },
  { label: "+30m", delta: 1800 },
];

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

  // 実績時間編集
  const [editingElapsed, setEditingElapsed] = useState(false);
  const [elapsedInput, setElapsedInput] = useState("");
  const [workDate, setWorkDate] = useState(task.dueDate || todayKey());
  const elapsedInputRef = useRef<HTMLInputElement>(null);

  // 予測時間編集
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateInput, setEstimateInput] = useState("");
  const estimateInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (editingElapsed) elapsedInputRef.current?.focus();
  }, [editingElapsed]);

  useEffect(() => {
    if (editingEstimate) estimateInputRef.current?.focus();
  }, [editingEstimate]);

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

  const openElapsedEdit = () => {
    if (task.isRunning) return;
    setElapsedInput(secondsToDisplay(task.elapsedSeconds));
    setWorkDate(task.dueDate || todayKey());
    setEditingElapsed(true);
  };

  const saveElapsed = () => {
    const parsed = parseElapsedInput(elapsedInput);
    if (parsed === null) { setEditingElapsed(false); return; }
    const newElapsed = Math.max(0, parsed);
    const date = workDate || todayKey();
    onUpdate(task.id, {
      elapsedSeconds: newElapsed,
      dailyLog: { [date]: newElapsed },
    });
    setEditingElapsed(false);
  };

  const adjustElapsed = (deltaSec: number) => {
    const base = editingElapsed
      ? (parseElapsedInput(elapsedInput) ?? task.elapsedSeconds)
      : task.elapsedSeconds;
    const newVal = Math.max(0, base + deltaSec);
    if (editingElapsed) {
      setElapsedInput(secondsToDisplay(newVal));
    } else {
      const date = workDate || todayKey();
      onUpdate(task.id, {
        elapsedSeconds: newVal,
        dailyLog: { [date]: newVal },
      });
    }
  };

  const openEstimateEdit = () => {
    setEstimateInput(task.estimatedMinutes > 0 ? secondsToDisplay(task.estimatedMinutes * 60) : "");
    setEditingEstimate(true);
  };

  const saveEstimate = () => {
    const parsed = parseElapsedInput(estimateInput);
    if (parsed !== null) {
      onUpdate(task.id, { estimatedMinutes: Math.max(0, Math.round(parsed / 60)) });
    }
    setEditingEstimate(false);
  };

  const adjustEstimate = (deltaSec: number) => {
    const deltaMin = deltaSec / 60;
    const newMin = Math.max(0, task.estimatedMinutes + deltaMin);
    onUpdate(task.id, { estimatedMinutes: newMin });
  };

  const totalElapsed = getTotalElapsed(task);
  const hasChildren = task.children.length > 0;

  // ---- サイドバー用セクションラベル ----
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
    </p>
  );

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl shadow-gray-200/50 overflow-hidden max-h-[88vh] flex flex-col">

        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 shrink-0">
          <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
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

        {/* 2カラムコンテンツ */}
        <div className="flex flex-1 min-h-0">

          {/* ===== 左カラム: タスク名・メモ・サブタスク ===== */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100 overflow-y-auto">
            <div className="px-6 pt-5 pb-4 space-y-4">

              {/* タスク名 */}
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
                  className="w-full text-lg font-semibold text-gray-900 rounded-xl border border-blue-300 bg-blue-50/20 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              ) : (
                <div
                  onClick={() => setEditingTitle(true)}
                  className="w-full text-lg font-semibold text-gray-900 rounded-xl px-3 py-2 cursor-text hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all leading-snug"
                >
                  {task.title}
                </div>
              )}

              {/* メモ */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Memo
                </label>
                <textarea
                  value={task.memo ?? ""}
                  onChange={(e) => onUpdate(task.id, { memo: e.target.value })}
                  placeholder="メモやコメントを入力..."
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 focus:bg-white transition-all resize-y"
                />
              </div>

              {/* サブタスク一覧 */}
              {hasChildren && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Subtasks ({task.children.length})
                  </label>
                  <ul className="space-y-1.5">
                    {task.children.map((child) => (
                      <li
                        key={child.id}
                        onClick={() => onEditTask(child.id)}
                        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50/50 px-3 py-2 cursor-pointer hover:bg-gray-100/60 hover:border-gray-300 transition-all"
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${child.status === "done" ? "bg-green-400" : child.status === "in_progress" ? "bg-blue-400" : "bg-gray-300"}`} />
                        <span className={`flex-1 text-xs font-medium truncate ${child.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>
                          {child.title}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggleTimer(child.id); }}
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all ${child.isRunning ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {child.isRunning ? "Stop" : child.elapsedSeconds > 0 ? "Resume" : "Start"}
                        </button>
                        <span className="shrink-0 font-mono text-[11px] text-gray-400 tabular-nums">
                          {formatTime(child.elapsedSeconds)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* サブタスク追加 */}
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Add Subtask
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="サブタスク名"
                    value={childTitle}
                    onChange={(e) => setChildTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAddChild();
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
          </div>

          {/* ===== 右カラム: 属性情報 ===== */}
          <div className="w-72 shrink-0 overflow-y-auto px-5 py-4 space-y-0 bg-gray-50/30">

            {/* タイマー + 実績時間 */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Timer</SectionLabel>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => onToggleTimer(task.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    task.isRunning
                      ? "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100"
                      : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  {task.isRunning ? "Stop" : task.elapsedSeconds > 0 ? "Resume" : "Start"}
                </button>
                <span className={`font-mono text-sm font-bold tabular-nums ${task.isRunning ? "text-blue-600" : "text-gray-600"}`}>
                  {formatTime(task.elapsedSeconds)}
                </span>
              </div>
              {hasChildren && (
                <p className="text-[10px] text-gray-400 mb-2">Total {formatTime(totalElapsed)}</p>
              )}

              {/* 実績時間編集 */}
              <SectionLabel>実績時間</SectionLabel>
              {editingElapsed ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <input
                      ref={elapsedInputRef}
                      type="text"
                      value={elapsedInput}
                      onChange={(e) => setElapsedInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) saveElapsed();
                        if (e.key === "Escape") setEditingElapsed(false);
                      }}
                      placeholder="例: 1h 30m / 90m"
                      className="flex-1 w-full rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {ADJUST_BUTTONS.map((b) => (
                      <button
                        key={b.label}
                        onClick={() => adjustElapsed(b.delta)}
                        className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">作業日</label>
                    <input
                      type="date"
                      value={workDate}
                      onChange={(e) => setWorkDate(e.target.value)}
                      className="flex-1 rounded-md border border-emerald-200 bg-emerald-50/40 px-1.5 py-1 text-[10px] text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-200"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={saveElapsed} className="flex-1 rounded-lg bg-blue-600 py-1 text-[10px] font-semibold text-white hover:bg-blue-700">保存</button>
                    <button onClick={() => setEditingElapsed(false)} className="rounded-lg bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-200">取消</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={openElapsedEdit}
                    disabled={task.isRunning}
                    className={`w-full text-left rounded-lg border px-2.5 py-1.5 text-xs font-mono font-semibold transition-all ${
                      task.isRunning
                        ? "border-gray-100 bg-gray-50 text-gray-400 cursor-default"
                        : "border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer"
                    }`}
                  >
                    {task.elapsedSeconds > 0 ? secondsToDisplay(task.elapsedSeconds) : "—"}
                  </button>
                  {!task.isRunning && (
                    <div className="flex gap-1">
                      {ADJUST_BUTTONS.map((b) => (
                        <button
                          key={b.label}
                          onClick={() => adjustElapsed(b.delta)}
                          className="flex-1 rounded-md bg-gray-100 py-0.5 text-[9px] font-semibold text-gray-500 hover:bg-gray-200 transition-colors"
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ステータス */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Status</SectionLabel>
              <div className="flex flex-col gap-1">
                {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => onUpdate(task.id, { status: s })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-left transition-all ${
                      task.status === s
                        ? STATUS_COLORS[s] + " ring-1 ring-offset-0 ring-blue-300"
                        : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* 優先度 */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Priority</SectionLabel>
              <div className="flex flex-col gap-1">
                {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => onUpdate(task.id, { priority: p })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-left transition-all ${
                      task.priority === p
                        ? PRIORITY_COLORS[p] + " ring-1 ring-offset-0 ring-blue-300"
                        : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            {/* 予測時間 */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Estimate（予測時間）</SectionLabel>
              {editingEstimate ? (
                <div className="space-y-1.5">
                  <input
                    ref={estimateInputRef}
                    type="text"
                    value={estimateInput}
                    onChange={(e) => setEstimateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) saveEstimate();
                      if (e.key === "Escape") setEditingEstimate(false);
                    }}
                    placeholder="例: 1h 30m / 90m"
                    className="w-full rounded-lg border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <div className="flex gap-1">
                    {ADJUST_BUTTONS.map((b) => (
                      <button
                        key={b.label}
                        onClick={() => {
                          const base = parseElapsedInput(estimateInput) ?? task.estimatedMinutes * 60;
                          setEstimateInput(secondsToDisplay(Math.max(0, base + b.delta)));
                        }}
                        className="flex-1 rounded-md bg-gray-100 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={saveEstimate} className="flex-1 rounded-lg bg-blue-600 py-1 text-[10px] font-semibold text-white hover:bg-blue-700">保存</button>
                    <button onClick={() => setEditingEstimate(false)} className="rounded-lg bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500 hover:bg-gray-200">取消</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={openEstimateEdit}
                    className="w-full text-left rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-gray-700 hover:border-blue-300 hover:bg-blue-50/30 transition-all"
                  >
                    {task.estimatedMinutes > 0 ? secondsToDisplay(task.estimatedMinutes * 60) : "—"}
                  </button>
                  <div className="flex gap-1">
                    {ADJUST_BUTTONS.map((b) => (
                      <button
                        key={b.label}
                        onClick={() => adjustEstimate(b.delta)}
                        className="flex-1 rounded-md bg-gray-100 py-0.5 text-[10px] font-semibold text-gray-500 hover:bg-gray-200 transition-colors"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 期日 */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Due Date</SectionLabel>
              <input
                type="date"
                value={task.dueDate || ""}
                onChange={(e) => onUpdate(task.id, { dueDate: e.target.value || null })}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
            </div>

            {/* 着手予定日 */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Start Date</SectionLabel>
              <input
                type="date"
                value={task.startDate || ""}
                onChange={(e) => onUpdate(task.id, { startDate: e.target.value || null })}
                className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 transition-all"
              />
            </div>

            {/* プロジェクト */}
            <div className="pb-3 mb-3 border-b border-gray-100">
              <SectionLabel>Project</SectionLabel>
              <ProjectSelect
                value={task.project}
                availableProjects={availableProjects}
                onChange={(project) => onUpdate(task.id, { project })}
              />
            </div>

            {/* タグ */}
            <div className="pb-3">
              <SectionLabel>Tags</SectionLabel>
              <TagInput
                tags={task.tags}
                availableTags={availableTags}
                onChange={(tags) => onUpdate(task.id, { tags })}
              />
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 shrink-0 bg-gray-50/40">
          <button
            onClick={() => { onDelete(task.id); onClose(); }}
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
