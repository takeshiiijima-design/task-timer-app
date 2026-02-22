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
import TaskCreateModal from "./components/TaskCreateModal";
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
type DateRange = "" | "today" | "this_week" | "overdue" | "custom_date" | "custom_range";

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "">("");
  const [filterProject, setFilterProject] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterDateRange, setFilterDateRange] = useState<DateRange>("");
  const [filterCustomDate, setFilterCustomDate] = useState(todayKey());
  const [filterCustomFrom, setFilterCustomFrom] = useState(todayKey());
  const [filterCustomTo, setFilterCustomTo] = useState(todayKey());
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
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
    } else if (filterDateRange === "custom_date" && filterCustomDate) {
      const matchDate = (t: Task): boolean =>
        t.dueDate === filterCustomDate ||
        t.startDate === filterCustomDate ||
        t.children.some(matchDate);
      result = result.filter(matchDate);
    } else if (filterDateRange === "custom_range" && filterCustomFrom && filterCustomTo) {
      const from = filterCustomFrom <= filterCustomTo ? filterCustomFrom : filterCustomTo;
      const to = filterCustomFrom <= filterCustomTo ? filterCustomTo : filterCustomFrom;
      const matchDate = (t: Task): boolean =>
        (t.dueDate !== null && t.dueDate >= from && t.dueDate <= to) ||
        (t.startDate !== null && t.startDate >= from && t.startDate <= to) ||
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
  }, [tasks, showArchived, searchQuery, filterStatus, filterProject, filterTag, filterDateRange, filterCustomDate, filterCustomFrom, filterCustomTo, sortKey]);

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

  // サイドバーナビゲーション設定
  const navItems = [
    {
      key: "list" as ViewMode,
      label: "リスト",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
    },
    {
      key: "kanban" as ViewMode,
      label: "ボード",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      key: "dashboard" as ViewMode,
      label: "タイムシート",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ===== 左サイドバー ===== */}
      <aside className="hidden md:flex md:flex-col w-52 shrink-0 bg-white border-r border-gray-200 h-full">
        {/* ロゴ */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-[15px] font-bold text-gray-900 tracking-tight">Task Timer</h1>
          <p className="text-[10px] text-gray-400 mt-0.5">タスク管理 & 時間計測</p>
        </div>

        {/* + New Task ボタン */}
        <div className="px-3 py-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm shadow-indigo-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            ビュー
          </p>
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setViewMode(item.key)}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                viewMode === item.key
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <span className={viewMode === item.key ? "text-indigo-600" : "text-gray-400"}>
                {item.icon}
              </span>
              {item.label}
              {item.key === "list" && tasks.length > 0 && (
                <span className="ml-auto text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                  {tasks.length}
                </span>
              )}
            </button>
          ))}

          {/* 計測中インジケーター */}
          {runningTask && (
            <div className="mt-3 mx-1 rounded-lg bg-blue-50 border border-blue-100 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                </span>
                <span className="text-[10px] font-semibold text-blue-700">計測中</span>
              </div>
              <p className="text-[11px] text-blue-800 font-medium truncate">{runningTask.title}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="font-mono text-[12px] font-bold text-blue-600 tabular-nums">
                  {formatTime(runningTask.elapsedSeconds)}
                </span>
                <button
                  onClick={() => toggleTimer(runningTask.id)}
                  className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-200 transition-colors"
                >
                  Stop
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* 下部：Settings */}
        <div className="px-2 py-3 border-t border-gray-100">
          <button
            onClick={() => setShowSettings(true)}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </div>
      </aside>

      {/* ===== メインコンテンツ ===== */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* トップバー */}
        <header className="shrink-0 flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 bg-white border-b border-gray-200">
          {/* Mobile: タイトル */}
          <span className="md:hidden text-sm font-bold text-gray-900">Task Timer</span>

          {/* 検索（デスクトップ・リスト時のみ） */}
          {viewMode === "list" && (
            <div className="hidden md:block relative flex-1 max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="タスク名・プロジェクト名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
              />
            </div>
          )}

          {/* フィルター群（デスクトップ・リスト時のみ） */}
          {viewMode === "list" && (
            <div className="hidden md:flex items-center gap-1.5 flex-wrap">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "")}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
              >
                <option value="">ステータス</option>
                {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>

              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
              >
                <option value="">プロジェクト</option>
                {usedProjects.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
              >
                <option value="">タグ</option>
                {usedTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>

              <select
                value={filterDateRange}
                onChange={(e) => setFilterDateRange(e.target.value as DateRange)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
              >
                <option value="">期間</option>
                <option value="today">今日</option>
                <option value="this_week">今週</option>
                <option value="overdue">期限超過</option>
                <option value="custom_date">日付を指定</option>
                <option value="custom_range">期間を指定</option>
              </select>

              {/* カスタム日付 */}
              {filterDateRange === "custom_date" && (
                <input
                  type="date"
                  value={filterCustomDate}
                  onChange={(e) => setFilterCustomDate(e.target.value)}
                  className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-1.5 text-[11px] text-gray-700 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
                />
              )}

              {/* カスタム期間 */}
              {filterDateRange === "custom_range" && (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={filterCustomFrom}
                    onChange={(e) => setFilterCustomFrom(e.target.value)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-1.5 text-[11px] text-gray-700 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
                  />
                  <span className="text-[11px] text-gray-400">〜</span>
                  <input
                    type="date"
                    value={filterCustomTo}
                    onChange={(e) => setFilterCustomTo(e.target.value)}
                    className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-2.5 py-1.5 text-[11px] text-gray-700 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
                  />
                </div>
              )}

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-200 transition-all"
              >
                <option value="created">作成順</option>
                <option value="dueDate_asc">期限↑</option>
                <option value="dueDate_desc">期限↓</option>
                <option value="estimate">予測時間↓</option>
              </select>

              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setFilterStatus("");
                    setFilterProject("");
                    setFilterTag("");
                    setFilterDateRange("");
                    setFilterCustomDate(todayKey());
                    setFilterCustomFrom(todayKey());
                    setFilterCustomTo(todayKey());
                    setSortKey("created");
                  }}
                  className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:bg-gray-200 transition-all"
                >
                  リセット
                </button>
              )}
            </div>
          )}

          {/* Mobile: フィルターボタン */}
          {viewMode === "list" && (
            <button
              onClick={() => setShowMobileFilters((v) => !v)}
              className={`md:hidden flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                showMobileFilters || hasActiveFilters
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              フィルター
              {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />}
            </button>
          )}

          {/* スペーサー（モバイル） */}
          <div className="flex-1 md:hidden" />

          {/* Mobile: New Task ボタン */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="md:hidden flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>

          {/* アーカイブトグル（デスクトップ・リスト時） */}
          {viewMode === "list" && (
            <label className="hidden md:flex ml-auto items-center gap-1.5 cursor-pointer select-none shrink-0">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="h-4 w-7 rounded-full bg-gray-200 peer-checked:bg-indigo-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3" />
              </div>
              <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">アーカイブ</span>
            </label>
          )}
        </header>

        {/* モバイルフィルターパネル */}
        {viewMode === "list" && showMobileFilters && (
          <div className="md:hidden shrink-0 bg-white border-b border-gray-100 px-4 py-3 space-y-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="タスク名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TaskStatus | "")} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none">
                <option value="">ステータス</option>
                {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none">
                <option value="">プロジェクト</option>
                {usedProjects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none">
                <option value="">タグ</option>
                {usedTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
              <select value={filterDateRange} onChange={(e) => setFilterDateRange(e.target.value as DateRange)} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none">
                <option value="">期間</option>
                <option value="today">今日</option>
                <option value="this_week">今週</option>
                <option value="overdue">期限超過</option>
              </select>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 focus:outline-none">
                <option value="created">作成順</option>
                <option value="dueDate_asc">期限↑</option>
                <option value="dueDate_desc">期限↓</option>
              </select>
              {hasActiveFilters && (
                <button
                  onClick={() => { setSearchQuery(""); setFilterStatus(""); setFilterProject(""); setFilterTag(""); setFilterDateRange(""); setSortKey("created"); }}
                  className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500"
                >リセット</button>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div className="relative">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="sr-only peer" />
                <div className="h-4 w-7 rounded-full bg-gray-200 peer-checked:bg-indigo-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-3" />
              </div>
              <span className="text-[11px] font-medium text-gray-500">アーカイブ表示</span>
            </label>
          </div>
        )}

        {/* モバイル: 計測中タスクバナー */}
        {runningTask && (
          <div className="md:hidden shrink-0 flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            <p className="flex-1 text-xs font-medium text-blue-800 truncate">{runningTask.title}</p>
            <span className="font-mono text-xs font-bold text-blue-600 tabular-nums shrink-0">{formatTime(runningTask.elapsedSeconds)}</span>
            <button onClick={() => toggleTimer(runningTask.id)} className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-200">Stop</button>
          </div>
        )}

        {/* スクロール可能なコンテンツ */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {viewMode === "dashboard" ? (
            <TimesheetDashboard
            tasks={tasks}
            formatTime={formatTime}
            onUpdateTask={updateTask}
            onEditTask={(id) => setEditingTaskId(id)}
          />
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 mt-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex flex-col items-center gap-3 text-gray-400 hover:text-indigo-500 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 hover:bg-indigo-50 text-2xl transition-colors">
                  +
                </div>
                <p className="text-sm font-medium">タスクを追加して始めましょう</p>
              </button>
            </div>
          ) : (
            <>
              {viewMode === "list" ? (
                filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-12">
                    <p className="text-sm text-gray-400">条件に一致するタスクがありません</p>
                  </div>
                ) : (
                  <div className="space-y-3">
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
                    {/* 合計サマリー */}
                    <div className="flex items-center justify-end gap-6 rounded-xl border border-gray-100 bg-white px-5 py-3 text-xs text-gray-500">
                      <span>予測 <span className="font-semibold text-gray-700">{totalEstimated}m</span></span>
                      <span>実績 <span className="font-mono font-semibold text-gray-700">{formatTime(totalElapsed)}</span></span>
                    </div>
                  </div>
                )
              ) : (
                <KanbanBoard
                  tasks={tasks}
                  onUpdateStatus={updateStatus}
                  onToggleTimer={toggleTimer}
                  onCardClick={(task) => setEditingTaskId(task.id)}
                  formatTime={formatTime}
                />
              )}
            </>
          )}
        </main>
        {/* モバイルボトムナビ */}
        <nav className="md:hidden shrink-0 flex items-stretch bg-white border-t border-gray-200">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setViewMode(item.key)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition-all ${
                viewMode === item.key ? "text-indigo-600" : "text-gray-400"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <button
            onClick={() => setShowSettings(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold text-gray-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            設定
          </button>
        </nav>
      </div>

      {/* ===== モーダル群 ===== */}
      {showCreateModal && (
        <TaskCreateModal
          availableProjects={availableProjects}
          availableTags={availableTags}
          onAdd={addTask}
          onClose={() => setShowCreateModal(false)}
        />
      )}

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
