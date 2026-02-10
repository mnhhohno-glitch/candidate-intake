"use client";

import { useState } from "react";

/** 求職者番号は5から始まる7桁の数字 */
export const CANDIDATE_ID_REGEX = /^5\d{6}$/;

export const CAREER_ADVISORS = [
  "大野 将幸",
  "安藤 嘉富",
  "岡田 愛子",
  "南條 雄三",
] as const;

export type CareerAdvisor = (typeof CAREER_ADVISORS)[number];

export interface RegisteredRecord {
  candidateName: string;
  candidateId: string;
  careerAdvisor: CareerAdvisor;
}

const CANDIDATE_ID_ERROR = "求職者番号は5から始まる7桁の数字で入力してください。";

export function RecordRegister({
  record,
  onRegister,
  onValidationError,
  disabled,
  error,
  onErrorClear,
}: {
  record: RegisteredRecord | null;
  onRegister: (r: RegisteredRecord) => void;
  onValidationError?: (message: string) => void;
  disabled?: boolean;
  error: string | null;
  onErrorClear: () => void;
}) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [advisor, setAdvisor] = useState<CareerAdvisor>(CAREER_ADVISORS[0]);

  const handleAddClick = () => {
    onErrorClear();
    const idTrim = id.trim();
    if (!CANDIDATE_ID_REGEX.test(idTrim)) {
      onValidationError?.(CANDIDATE_ID_ERROR);
      return;
    }
    onRegister({
      candidateName: name.trim(),
      candidateId: idTrim,
      careerAdvisor: advisor,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddClick();
  };

  const isValidId = (v: string) => CANDIDATE_ID_REGEX.test(v.trim());

  return (
    <section className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">1. 新規レコード追加</h2>
      <p className="mb-3 text-sm text-gray-600">
        求職者名・求職者番号（5から始まる7桁）・担当キャリアアドバイザーを入力し、「新規レコード追加」で登録してください。不正な求職者番号では登録できません。
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">求職者名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="例: 山田 太郎"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            求職者番号 <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            value={id}
            onChange={(e) => { setId(e.target.value); onErrorClear(); }}
            disabled={disabled}
            className={`w-full rounded border px-3 py-2 text-sm ${!id.trim() || isValidId(id) ? "border-gray-300" : "border-red-400"}`}
            placeholder="5から始まる7桁（例: 5003981）"
            maxLength={7}
          />
          {id.trim() && !isValidId(id) && (
            <p className="mt-1 text-xs text-red-600">{CANDIDATE_ID_ERROR}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">担当キャリアアドバイザー</label>
          <select
            value={advisor}
            onChange={(e) => setAdvisor(e.target.value as CareerAdvisor)}
            disabled={disabled}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {CAREER_ADVISORS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAddClick}
          disabled={disabled || !name.trim() || !isValidId(id)}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          新規レコード追加
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      {record?.candidateId && (
        <div className="mt-3 rounded border border-green-200 bg-green-50 p-2 text-sm text-gray-800">
          <span className="font-medium">登録済み:</span> {record.candidateName || "—"} / 求職者番号 {record.candidateId} / 担当 {record.careerAdvisor}
        </div>
      )}
    </section>
  );
}
