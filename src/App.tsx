import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Task, TaskStatus } from "./types";
import { STATUS_LABELS } from "./types";
import StatusGroup from "./components/StatusGroup";
import {
  updateTaskInTree,
  deleteTaskInTree,
  addChildToTree,
  hasRunningInTree,
  tickTree,
  getTotalElapsed,
  getTotalEstimated,
  findTaskInTree,
  findParentId,
  createTask,
  todayKey,
  migrateTasks,
  renameProjectInTree,
  removeProjectFromTree,
  renameTagInTree,
  removeTagFromTree,
} from "./taskTree";

import KanbanBoard from "./components/KanbanBoard";
import TaskEditModal from "./components/TaskEditModal";
import TaskCreateCard from "./components/TaskCreateCard";
import SettingsModal from "./components/SettingsModal";
import TimesheetDashboard from "./components/TimesheetDashboard";

type ViewMode = "list" | "kanban" | "dashboard";
type SortKey =
  | "created"
  | "dueDate_asc"
  | "dueDate_desc"
  | "startDate_asc"
  | "startDate_desc"
  | "estimate";
type DateRange = "" | "today" | "this_week" | "overdue";

const DEFAULT_TAGS = ["会議", "資料作成", "レビュー", "調査", "開発", "連絡"];
const DEFAULT_PROJECTS = ["プロジェクトA", "プロジェクトB"];

const STORAGE_KEY_TASKS = "task-timer-tasks";
const STORAGE_KEY_TAGS = "task-timer-tags";
const STORAGE_KEY_PROJECTS = "task-timer-projects";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過時は無視（5MB 制限）
  }
}

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** ツリー内で最初に見つかった実行中タスクを返す */
function findRunningTask(tasks: Task[]): Task | null {
  for (const t of tasks) {
    if (t.isRunning) return t;
    const found = findRunningTask(t.children);
    if (found) return found;
  }
  return null;
}

