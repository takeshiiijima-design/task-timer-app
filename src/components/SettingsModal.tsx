import { useState, useEffect, useRef } from "react";
import type { Task } from "../types";
import EditableList from "./EditableList";

type Tab = "tags" | "projects" | "backup";

interface SettingsModalProps {
  availableTags: string[];
  availableProjects: string[];
  tasks: Task[];
  onUpdateTags: (tags: string[]) => void;
  onUpdateProjects: (projects: string[]) => void;
  onRenameProject: (oldName: string, newName: string) => void;
  onDeleteProject: (name: string) => void;
  onRenameTag: (oldName: string, newName: string) => void;
  onDeleteTag: (name: string) => void;
  onImportData: (data: { tasks: Task[]; tags: string[]; projects: string[] }) => void;
  onClose: () => void;
}

function todayFileDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export default function SettingsModal({
  availableTags,
  availableProjects,
  tasks,
  onUpdateTags,
  onUpdateProjects,
  onRenameProject,
  onDeleteProject,
  onRenameTag,
  onDeleteTag,
  onImportData,
  onClose,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("tags");
  const backdropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  // --- エクスポート ---
  const handleExport = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
      tags: availableTags,
      projects: availableProjects,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `task-timer-backup-${todayFileDate()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- インポート ---
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        if (!raw.tasks || !Array.isArray(raw.tasks)) {
          alert("無効なバックアップファイルです。");
          return;
        }
        const ok = window.confirm(
          "現在のデータをすべて上書きします。本当に復元しますか？\n\n※この操作は取り消せません。"
        );
        if (!ok) return;
        onImportData({
          tasks: raw.tasks,
          tags: raw.tags || availableTags,
          projects: raw.projects || availableProjects,
        });
        alert("データを復元しました。");
      } catch {
        alert("ファイルの読み込みに失敗しました。有効なJSONファイルを選択してください。");
      }
    };
    reader.readAsText(file);
    // リセットして同じファイルを再選択可能に
    e.target.value = "";
  };

  // --- マスタ管理用のハンドラ ---
  const handleProjectRename = (oldName: string, newName: string) => {
    onRenameProject(oldName, newName);
  };

  const handleProjectDelete = (name: string) => {
    const ok = window.confirm(
      `プロジェクト「${name}」を削除しますか？\n\nこのプロジェクトが割り当てられているタスクからも削除されます。`
    );
    if (ok) onDeleteProject(name);
  };

  const handleTagRename = (oldName: string, newName: string) => {
    onRenameTag(oldName, newName);
  };

  const handleTagDelete = (name: string) => {
    const ok = window.confirm(
      `タグ「${name}」を削除しますか？\n\nこのタグが割り当てられているタスクからも削除されます。`
    );
    if (ok) onDeleteTag(name);
  };

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
            Settings
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

        {/* タブ */}
        <div className="flex border-b border-gray-100 px-6">
          {([
            { key: "tags" as Tab, label: "Tags" },
            { key: "projects" as Tab, label: "Projects" },
            { key: "backup" as Tab, label: "Backup" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-3 mr-6 text-xs font-semibold transition-all border-b-2 ${
                tab === t.key
                  ? "text-blue-600 border-blue-500"
                  : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          {tab === "tags" ? (
            <EditableList
              items={availableTags}
              onUpdate={onUpdateTags}
              onRenameItem={handleTagRename}
              onDeleteItem={handleTagDelete}
              placeholder="新しいタグ名"
              emptyMessage="タグがまだありません。上のフォームから追加してください。"
              accentColor="indigo"
            />
          ) : tab === "projects" ? (
            <EditableList
              items={availableProjects}
              onUpdate={onUpdateProjects}
              onRenameItem={handleProjectRename}
              onDeleteItem={handleProjectDelete}
              placeholder="新しいプロジェクト名"
              emptyMessage="プロジェクトがまだありません。上のフォームから追加してください。"
              accentColor="blue"
            />
          ) : (
            <div className="space-y-6">
              {/* エクスポート */}
              <div>
                <h3 className="text-xs font-bold text-gray-700 mb-2">
                  データをバックアップ
                </h3>
                <p className="text-[11px] text-gray-400 mb-3">
                  全タスク・プロジェクト・タグのデータをJSONファイルとしてPCにダウンロードします。
                </p>
                <button
                  onClick={handleExport}
                  className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  JSONファイルをダウンロード
                </button>
              </div>

              <div className="border-t border-gray-100" />

              {/* インポート */}
              <div>
                <h3 className="text-xs font-bold text-gray-700 mb-2">
                  データを復元
                </h3>
                <p className="text-[11px] text-gray-400 mb-3">
                  バックアップファイルからデータを復元します。現在のデータはすべて上書きされます。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 hover:border-amber-400 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  JSONファイルから復元
                </button>
              </div>

              {/* データ概要 */}
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  現在のデータ
                </h4>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-lg font-bold text-gray-800">
                      {countAllTasks(tasks)}
                    </div>
                    <div className="text-[10px] text-gray-400">タスク</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-800">
                      {availableProjects.length}
                    </div>
                    <div className="text-[10px] text-gray-400">プロジェクト</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-800">
                      {availableTags.length}
                    </div>
                    <div className="text-[10px] text-gray-400">タグ</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-end border-t border-gray-100 px-6 py-4">
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

function countAllTasks(tasks: Task[]): number {
  return tasks.reduce(
    (sum, t) => sum + 1 + countAllTasks(t.children),
    0
  );
}
