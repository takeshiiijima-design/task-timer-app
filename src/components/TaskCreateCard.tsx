import { useState, useRef, useEffect } from "react";
import { createTask } from "../taskTree";
import type { Task } from "../types";

interface TaskCreateCardProps {
  availableProjects: string[];
  availableTags: string[];
  onAdd: (task: Task) => void;
}

const QUICK_MINUTES = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
];

export default function TaskCreateCard({
  availableProjects,
  availableTags,
  onAdd,
}: TaskCreateCardProps) {
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showProjectSuggest, setShowProjectSuggest] = useState(false);
  const [showTagSuggest, setShowTagSuggest] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  // 初回マウント時にフォーカス
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const resetForm = () => {
    setTitle("");
    setMinutes("");
    setProject("");
    setTags([]);
    setTagInput("");
    setDueDate("");
  };

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const task = createTask(trimmed, Number(minutes) || 0);
    task.project = project;
    task.tags = [...tags];
    task.dueDate = dueDate || null;
    onAdd(task);
    resetForm();
    // フォーカスをタスク名に戻す
    titleRef.current?.focus();
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // --- プロジェクトサジェスト ---
  const projectSuggestions = availableProjects.filter(
    (p) =>
      p.toLowerCase().includes(project.toLowerCase()) && p !== project
  );

  const selectProject = (p: string) => {
    setProject(p);
    setShowProjectSuggest(false);
  };

  // --- タグサジェスト ---
  const tagSuggestions = availableTags.filter(
    (t) =>
      t.toLowerCase().includes(tagInput.toLowerCase()) &&
      !tags.includes(t)
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags([...tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
      } else {
        handleSubmit();
      }
    }
    if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-gray-200/80 bg-white shadow-sm shadow-gray-100 overflow-hidden">
      {/* ヘッダーライン */}
      <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

      <div className="px-5 pt-4 pb-5 space-y-3.5">
        {/* 1行目: タスク名 */}
        <input
          ref={titleRef}
          type="text"
          placeholder="新しいタスク名を入力..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          className="w-full text-sm font-medium text-gray-900 placeholder:text-gray-400 bg-transparent border-0 outline-none focus:ring-0 px-0"
        />

        {/* 2行目: 予測時間 */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            予測時間
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="分"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="w-20 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-center text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <div className="flex gap-1">
              {QUICK_MINUTES.map((q) => (
                <button
                  key={q.value}
                  onClick={() => setMinutes(String(q.value))}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                    Number(minutes) === q.value
                      ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3行目: プロジェクト + 期限 */}
        <div className="flex gap-3">
          {/* プロジェクト */}
          <div className="flex-1 space-y-1.5 relative">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              プロジェクト
            </label>
            <input
              ref={projectRef}
              type="text"
              placeholder="プロジェクトを選択..."
              value={project}
              onChange={(e) => {
                setProject(e.target.value);
                setShowProjectSuggest(true);
              }}
              onFocus={() => setShowProjectSuggest(true)}
              onBlur={() => setTimeout(() => setShowProjectSuggest(false), 150)}
              onKeyDown={handleTitleKeyDown}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
            {showProjectSuggest && projectSuggestions.length > 0 && (
              <ul className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-32 overflow-y-auto">
                {projectSuggestions.map((p) => (
                  <li
                    key={p}
                    onMouseDown={() => selectProject(p)}
                    className="px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 期限 */}
          <div className="w-40 space-y-1.5">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              期限
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
        </div>

        {/* 4行目: タグ */}
        <div className="space-y-1.5 relative">
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            タグ
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
              >
                {tag}
                <button
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-600"
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              ref={tagInputRef}
              type="text"
              placeholder={tags.length === 0 ? "タグを追加..." : ""}
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setShowTagSuggest(true);
              }}
              onFocus={() => setShowTagSuggest(true)}
              onBlur={() => setTimeout(() => setShowTagSuggest(false), 150)}
              onKeyDown={handleTagKeyDown}
              className="flex-1 min-w-[80px] bg-transparent text-xs text-gray-700 border-0 outline-none focus:ring-0 px-0 py-0"
            />
          </div>
          {showTagSuggest && tagSuggestions.length > 0 && (
            <ul className="absolute z-20 top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-32 overflow-y-auto">
              {tagSuggestions.map((t) => (
                <li
                  key={t}
                  onMouseDown={() => addTag(t)}
                  className="px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer transition-colors"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* アクションバー */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-gray-400">
            Enter で追加 / 続けて入力できます
          </p>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 hover:shadow-md active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            タスクを追加
          </button>
        </div>
      </div>
    </div>
  );
}
