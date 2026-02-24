import { useState } from "react";

interface TagInputProps {
  tags: string[];
  availableTags: string[];
  onChange: (tags: string[]) => void;
}

export default function TagInput({
  tags,
  availableTags,
  onChange,
}: TagInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      onChange(tags.filter((t) => t !== tag));
    } else {
      onChange([...tags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const unselected = availableTags.filter((t) => !tags.includes(t));

  return (
    <div>
      {/* 選択済みタグ */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="hover:text-red-500 transition-colors leading-none"
              aria-label={`${tag} を削除`}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {/* 選択ドロップダウン（インライン展開） */}
      <div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs text-left flex items-center justify-between text-gray-500 hover:bg-gray-50 shadow-sm transition-all"
        >
          <span>{isOpen ? "閉じる" : "タグを選択..."}</span>
          <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="mt-1 rounded-xl border border-gray-200 bg-white shadow-sm max-h-44 overflow-y-auto">
            {availableTags.length === 0 ? (
              <p className="px-3.5 py-2.5 text-xs text-gray-400">
                タグがありません。設定から追加してください。
              </p>
            ) : unselected.length === 0 ? (
              <p className="px-3.5 py-2.5 text-xs text-gray-400">
                すべてのタグが選択済みです
              </p>
            ) : (
              unselected.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="block w-full px-3.5 py-2 text-left text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  {tag}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