/** 週の開始日（月曜日）を取得 */
function getWeekStartDate(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(mon.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

/** 週の終了日（日曜日）を取得 */
function getWeekEndDate(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sun = new Date(now);
  sun.setDate(sun.getDate() + diff);
  return sun.toISOString().slice(0, 10);
}

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const raw = loadFromStorage<unknown[]>(STORAGE_KEY_TASKS, []);
    return migrateTasks(raw);
  });
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>(() =>
    loadFromStorage<string[]>(STORAGE_KEY_TAGS, DEFAULT_TAGS)
  );
  const [availableProjects, setAvailableProjects] = useState<string[]>(() =>
    loadFromStorage<string[]>(STORAGE_KEY_PROJECTS, DEFAULT_PROJECTS)
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterProject, setFilterProject] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterDateRange, setFilterDateRange] = useState<DateRange>("");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- localStorage への自動保存 ---
  useEffect(() => {
    saveToStorage(STORAGE_KEY_TASKS, tasks);
  }, [tasks]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_TAGS, availableTags);
  }, [availableTags]);

  useEffect(() => {
    saveToStorage(STORAGE_KEY_PROJECTS, availableProjects);
  }, [availableProjects]);

  // --- タイマー tick ---
  const tick = useCallback(() => {
    setTasks((prev) => tickTree(prev));
  }, []);

  useEffect(() => {
    const running = hasRunningInTree(tasks);
    if (running && !intervalRef.current) {
      intervalRef.current = setInterval(tick, 1000);
    } else if (!running && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tasks, tick]);

  // --- 計測中タスクの検出 ---
  const runningTask = useMemo(() => findRunningTask(tasks), [tasks]);

  // --- アクション ---
  const addTask = (task: Task) => {
    setTasks((prev) => [...prev, task]);
  };

  const deleteTask = (id: number) => {
    if (editingTaskId === id) {
      const parentId = findParentId(tasks, id);
      setEditingTaskId(parentId);
    }
    setTasks((prev) => deleteTaskInTree(prev, id));
  };

  const toggleTimer = (id: number) => {
    const today = todayKey();
    setTasks((prev) =>
      updateTaskInTree(prev, id, (t) => {
        if (t.isRunning) {
          const now = Math.floor(Date.now() / 1000);
          const added = t.startedAt ? now - t.startedAt : 0;
          const log = t.dailyLog ?? {};
          return {
            ...t,
            isRunning: false,
            startedAt: null,
            elapsedSeconds: t.elapsedSeconds + added,
            dailyLog: { ...log, [today]: (log[today] || 0) + added },
          };
        }
        return {
          ...t,
          isRunning: true,
          startedAt: Math.floor(Date.now() / 1000),
          status: t.status === "todo" ? "in_progress" : t.status,
        };
      })
    );
  };

  const updateTask = (id: number, patch: Partial<Task>) => {
    setTasks((prev) =>
      updateTaskInTree(prev, id, (t) => ({ ...t, ...patch }))
    );
  };

  const updateStatus = (id: number, status: TaskStatus) => {
    if (status === "done") {
      // 完了時にarchivedAtに完了日時を記録（7日後に自動アーカイブ）
      updateTask(id, { status, archivedAt: new Date().toISOString() });
    } else {
      // 完了以外に戻す場合はアーカイブ解除
      updateTask(id, { status, archivedAt: null });
    }
  };

  // サブタスク追加（親の属性を継承）
  const addChild = (
    parentId: number,
    childTitle: string,
    estimatedMinutes: number
  ) => {
    const parent = findTaskInTree(tasks, parentId);
    const child = createTask(childTitle, estimatedMinutes);
    if (parent) {
      child.project = parent.project;
      child.tags = [...parent.tags];
    }
    setTasks((prev) => addChildToTree(prev, parentId, child));
  };

  // --- マスタ管理ハンドラ ---
  const renameProject = (oldName: string, newName: string) => {
    setTasks((prev) => renameProjectInTree(prev, oldName, newName));
  };

  const deleteProject = (name: string) => {
    setTasks((prev) => removeProjectFromTree(prev, name));
  };

  const renameTag = (oldName: string, newName: string) => {
    setTasks((prev) => renameTagInTree(prev, oldName, newName));
  };

  const deleteTag = (name: string) => {
    setTasks((prev) => removeTagFromTree(prev, name));
  };

  // --- データインポート ---
  const importData = (data: { tasks: Task[]; tags: string[]; projects: string[] }) => {
    setTasks(data.tasks);
    setAvailableTags(data.tags);
    setAvailableProjects(data.projects);
  };

  // --- モーダル用タスク取得 ---
  const editingTask = editingTaskId
    ? findTaskInTree(tasks, editingTaskId)
    : null;

  // --- フィルター・ソート ---
  const filteredTasks = useMemo(() => {
    const todayStr = todayKey();
    const weekStart = getWeekStartDate();
    const weekEnd = getWeekEndDate();

    let result = tasks;

    // アーカイブフィルター（完了から7日以上経過したタスクを非表示）
    if (!showArchived) {
      const now = Date.now();
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const isArchived = (t: Task): boolean =>
        !!t.archivedAt && now - new Date(t.archivedAt).getTime() >= SEVEN_DAYS;
      const filterArchived = (list: Task[]): Task[] =>
        list
          .filter((t) => !isArchived(t))
          .map((t) => ({ ...t, children: filterArchived(t.children) }));
      result = filterArchived(result);
    }

    // キーワード検索
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTask = (t: Task): boolean =>
        t.title.toLowerCase().includes(q) ||
        t.project.toLowerCase().includes(q) ||
        t.children.some(matchTask);
      result = result.filter(matchTask);
    }

    // ステータスフィルター
    if (filterStatus) {
      const matchStatus = (t: Task): boolean =>
        t.status === filterStatus || t.children.some(matchStatus);
      result = result.filter(matchStatus);
    }

    // プロジェクトフィルター
    if (filterProject) {
      const matchProject = (t: Task): boolean =>
        t.project === filterProject || t.children.some(matchProject);
      result = result.filter(matchProject);
    }

    // タグフィルター
    if (filterTag) {
      const matchTag = (t: Task): boolean =>
        t.tags.includes(filterTag) || t.children.some(matchTag);
      result = result.filter(matchTag);
    }

    // 期間フィルター
    if (filterDateRange === "today") {
      const matchDate = (t: Task): boolean =>
        t.dueDate === todayStr ||
        t.startDate === todayStr ||
        t.children.some(matchDate);
      result = result.filter(matchDate);
    } else if (filterDateRange === "this_week") {
      const matchDate = (t: Task): boolean =>
        (t.dueDate !== null && t.dueDate >= weekStart && t.dueDate <= weekEnd) ||
        (t.startDate !== null && t.startDate >= weekStart && t.startDate <= weekEnd) ||
        t.children.some(matchDate);
      result = result.filter(matchDate);
    } else if (filterDateRange === "overdue") {
      const matchDate = (t: Task): boolean =>
        (t.dueDate !== null && t.dueDate < todayStr && t.status !== "done") ||
        t.children.some(matchDate);
      result = result.filter(matchDate);
    }

    // ソート
    const dateSorter = (
      key: "dueDate" | "startDate",
      asc: boolean
    ) => (a: Task, b: Task) => {
      const aVal = a[key];
      const bVal = b[key];
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      const cmp = aVal.localeCompare(bVal);
      return asc ? cmp : -cmp;
    };

    if (sortKey === "dueDate_asc") {
      result = [...result].sort(dateSorter("dueDate", true));
    } else if (sortKey === "dueDate_desc") {
      result = [...result].sort(dateSorter("dueDate", false));
    } else if (sortKey === "startDate_asc") {
      result = [...result].sort(dateSorter("startDate", true));
    } else if (sortKey === "startDate_desc") {
      result = [...result].sort(dateSorter("startDate", false));
    } else if (sortKey === "estimate") {
      result = [...result].sort(
        (a, b) => getTotalEstimated(b) - getTotalEstimated(a)
      );
    }

    return result;
  }, [tasks, showArchived, searchQuery, filterStatus, filterProject, filterTag, filterDateRange, sortKey]);

  // 使われているプロジェクト/タグ一覧
  const usedProjects = useMemo(() => {
    const set = new Set<string>();
    const collect = (list: Task[]) => {
      for (const t of list) {
        if (t.project) set.add(t.project);
        collect(t.children);
      }
    };
    collect(tasks);
    return Array.from(set).sort();
  }, [tasks]);

  const usedTags = useMemo(() => {
    const set = new Set<string>();
    const collect = (list: Task[]) => {
      for (const t of list) {
        for (const tag of t.tags) set.add(tag);
        collect(t.children);
      }
    };
    collect(tasks);
    return Array.from(set).sort();
  }, [tasks]);

  const hasActiveFilters = !!(searchQuery || filterStatus || filterProject || filterTag || filterDateRange || sortKey !== "created");

  // --- 集計 ---
  const totalEstimated = tasks.reduce(
    (sum, t) => sum + getTotalEstimated(t),
    0
  );
  const totalElapsed = tasks.reduce((sum, t) => sum + getTotalElapsed(t), 0);

  const maxWidth =
    viewMode === "kanban"
      ? "max-w-5xl"
      : viewMode === "dashboard"
        ? "max-w-6xl"
        : "max-w-7xl";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {/* トップバー */}
      <header className="sticky top-0 z-30 border-b border-gray-200/60 bg-white/80 backdrop-blur-md">
        <div
          className={`mx-auto flex items-center justify-between px-6 py-3 transition-all ${maxWidth}`}
        >
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            Task Timer
          </h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700 transition-all"
            >
              Settings
            </button>
            <div className="flex rounded-xl bg-gray-100 p-0.5">
              {(
                [
                  { key: "list", label: "List" },
                  { key: "kanban", label: "Board" },
                  { key: "dashboard", label: "Timesheet" },
                ] as { key: ViewMode; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  className={`rounded-[10px] px-4 py-1.5 text-xs font-semibold transition-all ${
                    viewMode === tab.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 計測中タスクバー */}
        {runningTask && (
          <div className="border-t border-blue-100 bg-blue-50/80">
            <div className={`mx-auto flex items-center gap-3 px-6 py-2 ${maxWidth}`}>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
              </span>
              <span className="text-sm font-semibold text-blue-800">
                計測中：{runningTask.title}
              </span>
              <span className="font-mono text-sm font-bold text-blue-600 tabular-nums">
                {formatTime(runningTask.elapsedSeconds)}
              </span>
              <button
                onClick={() => toggleTimer(runningTask.id)}
                className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-100 transition-all"
              >
                Stop
              </button>
            </div>
          </div>
        )}
      </header>

      <main className={`mx-auto px-6 py-6 transition-all ${maxWidth}`}>
        {/* 新規タスク作成カード（ダッシュボード時は非表示） */}
        {viewMode !== "dashboard" && (
          <TaskCreateCard
            availableProjects={availableProjects}
            availableTags={availableTags}
            onAdd={addTask}
          />
        )}

        {/* フィルター・ソート・検索バー（リスト表示時のみ） */}
        {viewMode === "list" && tasks.length > 0 && (
          <div className="mb-5 space-y-2.5">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="タスク名・プロジェクト名で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-2 text-xs text-gray-800 shadow-sm placeholder:text-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
              >
                <option value="created">作成順</option>
                <option value="dueDate_asc">期限が近い順</option>
                <option value="dueDate_desc">期限が遠い順</option>
                <option value="startDate_asc">開始日が近い順</option>
                <option value="startDate_desc">開始日が遠い順</option>
                <option value="estimate">予測時間が長い順</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "")}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">すべてのステータス</option>
                {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(
                  ([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  )
                )}
              </select>

              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">すべてのプロジェクト</option>
                {usedProjects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">すべてのタグ</option>
                {usedTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>

              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value as DateRange)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="">すべての期間</option>
                <option value="today">今日</option>
                <option value="this_week">今週</option>
                <option value="overdue">期限超過</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterStatus("");
                    setFilterProject("");
                    setFilterTag("");
                    setFilterDateRange("");
                    setSortKey("created");
                  }}
                  className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-200 transition-all"
                >
                  リセット
                </button>
              )}

              {/* アーカイブ表示トグル */}
              <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-blue-500 transition-colors" />
                  <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-[11px] font-medium text-gray-500">
                  アーカイブを表示
                </span>
              </label>
            </div>
          </div>
        )}

        {/* メインコンテンツ */}
        {viewMode === "dashboard" ? (
          <TimesheetDashboard tasks={tasks} formatTime={formatTime} />
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white/50 py-16">
            <div className="text-4xl mb-3 opacity-30">+</div>
            <p className="text-sm text-gray-400">
              タスクがまだありません。上のフォームから追加してみましょう
            </p>
          </div>
        ) : (
          <>
            {viewMode === "list" ? (
              filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white/50 py-12 mb-6">
                  <p className="text-sm text-gray-400">
                    条件に一致するタスクがありません
                  </p>
                </div>
              ) : (
                <div className="mb-6 space-y-3">
                  {(["in_progress", "todo", "done"] as TaskStatus[]).map((status) => (
                    <StatusGroup
                      key={status}
                      status={status}
                      tasks={filteredTasks.filter((t) => t.status === status)}
                      onDelete={deleteTask}
                      onToggleTimer={toggleTimer}
                      onUpdate={updateTask}
                      onClick={(t) => setEditingTaskId(t.id)}
                      formatTime={formatTime}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="mb-6">
                <KanbanBoard
                  tasks={tasks}
                  onUpdateStatus={updateStatus}
                  onToggleTimer={toggleTimer}
                  onCardClick={(task) => setEditingTaskId(task.id)}
                  formatTime={formatTime}
                />
              </div>
            )}

            {/* 合計サマリー */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3.5 shadow-sm">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                予測{" "}
                <span className="font-semibold text-gray-800">
                  {totalEstimated} 分
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                実績{" "}
                <span className="font-mono font-semibold text-gray-800">
                  {formatTime(totalElapsed)}
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* 編集モーダル */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          availableTags={availableTags}
          availableProjects={availableProjects}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onToggleTimer={toggleTimer}
          onAddChild={addChild}
          onEditTask={(id) => setEditingTaskId(id)}
          onClose={() => setEditingTaskId(null)}
          formatTime={formatTime}
        />
      )}

      {/* 設定モーダル */}
      {showSettings && (
        <SettingsModal
          availableTags={availableTags}
          availableProjects={availableProjects}
          tasks={tasks}
          onUpdateTags={setAvailableTags}
          onUpdateProjects={setAvailableProjects}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onRenameTag={renameTag}
          onDeleteTag={deleteTag}
          onImportData={importData}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default App;
