import { useState, useRef, useEffect } from "react";
import { createTask, todayKey } from "../taskTree";
import type { Task } from "../types";
import { STATUS_LABELS } from "../types";

interface TaskCreateModalProps {
  availableProjects: string[];
  availableTags: string[];
  onAdd: (task: Task) => void;
  onClose: () => void;
}

const QUICK_MINUTES = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
];

export default function TaskCreateModal({
  availableProjects,
  availableTags,
  onAdd,
  onClose,
}: TaskCreateModalProps) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const [minutes, setMinutes] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState("");
  const [workDate, setWorkDate] = useState(todayKey()); // 作業日（実績を記録する日）
  const [project, setProject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showProjectSuggest, setShowProjectSuggest] = useState(false);
  const [showTagSuggest, setShowTagSuggest] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const task = createTask(trimmed, Number(minutes) || 0);
    task.status = status;
    task.priority = priority;
    task.project = project;
    task.tags = [...tags];
    task.dueDate = dueDate || null;
    // 実績時間を登録（作業日の dailyLog に記録）
    const elapsedSecs = (Number(elapsedMinutes) || 0) * 60;
    if (elapsedSecs > 0) {
      const logDate = workDate || todayKey();
      task.elapsedSeconds = elapsedSecs;
      task.dailyLog = { [logDate]: elapsedSecs };
    }
    if (status === "done") task.archivedAt = new Date().toISOString();
    onAdd(task);
    onClose();
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
    setShowTagSuggest(false);
  };

  const projectSuggestions = availableProjects.filter(
    (p) => p.toLowerCase().includes(project.toLowerCase()) && p !== project
  );

  const tagSuggestions = availableTags.filter(
    (t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
  );

  const statusColors: Record<Task["status"], string> = {
    todo: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-100 text-blue-700",
    done: "bg-green-100 text-green-700",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 backdrop-blur-[2px] pt-24 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-visible">
        {/* ヘッダーライン */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-t-2xl" />

        <div className="px-6 pt-5 pb-4 space-y-4">

          {/* タスク名 */}
          <input
            ref={titleRef}
            type="text"
            placeholder="タスク名を入力..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            }}
            className="w-full text-[17px] font-medium text-gray-800 placeholder:text-gray-300 bg-transparent border-0 outline-none focus:ring-0"
          />

          <div className="border-t border-gray-100" />

          {/* プロジェクト + 期限 */}
          <div className="grid grid-cols-2 gap-3">
            {/* プロジェクト */}
            <div className="relative">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                プロジェクト
              </label>
              <input
                type="text"
                placeholder="プロジェクトを選択..."
                value={project}
                onChange={(e) => { setProject(e.target.value); setShowProjectSuggest(true); }}
                onFocus={() => setShowProjectSuggest(true)}
                onBlur={() => setTimeout(() => setShowProjectSuggest(false), 150)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
              />
              {showProjectSuggest && projectSuggestions.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-36 overflow-y-auto">
                  {projectSuggestions.map((p) => (
                    <li
                      key={p}
                      onMouseDown={() => { setProject(p); setShowProjectSuggest(false); }}
                      className="px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 期限 */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                期限
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* 予測時間 / 実績時間 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 予測時間 */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                予測時間
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="分"
                  min={0}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm text-center text-gray-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                />
                <div className="flex gap-1 flex-wrap">
                  {QUICK_MINUTES.map((q) => (
                    <button
                      key={q.value}
                      type="button"
                      onClick={() => setMinutes(String(q.value))}
                      className={`rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
                        Number(minutes) === q.value
                          ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 実績時間 */}
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                実績時間 <span className="normal-case font-normal text-gray-300">（かかった時間）</span>
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="分"
                  min={0}
                  value={elapsedMinutes}
                  onChange={(e) => setElapsedMinutes(e.target.value)}
                  className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-sm text-center text-gray-700 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
                />
                <div className="flex gap-1 flex-wrap">
                  {QUICK_MINUTES.map((q) => (
                    <button
                      key={q.value}
                      type="button"
                      onClick={() => setElapsedMinutes(String(q.value))}
                      className={`rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
                        Number(elapsedMinutes) === q.value
                          ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 作業日（実績時間がある時のみ表示） */}
          {Number(elapsedMinutes) > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                作業日 <span className="normal-case font-normal text-gray-300">（実績を記録する日）</span>
              </label>
              <input
                type="date"
                value={workDate}
                onChange={(e) => setWorkDate(e.target.value)}
                className="w-48 rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-sm text-gray-700 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                タイムシートの該当日に実績が反映されます
              </p>
            </div>
          )}

          {/* タグ */}
          <div className="relative">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              タグ
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:bg-white transition-all min-h-[40px]">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="text-indigo-400 hover:text-indigo-600 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={tags.length === 0 ? "タグを追加..." : ""}
                value={tagInput}
                onChange={(e) => { setTagInput(e.target.value); setShowTagSuggest(true); }}
                onFocus={() => setShowTagSuggest(true)}
                onBlur={() => setTimeout(() => setShowTagSuggest(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (tagInput.trim()) addTag(tagInput);
                  }
                  if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
                    setTags(tags.slice(0, -1));
                  }
                }}
                className="flex-1 min-w-[80px] bg-transparent text-sm text-gray-700 placeholder:text-gray-300 border-0 outline-none focus:ring-0"
              />
            </div>
            {showTagSuggest && tagSuggestions.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-36 overflow-y-auto">
                {tagSuggestions.map((t) => (
                  <li
                    key={t}
                    onMouseDown={() => addTag(t)}
                    className="px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center gap-2 px-6 py-3 border-t border-gray-100 bg-gray-50/60 rounded-b-2xl">
          {/* ステータス */}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Task["status"])}
            className={`appearance-none rounded-lg px-2.5 py-1.5 text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-200 ${statusColors[status]}`}
          >
            {(Object.entries(STATUS_LABELS) as [Task["status"], string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* 優先度 */}
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task["priority"])}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-200 cursor-pointer"
          >
            <option value="low">低 優先度</option>
            <option value="medium">中 優先度</option>
            <option value="high">高 優先度</option>
          </select>

          {/* アクションボタン */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim()}
              className="rounded-lg bg-indigo-600 px-5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Create Task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
