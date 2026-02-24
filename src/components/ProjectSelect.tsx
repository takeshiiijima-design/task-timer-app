import { useState } from "react";

interface ProjectSelectProps {
  value: string;
  availableProjects: string[];
  onChange: (project: string) => void;
}

export default function ProjectSelect({
  value,
  availableProjects,
  onChange,
}: ProjectSelectProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-left shadow-sm hover:bg-gray-50 transition-all flex items-center justify-between"
      >
        <span className={value ? "text-gray-700 font-medium" : "text-gray-400"}>
          {value || "プロジェクトを選択..."}
        </span>
        <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-1 rounded-xl border border-gray-200 bg-white shadow-sm max-h-44 overflow-y-auto">
          <button
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            className={`block w-full px-3.5 py-2 text-left text-xs transition-colors rounded-t-xl ${
              !value
                ? "bg-blue-50 text-blue-600 font-medium"
                : "text-gray-400 hover:bg-gray-50"
            }`}
          >
            なし
          </button>

          {availableProjects.length === 0 ? (
            <p className="px-3.5 py-2.5 text-xs text-gray-400 rounded-b-xl">
              プロジェクトがありません。設定から追加してください。
            </p>
          ) : (
            availableProjects.map((project, i) => (
              <button
                key={project}
                onClick={() => {
                  onChange(project);
                  setIsOpen(false);
                }}
                className={`block w-full px-3.5 py-2 text-left text-xs transition-colors ${
                  i === availableProjects.length - 1 ? "rounded-b-xl" : ""
                } ${
                  value === project
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                }`}
              >
                {project}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
