import { useState, useEffect, useRef } from "react";

interface EditableListProps {
  items: string[];
  onUpdate: (items: string[]) => void;
  onRenameItem?: (oldName: string, newName: string) => void;
  onDeleteItem?: (name: string) => void;
  placeholder: string;
  emptyMessage: string;
  accentColor?: string;
}

export default function EditableList({
  items,
  onUpdate,
  onRenameItem,
  onDeleteItem,
  placeholder,
  emptyMessage,
  accentColor = "indigo",
}: EditableListProps) {
  const [newItem, setNewItem] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingIndex !== null) {
      editInputRef.current?.focus();
    }
  }, [editingIndex]);

  const addItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onUpdate([...items, trimmed]);
    setNewItem("");
  };

  const deleteItem = (index: number) => {
    const name = items[index];
    if (onDeleteItem) {
      onDeleteItem(name);
    }
    onUpdate(items.filter((_, i) => i !== index));
  };

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(items[index]);
  };

  const commitEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed || items.some((t, i) => i !== editingIndex && t === trimmed)) {
      setEditingIndex(null);
      return;
    }
    const oldName = items[editingIndex];
    if (onRenameItem && oldName !== trimmed) {
      onRenameItem(oldName, trimmed);
    }
    const updated = [...items];
    updated[editingIndex] = trimmed;
    onUpdate(updated);
    setEditingIndex(null);
  };

  const ringClass =
    accentColor === "indigo"
      ? "focus:ring-indigo-200 focus:border-indigo-300"
      : "focus:ring-blue-200 focus:border-blue-300";
  const btnClass =
    accentColor === "indigo"
      ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200"
      : "bg-blue-600 hover:bg-blue-700 shadow-blue-200";
  const editRingClass =
    accentColor === "indigo"
      ? "border-indigo-300 focus:ring-indigo-200"
      : "border-blue-300 focus:ring-blue-200";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              addItem();
            }
          }}
          className={`flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 ${ringClass} transition-all`}
        />
        <button
          onClick={addItem}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all ${btnClass}`}
        >
          Add
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-400 text-xs text-center py-6">{emptyMessage}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li
              key={index}
              className="group flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 hover:border-gray-300 transition-all"
            >
              {editingIndex === index ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing)
                      commitEdit();
                    if (e.key === "Escape") setEditingIndex(null);
                  }}
                  onBlur={commitEdit}
                  className={`flex-1 rounded-lg border px-2.5 py-0.5 text-sm focus:outline-none focus:ring-1 ${editRingClass} transition-all`}
                />
              ) : (
                <span
                  onClick={() => startEdit(index)}
                  className="text-sm text-gray-700 cursor-text hover:text-blue-600 transition-colors"
                >
                  {item}
                </span>
              )}

              <div className="flex items-center gap-1.5 ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {editingIndex !== index && (
                  <button
                    onClick={() => startEdit(index)}
                    className="text-[11px] text-gray-400 hover:text-blue-500 transition-colors px-1.5"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => deleteItem(index)}
                  className="flex items-center justify-center h-6 w-6 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
