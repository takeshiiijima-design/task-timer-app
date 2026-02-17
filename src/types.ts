export type TaskStatus = "todo" | "in_progress" | "done";
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: number;
  title: string;
  estimatedMinutes: number;
  elapsedSeconds: number;
  isRunning: boolean;
  startedAt: number | null;
  status: TaskStatus;
  tags: string[];
  priority: Priority;
  project: string;
  dueDate: string | null;
  startDate: string | null;
  children: Task[];
  /** 日別の実績秒数 (キー: "YYYY-MM-DD") */
  dailyLog: Record<string, number>;
  /** メモ・コメント */
  memo: string;
  /** アーカイブされた日時 (ISO文字列 or null) */
  archivedAt: string | null;
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-500",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-600",
};
