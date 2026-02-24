import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Task } from "../types";

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

// ── トークンキャッシュ ──────────────────────────────────
const CONNECTED_KEY = "gcal-connected";
const TOKEN_KEY = "gcal-token";
const TOKEN_EXPIRY_KEY = "gcal-token-expiry";

function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + 3500 * 1000).toString());
  localStorage.setItem(CONNECTED_KEY, "1");
}
function getCachedToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > parseInt(expiry) - 5 * 60 * 1000) return null;
  return token;
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  localStorage.removeItem(CONNECTED_KEY);
}

// ── カレンダー定数 ─────────────────────────────────────
const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];
const HOUR_START = 8;
const HOUR_END = 22;
const HOUR_COUNT = HOUR_END - HOUR_START;
const PX_PER_HOUR = 52;

// ── ヘルパー ───────────────────────────────────────────
let idCounter = 0;
function newId() { return Date.now() * 1000 + (idCounter++ % 1000); }

function getWeekDays(weekOffset: number): Date[] {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getEventDate(event: GCalEvent): string {
  return event.start.date ?? (event.start.dateTime ?? "").split("T")[0];
}

function getEventDurationMin(event: GCalEvent): number {
  if (event.start.date) return 0;
  const start = new Date(event.start.dateTime ?? "").getTime();
  const end = new Date(event.end.dateTime ?? "").getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

function getEventStartTime(event: GCalEvent): string | null {
  if (!event.start.dateTime) return null;
  const start = new Date(event.start.dateTime);
  return `${start.getHours().toString().padStart(2, "0")}:${start.getMinutes().toString().padStart(2, "0")}`;
}

function timeToTop(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return ((h - HOUR_START) * 60 + m) / 60 * PX_PER_HOUR;
}

function durationToHeight(minutes: number): number {
  return Math.max((minutes / 60) * PX_PER_HOUR, 18);
}

// 各予定の取り込み状態
type EventStatus = "imported-task" | "imported-mtg" | "skipped";

// ── メインコンポーネント ────────────────────────────────
export default function GoogleCalendarSync({ onAddTasks, onClose }: GoogleCalendarSyncProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [events, setEvents] = useState<GCalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [eventStatus, setEventStatus] = useState<Record<string, EventStatus>>({});
  const [autoConnecting, setAutoConnecting] = useState(
    () => !getCachedToken() && !!localStorage.getItem(CONNECTED_KEY)
  );
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const today = toDateStr(new Date());

  // ── イベント取得 ──────────────────────────────────────
  const fetchEvents = useCallback(async (token: string, days: Date[]) => {
    setLoading(true);
    setError(null);
    try {
      const start = toDateStr(days[0]);
      const end = toDateStr(days[6]);
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
        `?timeMin=${start}T00:00:00Z&timeMax=${end}T23:59:59Z` +
        `&singleEvents=true&orderBy=startTime&maxResults=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        if (res.status === 401) {
          clearToken(); setAccessToken(null);
          setError("認証の有効期限が切れました。再度サインインしてください。");
          return;
        }
        throw new Error(`API エラー: ${res.status}`);
      }
      const data = await res.json();
      const items: GCalEvent[] = (data.items ?? []).filter((e: GCalEvent) => e.summary);
      setEvents(items);
      setEventStatus({});
      setActiveEventId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  // 週ナビゲーション変更時に再取得
  useEffect(() => {
    if (accessToken) fetchEvents(accessToken, weekDays);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  // マウント時の自動接続
  useEffect(() => {
    const cached = getCachedToken();
    if (cached) {
      setAccessToken(cached);
      fetchEvents(cached, weekDays);
      return;
    }
    if (!localStorage.getItem(CONNECTED_KEY)) return;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const timer = setTimeout(() => {
      if (!clientId || !window.google) { setAutoConnecting(false); return; }
      window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.readonly",
        prompt: "none",
        callback: (resp) => {
          setAutoConnecting(false);
          if (resp.access_token) {
            saveToken(resp.access_token);
            setAccessToken(resp.access_token);
            fetchEvents(resp.access_token, weekDays);
          } else {
            clearToken();
          }
        },
      }).requestAccessToken();
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 認証後に現在時刻付近にスクロール
  useEffect(() => {
    if (!accessToken || !scrollRef.current) return;
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    if (h >= HOUR_START && h < HOUR_END) {
      scrollRef.current.scrollTop = Math.max(0, timeToTop(`${h}:${m}`) - PX_PER_HOUR);
    }
  }, [accessToken]);

  const signIn = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) { setError("VITE_GOOGLE_CLIENT_ID が設定されていません。"); return; }
    if (!window.google) { setError("Google Identity Services の読み込みに失敗しました。"); return; }
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      callback: (resp) => {
        if (resp.access_token) {
          saveToken(resp.access_token);
          setAccessToken(resp.access_token);
          fetchEvents(resp.access_token, weekDays);
        } else {
          setError("Googleサインインがキャンセルされました。");
        }
      },
    }).requestAccessToken();
  }, [weekDays, fetchEvents]);

  // ── 即時取り込み ──────────────────────────────────────
  const importEvent = (ev: GCalEvent, mode: "task" | "mtg") => {
    const eventDate = getEventDate(ev);
    const durationMin = getEventDurationMin(ev);
    const durationSec = durationMin * 60;
    const base: Task = {
      id: newId(),
      title: ev.summary,
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
      startTime: getEventStartTime(ev),
      children: [],
      dailyLog: {},
      memo: ev.description ?? "",
      archivedAt: null,
    };
    if (mode === "mtg") {
      onAddTasks([{
        ...base,
        status: "done",
        elapsedSeconds: durationSec,
        dailyLog: eventDate ? { [eventDate]: durationSec } : {},
        archivedAt: new Date().toISOString(),
      }]);
      setEventStatus(prev => ({ ...prev, [ev.id]: "imported-mtg" }));
    } else {
      onAddTasks([base]);
      setEventStatus(prev => ({ ...prev, [ev.id]: "imported-task" }));
    }
    setActiveEventId(null);
  };

  const skipEvent = (id: string) => {
    setEventStatus(prev => ({ ...prev, [id]: "skipped" }));
    setActiveEventId(null);
  };

  // 日付ごとのイベント分類
  const eventsByDate = useMemo(() => {
    const map: Record<string, { timed: GCalEvent[]; allDay: GCalEvent[] }> = {};
    for (const ev of events) {
      const date = getEventDate(ev);
      if (!date) continue;
      if (!map[date]) map[date] = { timed: [], allDay: [] };
      if (ev.start.dateTime) map[date].timed.push(ev);
      else map[date].allDay.push(ev);
    }
    return map;
  }, [events]);

  const weekLabel = (() => {
    const s = weekDays[0];
    const e = weekDays[6];
    if (s.getMonth() === e.getMonth())
      return `${s.getFullYear()}年${s.getMonth() + 1}月 ${s.getDate()}日〜${e.getDate()}日`;
    return `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日〜${e.getMonth() + 1}月${e.getDate()}日`;
  })();

  // 取り込み済みカウント
  const importedCount = Object.values(eventStatus).filter(s => s !== "skipped").length;

  // ── 現在時刻ライン ────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const nowTop = (() => {
    const h = currentTime.getHours(), m = currentTime.getMinutes();
    if (h < HOUR_START || h >= HOUR_END) return null;
    return timeToTop(`${h}:${m}`);
  })();

  // イベントの表示スタイルを返す
  function getEventStyle(id: string) {
    const st = eventStatus[id];
    if (st === "imported-task") return { bg: "bg-blue-500 border border-blue-400", text: "text-white", dim: false };
    if (st === "imported-mtg") return { bg: "bg-violet-500 border border-violet-400", text: "text-white", dim: false };
    if (st === "skipped") return { bg: "bg-gray-200 border border-gray-300", text: "text-gray-400", dim: true };
    // neutral
    return { bg: "bg-gray-100 border border-gray-200", text: "text-gray-500", dim: false };
  }

  // ── レンダリング ──────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm sm:p-4">
      <div className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden max-h-[92vh] sm:max-h-[90vh] flex flex-col">

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
        {!accessToken ? (
          /* ── 未接続UI ── */
          <div className="flex flex-col items-center justify-center py-10 gap-4 px-5">
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
          /* ── 週間カレンダーUI ── */
          <div className="flex flex-col flex-1 overflow-hidden">

            {/* 週ナビゲーション */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 shrink-0">
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                className="rounded-lg border border-gray-200 bg-white p-1.5 hover:bg-gray-50 transition-all"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-xs font-semibold text-gray-700 flex-1 text-center">{weekLabel}</span>
              <button
                onClick={() => setWeekOffset(o => o + 1)}
                className="rounded-lg border border-gray-200 bg-white p-1.5 hover:bg-gray-50 transition-all"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100 transition-all"
                >
                  今週
                </button>
              )}
              {loading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600 shrink-0" />
              )}
            </div>

            {error && <p className="text-xs text-red-500 px-4 py-1 shrink-0">{error}</p>}

            {/* カレンダーグリッド */}
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-hidden flex flex-col min-w-0">
                {/* 曜日ヘッダー */}
                <div className="overflow-x-hidden shrink-0">
                  <div className="flex border-b border-gray-100" style={{ minWidth: 480 }}>
                    <div className="w-8 shrink-0" />
                    {weekDays.map((date, i) => {
                      const dateKey = toDateStr(date);
                      const isToday = dateKey === today;
                      const isSat = i === 5;
                      const isSun = i === 6;
                      const allDayEvs = eventsByDate[dateKey]?.allDay ?? [];
                      return (
                        <div key={dateKey} className="flex-1 border-l border-gray-100 min-w-0">
                          <div className={`flex flex-col items-center py-1.5 ${isToday ? "bg-indigo-50" : ""}`}>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${
                              isToday ? "text-indigo-400" : isSat ? "text-blue-400" : isSun ? "text-rose-400" : "text-gray-400"
                            }`}>{DAY_LABELS[i]}</span>
                            <span className={`text-sm font-bold leading-tight ${
                              isToday
                                ? "flex items-center justify-center h-6 w-6 rounded-full bg-indigo-600 text-white"
                                : isSat ? "text-blue-600" : isSun ? "text-rose-500" : "text-gray-700"
                            }`}>{date.getDate()}</span>
                          </div>
                          {/* 終日イベント */}
                          {allDayEvs.length > 0 && (
                            <div className="px-0.5 pb-1 space-y-0.5 border-t border-gray-100">
                              {allDayEvs.map(ev => {
                                const style = getEventStyle(ev.id);
                                const isActive = activeEventId === ev.id;
                                return (
                                  <div
                                    key={ev.id}
                                    onClick={() => setActiveEventId(prev => prev === ev.id ? null : ev.id)}
                                    className={`rounded px-1 py-0.5 text-[9px] font-semibold truncate cursor-pointer transition-all ${style.bg} ${style.text} ${
                                      style.dim ? "opacity-40" : ""
                                    } ${isActive ? "ring-1 ring-gray-700" : ""}`}
                                  >
                                    {ev.summary}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 時刻グリッド */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto">
                  <div className="flex" style={{ minWidth: 480 }}>
                    {/* 時刻軸 */}
                    <div className="w-8 shrink-0 relative">
                      {Array.from({ length: HOUR_COUNT }, (_, i) => (
                        <div key={i} style={{ height: PX_PER_HOUR }} className="flex items-start justify-end pr-1 pt-0.5">
                          <span className="text-[8px] text-gray-300 leading-none">{HOUR_START + i}</span>
                        </div>
                      ))}
                    </div>

                    {/* 日別列 */}
                    <div className="flex flex-1 relative">
                      {weekDays.map(date => {
                        const dateKey = toDateStr(date);
                        const isToday = dateKey === today;
                        const timedEvs = eventsByDate[dateKey]?.timed ?? [];
                        return (
                          <div
                            key={dateKey}
                            className={`flex-1 border-l border-gray-100 relative ${isToday ? "bg-indigo-50/20" : ""}`}
                            style={{ height: HOUR_COUNT * PX_PER_HOUR }}
                          >
                            {/* 時間罫線 */}
                            {Array.from({ length: HOUR_COUNT }, (_, hi) => (
                              <div key={hi} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: hi * PX_PER_HOUR }} />
                            ))}
                            {/* 30分罫線 */}
                            {Array.from({ length: HOUR_COUNT }, (_, hi) => (
                              <div key={`h${hi}`} className="absolute left-0 right-0 border-t border-gray-50" style={{ top: hi * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
                            ))}

                            {/* 現在時刻ライン */}
                            {isToday && nowTop !== null && (
                              <div
                                className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                                style={{ top: nowTop }}
                              >
                                <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                                <div className="flex-1 h-px bg-red-400" />
                              </div>
                            )}

                            {/* 時刻付きイベント */}
                            {timedEvs.map(ev => {
                              const startTime = getEventStartTime(ev);
                              if (!startTime) return null;
                              const startHour = parseInt(startTime.split(":")[0]);
                              if (startHour < HOUR_START || startHour >= HOUR_END) return null;
                              const top = timeToTop(startTime);
                              const height = durationToHeight(getEventDurationMin(ev));
                              const style = getEventStyle(ev.id);
                              const isActive = activeEventId === ev.id;
                              const isShort = height <= 28;
                              const st = eventStatus[ev.id];
                              return (
                                <div
                                  key={ev.id}
                                  onClick={() => setActiveEventId(prev => prev === ev.id ? null : ev.id)}
                                  className={`absolute left-0.5 right-0.5 z-10 rounded overflow-hidden cursor-pointer transition-all hover:brightness-95 ${
                                    isActive ? "ring-2 ring-offset-1 ring-gray-700 z-20" : ""
                                  } ${style.bg} ${style.dim ? "opacity-40" : ""}`}
                                  style={{ top, height }}
                                >
                                  <div className={`px-1 ${isShort ? "pt-0" : "pt-0.5"} h-full flex items-start gap-0.5`}>
                                    {/* 済みアイコン */}
                                    {(st === "imported-task" || st === "imported-mtg") && (
                                      <svg className="h-2.5 w-2.5 shrink-0 mt-0.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                    <p className={`font-semibold leading-tight flex-1 min-w-0 ${
                                      isShort ? "text-[8px] truncate" : "text-[9px] line-clamp-2"
                                    } ${style.text}`}>
                                      {startTime} {ev.summary}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* イベント操作パネル */}
            {activeEventId && (() => {
              const ev = events.find(e => e.id === activeEventId);
              if (!ev) return null;
              const st = eventStatus[ev.id];
              const duration = getEventDurationMin(ev);
              const isImported = st === "imported-task" || st === "imported-mtg";
              return (
                <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 space-y-2.5">
                  {/* イベント情報 */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{ev.summary}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {getEventDate(ev)}　{getEventStartTime(ev) ?? "終日"}
                        {duration > 0 && `　${duration}分`}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveEventId(null)}
                      className="shrink-0 h-6 w-6 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 transition-all"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {isImported ? (
                    /* 取り込み済みの場合 */
                    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                      st === "imported-mtg" ? "bg-violet-50" : "bg-blue-50"
                    }`}>
                      <svg className={`h-4 w-4 shrink-0 ${st === "imported-mtg" ? "text-violet-500" : "text-blue-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={`text-xs font-semibold ${st === "imported-mtg" ? "text-violet-700" : "text-blue-700"}`}>
                        {st === "imported-mtg" ? "MTGとして記録済み" : "タスクに追加済み"}
                      </span>
                    </div>
                  ) : (
                    /* 未取り込み（neutral / skipped）の場合 */
                    <div className="flex gap-2">
                      <button
                        onClick={() => importEvent(ev, "task")}
                        className="flex-1 rounded-xl py-2 text-xs font-semibold bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 transition-all"
                      >
                        タスクに追加
                      </button>
                      <button
                        onClick={() => importEvent(ev, "mtg")}
                        className="flex-1 rounded-xl py-2 text-xs font-semibold bg-violet-600 text-white border border-violet-600 hover:bg-violet-700 transition-all"
                      >
                        MTGとして記録
                      </button>
                      <button
                        onClick={() => skipEvent(ev.id)}
                        className="flex-1 rounded-xl py-2 text-xs font-semibold bg-white text-gray-400 border border-gray-200 hover:bg-gray-50 transition-all"
                      >
                        スキップ
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 凡例 */}
            <div className="shrink-0 flex items-center gap-4 px-4 py-1.5 border-t border-gray-100 bg-gray-50/40">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded bg-blue-500" />
                <span className="text-[10px] text-gray-500">タスク</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded bg-violet-500" />
                <span className="text-[10px] text-gray-500">MTG</span>
              </div>
              <span className="text-[10px] text-gray-400 ml-auto hidden sm:block">
                {importedCount > 0
                  ? `${importedCount}件取り込み済み`
                  : "予定をタップして取り込む"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
