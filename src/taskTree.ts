import type { Task } from "./types";

/** ツリー内の特定IDのタスクを更新する（再帰） */
export function updateTaskInTree(
  tasks: Task[],
  id: number,
  updater: (task: Task) => Task
): Task[] {
  return tasks.map((t) => {
    if (t.id === id) return updater(t);
    if (t.children.length > 0) {
      return { ...t, children: updateTaskInTree(t.children, id, updater) };
    }
    return t;
  });
}

/** ツリー内の特定IDのタスクを削除する（再帰） */
export function deleteTaskInTree(tasks: Task[], id: number): Task[] {
  return tasks
    .filter((t) => t.id !== id)
    .map((t) => ({
      ...t,
      children: deleteTaskInTree(t.children, id),
    }));
}

/** ツリー内の特定IDの子にタスクを追加する（再帰） */
export function addChildToTree(
  tasks: Task[],
  parentId: number,
  child: Task
): Task[] {
  return tasks.map((t) => {
    if (t.id === parentId) {
      return { ...t, children: [...t.children, child] };
    }
    if (t.children.length > 0) {
      return { ...t, children: addChildToTree(t.children, parentId, child) };
    }
    return t;
  });
}

/** タスクの合計実績秒数を再帰的に計算（自身 + 全子孫） */
export function getTotalElapsed(task: Task): number {
  return (
    task.elapsedSeconds +
    task.children.reduce((sum, c) => sum + getTotalElapsed(c), 0)
  );
}

/** タスクの合計予測分数を再帰的に計算（自身 + 全子孫） */
export function getTotalEstimated(task: Task): number {
  return (
    task.estimatedMinutes +
    task.children.reduce((sum, c) => sum + getTotalEstimated(c), 0)
  );
}

/** ツリー全体でタイマー実行中のタスクがあるか */
export function hasRunningInTree(tasks: Task[]): boolean {
  return tasks.some(
    (t) => t.isRunning || hasRunningInTree(t.children)
  );
}

/** 今日の日付文字列を返す */
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ツリー全体のタイマー tick（再帰） */
export function tickTree(tasks: Task[]): Task[] {
  const today = todayKey();
  return tasks.map((t) => {
    const updated =
      t.isRunning && t.startedAt
        ? (() => {
            const now = Math.floor(Date.now() / 1000);
            const delta = now - t.startedAt;
            const log = t.dailyLog ?? {};
            return {
              ...t,
              elapsedSeconds: t.elapsedSeconds + delta,
              startedAt: now,
              dailyLog: { ...log, [today]: (log[today] || 0) + delta },
            };
          })()
        : t;
    if (updated.children.length > 0) {
      return { ...updated, children: tickTree(updated.children) };
    }
    return updated;
  });
}

/** ツリー内の特定IDのタスクを検索する（再帰） */
export function findTaskInTree(tasks: Task[], id: number): Task | null {
  for (const t of tasks) {
    if (t.id === id) return t;
    const found = findTaskInTree(t.children, id);
    if (found) return found;
  }
  return null;
}

/** 指定IDの親タスクIDを返す（ルートレベルの場合はnull） */
export function findParentId(tasks: Task[], id: number): number | null {
  for (const t of tasks) {
    if (t.children.some((c) => c.id === id)) return t.id;
    const found = findParentId(t.children, id);
    if (found !== null) return found;
  }
  return null;
}

/** 旧データ形式のタスクを最新形式に正規化する（再帰） */
export function migrateTasks(tasks: unknown[]): Task[] {
  const today = todayKey();
  return tasks.map((raw) => {
    const t = raw as Record<string, unknown>;
    const elapsed = typeof t.elapsedSeconds === "number" ? t.elapsedSeconds : 0;
    const dailyLog =
      t.dailyLog && typeof t.dailyLog === "object" && !Array.isArray(t.dailyLog)
        ? (t.dailyLog as Record<string, number>)
        : {};

    // dailyLog の合計と elapsedSeconds の差分を今日に割り当て
    const logSum = Object.values(dailyLog).reduce((s, v) => s + v, 0);
    const untracked = elapsed - logSum;
    const fixedLog =
      untracked > 0
        ? { ...dailyLog, [today]: (dailyLog[today] || 0) + untracked }
        : { ...dailyLog };

    const children = Array.isArray(t.children) ? migrateTasks(t.children) : [];

    return {
      id: typeof t.id === "number" ? t.id : Date.now(),
      title: typeof t.title === "string" ? t.title : "",
      estimatedMinutes: typeof t.estimatedMinutes === "number" ? t.estimatedMinutes : 0,
      elapsedSeconds: elapsed,
      isRunning: typeof t.isRunning === "boolean" ? t.isRunning : false,
      startedAt: typeof t.startedAt === "number" ? t.startedAt : null,
      status: ["todo", "in_progress", "done"].includes(t.status as string)
        ? (t.status as Task["status"])
        : "todo",
      tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
      priority: ["low", "medium", "high"].includes(t.priority as string)
        ? (t.priority as Task["priority"])
        : "medium",
      project: typeof t.project === "string" ? t.project : "",
      dueDate: typeof t.dueDate === "string" ? t.dueDate : null,
      startDate: typeof t.startDate === "string" ? t.startDate : null,
      startTime: typeof t.startTime === "string" ? t.startTime : null,
      children,
      dailyLog: fixedLog,
      memo: typeof t.memo === "string" ? t.memo : "",
      archivedAt: typeof t.archivedAt === "string" ? t.archivedAt : null,
    };
  });
}

/** ID用カウンター（同ミリ秒の衝突を防止） */
let idCounter = 0;

/** 新しい空タスクを生成 */
export function createTask(title: string, estimatedMinutes: number): Task {
  return {
    id: Date.now() * 1000 + (idCounter++ % 1000),
    title,
    estimatedMinutes,
    elapsedSeconds: 0,
    isRunning: false,
    startedAt: null,
    status: "todo",
    tags: [],
    priority: "medium",
    project: "",
    dueDate: null,
    startDate: null,
    startTime: null,
    children: [],
    dailyLog: {},
    memo: "",
    archivedAt: null,
  };
}

/** ツリー内の全タスクからプロジェクト名を変更する（再帰） */
export function renameProjectInTree(
  tasks: Task[],
  oldName: string,
  newName: string
): Task[] {
  return tasks.map((t) => ({
    ...t,
    project: t.project === oldName ? newName : t.project,
    children: renameProjectInTree(t.children, oldName, newName),
  }));
}

/** ツリー内の全タスクからプロジェクト名を削除する（再帰） */
export function removeProjectFromTree(
  tasks: Task[],
  projectName: string
): Task[] {
  return tasks.map((t) => ({
    ...t,
    project: t.project === projectName ? "" : t.project,
    children: removeProjectFromTree(t.children, projectName),
  }));
}

/** ツリー内の全タスクからタグ名を変更する（再帰） */
export function renameTagInTree(
  tasks: Task[],
  oldName: string,
  newName: string
): Task[] {
  return tasks.map((t) => ({
    ...t,
    tags: t.tags.map((tag) => (tag === oldName ? newName : tag)),
    children: renameTagInTree(t.children, oldName, newName),
  }));
}

/** ツリー内の全タスクからタグを削除する（再帰） */
export function removeTagFromTree(
  tasks: Task[],
  tagName: string
): Task[] {
  return tasks.map((t) => ({
    ...t,
    tags: t.tags.filter((tag) => tag !== tagName),
    children: removeTagFromTree(t.children, tagName),
  }));
}
