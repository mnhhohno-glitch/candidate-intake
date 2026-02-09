"use client";

import { useCallback, useState } from "react";

export interface UploadFiles {
  pdf: File | null;
  interviewLog: File | null;
  flagList: File | null;
}

const ACCEPT = {
  pdf: ".pdf,application/pdf",
  text: ".txt,text/plain",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function UploadPanel({
  files,
  onFilesChange,
  disabled,
}: {
  files: UploadFiles;
  onFilesChange: (f: UploadFiles) => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState<"pdf" | "interview" | "flag" | null>(null);

  const setPdf = useCallback(
    (file: File | null) => onFilesChange({ ...files, pdf: file }),
    [files, onFilesChange]
  );
  const setInterview = useCallback(
    (file: File | null) => onFilesChange({ ...files, interviewLog: file }),
    [files, onFilesChange]
  );
  const setFlag = useCallback(
    (file: File | null) => onFilesChange({ ...files, flagList: file }),
    [files, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, kind: "pdf" | "interview" | "flag") => {
      e.preventDefault();
      setDrag(null);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      if (kind === "pdf" && file.type === "application/pdf") setPdf(file);
      if (kind === "interview" && (file.type === "text/plain" || file.name.endsWith(".txt"))) setInterview(file);
      if (kind === "flag" && (file.type.includes("sheet") || file.name.endsWith(".xlsx"))) setFlag(file);
    },
    [setPdf, setInterview, setFlag]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, kind: "pdf" | "interview" | "flag") => {
      const file = e.target.files?.[0] ?? null;
      if (kind === "pdf") setPdf(file);
      if (kind === "interview") setInterview(file);
      if (kind === "flag") setFlag(file);
    },
    [setPdf, setInterview, setFlag]
  );

  return (
    <section className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">1. ファイルをアップロード</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div
          className={`rounded border-2 border-dashed p-4 transition ${drag === "pdf" ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag("pdf");
          }}
          onDragLeave={() => setDrag(null)}
          onDrop={(e) => handleDrop(e, "pdf")}
        >
          <p className="mb-2 text-sm font-medium text-gray-700">履歴書 PDF</p>
          <input
            type="file"
            accept={ACCEPT.pdf}
            disabled={disabled}
            className="mb-2 block w-full text-sm"
            onChange={(e) => handleFileInput(e, "pdf")}
          />
          {files.pdf && <p className="truncate text-xs text-gray-600">{files.pdf.name}</p>}
        </div>
        <div
          className={`rounded border-2 border-dashed p-4 transition ${drag === "interview" ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag("interview");
          }}
          onDragLeave={() => setDrag(null)}
          onDrop={(e) => handleDrop(e, "interview")}
        >
          <p className="mb-2 text-sm font-medium text-gray-700">面談ログ .txt</p>
          <input
            type="file"
            accept={ACCEPT.text}
            disabled={disabled}
            className="mb-2 block w-full text-sm"
            onChange={(e) => handleFileInput(e, "interview")}
          />
          {files.interviewLog && <p className="truncate text-xs text-gray-600">{files.interviewLog.name}</p>}
        </div>
        <div
          className={`rounded border-2 border-dashed p-4 transition ${drag === "flag" ? "border-blue-500 bg-blue-50" : "border-gray-300"}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag("flag");
          }}
          onDragLeave={() => setDrag(null)}
          onDrop={(e) => handleDrop(e, "flag")}
        >
          <p className="mb-2 text-sm font-medium text-gray-700">フラグリスト .xlsx</p>
          <input
            type="file"
            accept={ACCEPT.xlsx}
            disabled={disabled}
            className="mb-2 block w-full text-sm"
            onChange={(e) => handleFileInput(e, "flag")}
          />
          {files.flagList && <p className="truncate text-xs text-gray-600">{files.flagList.name}</p>}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">いずれか1つ以上を投入してください。</p>
    </section>
  );
}
