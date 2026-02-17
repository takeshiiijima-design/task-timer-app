interface DateBadgeProps {
  label: string;
  date: string | null;
  icon: "start" | "due";
  warnIfPast?: boolean;
}

function isOverdue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return target < today;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function DateBadge({
  label,
  date,
  icon,
  warnIfPast = false,
}: DateBadgeProps) {
  if (!date) return null;

  const overdue = warnIfPast && isOverdue(date);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium ${
        overdue
          ? "bg-red-50 text-red-600 ring-1 ring-red-200"
          : "bg-gray-100/80 text-gray-500"
      }`}
      title={`${label}: ${date}`}
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {icon === "start" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        )}
      </svg>
      <span>{formatDateLabel(date)}</span>
      {overdue && (
        <span className="font-bold">!</span>
      )}
    </span>
  );
}

export { isOverdue, formatDateLabel };
