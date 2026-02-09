"use client";

import { useCallback, useState } from "react";
import type { GoogleFormDefinition, FormQuestion } from "@/types/googleForm";

export function PreviewEditor({
  questions,
  onQuestionsChange,
  disabled,
}: {
  questions: GoogleFormDefinition | null;
  onQuestionsChange: (q: GoogleFormDefinition) => void;
  disabled?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const updateQuestion = useCallback(
    (index: number, patch: Partial<FormQuestion>) => {
      if (!questions) return;
      const next = [...questions.questions];
      next[index] = { ...next[index], ...patch };
      onQuestionsChange({ ...questions, questions: next });
    },
    [questions, onQuestionsChange]
  );

  const moveQuestion = useCallback(
    (index: number, dir: "up" | "down") => {
      if (!questions) return;
      const next = [...questions.questions];
      const j = dir === "up" ? index - 1 : index + 1;
      if (j < 0 || j >= next.length) return;
      [next[index], next[j]] = [next[j], next[index]];
      onQuestionsChange({ ...questions, questions: next });
    },
    [questions, onQuestionsChange]
  );

  const removeQuestion = useCallback(
    (index: number) => {
      if (!questions) return;
      const next = questions.questions.filter((_, i) => i !== index);
      onQuestionsChange({ ...questions, questions: next });
      setEditingId(null);
    },
    [questions, onQuestionsChange]
  );

  const addQuestion = useCallback(() => {
    if (!questions) return;
    const newQ: FormQuestion = {
      id: `q${Date.now()}`,
      title: "新しい質問",
      required: false,
      type: "text",
    };
    onQuestionsChange({ ...questions, questions: [...questions.questions, newQ] });
    setEditingId(newQ.id);
  }, [questions, onQuestionsChange]);

  if (!questions) return null;

  return (
    <section className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">質問リスト（編集）</h2>
      <div className="space-y-2">
        {questions.questions.map((q, i) => (
          <div
            key={q.id}
            className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 p-2"
          >
            <span className="text-xs text-gray-500">{i + 1}.</span>
            {editingId === q.id ? (
              <input
                type="text"
                value={q.title}
                onChange={(e) => updateQuestion(i, { title: e.target.value })}
                onBlur={() => setEditingId(null)}
                className="min-w-[200px] flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                disabled={disabled}
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingId(q.id)}
                className="flex-1 text-left text-sm hover:underline"
                disabled={disabled}
              >
                {q.title || "(無題)"}
              </button>
            )}
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                disabled={disabled}
              />
              必須
            </label>
            <button
              type="button"
              onClick={() => moveQuestion(i, "up")}
              disabled={disabled || i === 0}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              上
            </button>
            <button
              type="button"
              onClick={() => moveQuestion(i, "down")}
              disabled={disabled || i === questions.questions.length - 1}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-200 disabled:opacity-50"
            >
              下
            </button>
            <button
              type="button"
              onClick={() => removeQuestion(i)}
              disabled={disabled}
              className="rounded border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              削除
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addQuestion}
        disabled={disabled}
        className="mt-2 rounded border border-dashed border-gray-400 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
      >
        + 質問を追加
      </button>
    </section>
  );
}
