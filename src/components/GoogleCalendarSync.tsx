import { useState, useCallback, useEffect } from "react";
import type { Task } from "../types";
import { todayKey } from "../taskTree";

// Google Identity Services の型宣言
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

interface GCalEvent {
  id: string;
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  description?: string;
}

interface GoogleCalendarSyncProps {
  onAddTasks: (tasks: Task[]) => void;
  onClose: () => void;
}

const CONNECTED_KEY = "gcal-connected";

let idCounter = 0;
function newId() {
  return Date.now() * 1000 + (idCounter++ % 1000);
}

function toDateKey(dateStr: string): string {
  return dateStr.split("T")[0];
}

function getEventDate(event: GCalEvent): string {
  return event.start.date ?? toDateKey(event.start.dateTime ?? "");
}

function getEventDurationMin(event: GCalEvent): number {
  if (event.start.date) return 0; // 終日イベントは0分
  const start = new Date(event.start.dateTime ?? "").getTime();
  const end = new Date(event.end.dateTime ?? "").getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

function formatEventTime(event: GCalEvent): string {
  if (event.start.date) return "終日";
  const start = new Date(event.start.dateTime ?? "");
  const h = start.getHours().toString().padStart(2, "0");
  const m = start.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function nextWeekKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 6);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ImportMode = "task" | "mtg";

export default function GoogleCalendarSync({ onAddTasks, onClose }: GoogleCalendarSyncProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({ start: todayKey(), end: nextWeekKey() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<Record<string, ImportMode>>({});
  const [autoConnecting, setAutoConnecting] = useState(!!localStorage.getItem(CONNECTED_KEY));

  const fetchEvents = useCallback(async (token: string, range: typeof dateRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
        `?timeMin=${range.start}T00:00:00Z&timeMax=${range.end}T23:59:59Z` +
        `&singleEvents=true&orderBy=startTime&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        if (res.status === 401) {
          setAccessToken(null);
          setError("認証の有効期限が切れました。再度サインインしてください。");
          return;
        }
        throw new Error(`API エラー: ${res.status}`);
      }
      const data = await res.json();
      const items: GCalEvent[] = (data.items ?? []).filter((e: GCalEvent) => e.summary);
      setEvents(items);
      // 全件をデフォルト選択、モードはtask
      const sel = new Set(items.map((e: GCalEvent) => e.id));
      setSelected(sel);
      const modes: Record<string, ImportMode> = {};
      items.forEach((e: GCalEvent) => { modes[e.id] = "task"; });
      setImportMode(modes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  // モーダルを開いた時に自動でトークン取得を試みる
  useEffect(() => {
    if (!localStorage.getItem(CONNECTED_KEY)) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const timer = setTimeout(() => {
      if (!clientId || !window.google) {
        setAutoConnecting(false);
        return;
      }
      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        prompt: "",
        callback: (resp) => {
          setAutoConnecting(false);
          if (resp.access_token) {
            setAccessToken(resp.access_token);
            fetchEvents(resp.access_token, dateRange);
          } else {
            localStorage.removeItem(CONNECTED_KEY);
          }
        },
      }).requestAccessToken();
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("VITE_GOOGLE_CLIENT_ID が設定されていません。");
      return;
    }
    if (!window.google) {
      setError("Google Identity Services の読み込みに失敗しました。ページを再読み込みしてください。");
      return;
    }
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      callback: (resp) => {
        if (resp.access_token) {
          localStorage.setItem(CONNECTED_KEY, "1");
          setAccessToken(resp.access_token);
          fetchEvents(resp.access_token, dateRange);
        } else {
          setError("Googleサインインがキャンセルされました。");
        }
      },
    }).requestAccessToken();
  }, [dateRange, fetchEvents]);

  const handleDateChange = (key: "start" | "end", val: string) => {
    const newRange = { ...dateRange, [key]: val };
    setDateRange(newRange);
    if (accessToken) fetchEvents(accessToken, newRange);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setMode = (id: string, mode: ImportMode) => {
    setImportMode((prev) => ({ ...prev, [id]: mode }));
  };

  const handleImport = () => {
    const tasks: Task[] = [];
    events
      .filter((e) => selected.has(e.id))
      .forEach((e) => {
        const mode = importMode[e.id] ?? "task";
        const eventDate = getEventDate(e);
        const durationMin = getEventDurationMin(e);
        const durationSec = durationMin * 60;
        const base: Task = {
          id: newId(),
          title: e.summary,
          estimatedMinutes: durationMin,
          elapsedSeconds: 0,
          isRunning: false,
          startedAt: null,
          status: "todo",
          tags: [],
          priority: "medium",
          project: "",
          dueDate: eventDate || null,
          startDate: eventDate || null,
          children: [],
          dailyLog: {},
          memo: e.description ?? "",
          archivedAt: null,
        };
        if (mode === "mtg") {
          tasks.push({
            ...base,
            status: "done",
            elapsedSeconds: durationSec,
            dailyLog: eventDate ? { [eventDate]: durationSec } : {},
            archivedAt: new Date().toISOString(),
          });
        } else {
          tasks.push(base);
        }
      });
    if (tasks.length > 0) {
      onAddTasks(tasks);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[90vh] sm:max-h-[85vh] flex flex-col">

        {/* ヘッダー */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/>
            </svg>
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Googleカレンダーから取り込み
            </h2>
          </div>
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
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* 未接続時 */}
          {!accessToken ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              {autoConnecting ? (
                <>
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                  <p className="text-sm text-gray-400">カレンダーに接続中...</p>
                </>
              ) : (
                <>
              <p className="text-sm text-gray-500">Googleアカウントで認証して予定を取り込みます</p>
              <button
                onClick={signIn}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-all"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Googleでサインイン
              </button>
              {error && <p className="text-xs text-red-500 text-center">{error}</p>}
                </>
              )}
            </div>
          ) : (
            <>
              {/* 期間選択 */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">期間</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => handleDateChange("start", e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <span className="text-gray-400 text-xs">〜</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => handleDateChange("end", e.target.value)}
                  className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  onClick={() => fetchEvents(accessToken, dateRange)}
                  className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-all"
                >
                  更新
                </button>
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              {/* イベント一覧 */}
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                </div>
              ) : events.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">この期間の予定はありません</p>
              ) : (
                <ul className="space-y-2">
                  {events.map((e) => {
                    const isSelected = selected.has(e.id);
                    const mode = importMode[e.id] ?? "task";
                    const duration = getEventDurationMin(e);
                    return (
                      <li
                        key={e.id}
                        className={`rounded-xl border transition-all ${
                          isSelected ? "border-blue-200 bg-blue-50/30" : "border-gray-200 bg-gray-50/30"
                        }`}
                      >
                        {/* イベント行 */}
                        <div
                          className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                          onClick={() => toggleSelect(e.id)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(e.id)}
                            onClick={(ev) => ev.stopPropagation()}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{e.summary}</p>
                            <p className="text-[10px] text-gray-400">
                              {getEventDate(e)} {formatEventTime(e)}
                              {duration > 0 && ` · ${duration}分`}
                            </p>
                          </div>
                        </div>

                        {/* 取り込みモード選択（チェック時のみ表示） */}
                        {isSelected && (
                          <div className="flex gap-2 px-3 pb-2.5" onClick={(ev) => ev.stopPropagation()}>
                            <button
                              onClick={() => setMode(e.id, "task")}
                              className={`flex-1 rounded-lg py-1 text-[10px] font-semibold transition-all ${
                                mode === "task"
                                  ? "bg-blue-600 text-white"
                                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              タスクに追加
                            </button>
                            <button
                              onClick={() => setMode(e.id, "mtg")}
                              className={`flex-1 rounded-lg py-1 text-[10px] font-semibold transition-all ${
                                mode === "mtg"
                                  ? "bg-violet-600 text-white"
                                  : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                              }`}
                            >
                              MTGとして記録
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        {accessToken && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 shrink-0 bg-gray-50/40">
            <p className="text-[10px] text-gray-400">
              {selected.size}件を選択中
            </p>
            <button
              onClick={handleImport}
              disabled={selected.size === 0}
              className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              選択した予定を取り込む
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
