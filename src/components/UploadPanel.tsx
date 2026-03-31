"use client";

import { useCallback, useRef, useState } from "react";

export interface UploadFiles {
  pdf: File | null;
  interviewLog: File | null;
}

const ACCEPT_ALL = ".pdf,application/pdf,.txt,text/plain";

function categorizeFiles(fileList: FileList | null): UploadFiles {
  const result: UploadFiles = { pdf: null, interviewLog: null };
  if (!fileList || fileList.length === 0) return result;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const name = file.name.toLowerCase();
    const type = file.type;
    if (!result.pdf && (type === "application/pdf" || name.endsWith(".pdf"))) {
      result.pdf = file;
    } else if (!result.interviewLog && (type === "text/plain" || name.endsWith(".txt"))) {
      result.interviewLog = file;
    }
  }
  return result;
}

export function UploadPanel({
  files,
  onFilesChange,
  disabled,
  showTitle = true,
}: {
  files: UploadFiles;
  onFilesChange: (f: UploadFiles) => void;
  disabled?: boolean;
  /** セクション見出し「2. ファイルをアップロード」を表示するか（登録ページでは false） */
  showTitle?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const applyFiles = useCallback(
    (fileList: FileList | null) => {
      const next = categorizeFiles(fileList);
      onFilesChange(next);
    },
    [onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      if (disabled) return;
      applyFiles(e.dataTransfer.files);
    },
    [disabled, applyFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      applyFiles(e.target.files);
      e.target.value = "";
    },
    [applyFiles]
  );

  const handleClick = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  return (
    <section className="rounded-lg border border-gray-300 bg-white p-4 shadow-sm">
      {showTitle && (
        <h2 className="mb-3 text-lg font-semibold">2. ファイルをアップロード</h2>
      )}
      <div
        className={`flex min-h-[140px] flex-col justify-center rounded border-2 border-dashed p-6 transition ${
          drag ? "border-blue-500 bg-blue-50" : "border-gray-300"
        } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="ファイルを選択またはドロップ"
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ALL}
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={handleFileInput}
        />
        <p className="mb-1 text-sm font-medium text-gray-700">
          ここにファイルをドラッグ＆ドロップ、またはクリックして選択
        </p>
        <p className="text-xs text-gray-500">
          履歴書PDF・面談ログ（.txt）をまとめて選べます。いずれか1つ以上必要です。
        </p>
      </div>
      <div className="mt-3 space-y-1 text-sm text-gray-600">
        <p className="flex items-center gap-1">
          <span className="font-medium">履歴書 PDF:</span>{" "}
          {files.pdf ? (
            <>
              {files.pdf.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilesChange({ ...files, pdf: null });
                  }}
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-300 text-xs text-gray-600 hover:bg-red-400 hover:text-white"
                  aria-label="PDFを削除"
                >
                  &times;
                </button>
              )}
            </>
          ) : "未選択"}
        </p>
        <p className="flex items-center gap-1">
          <span className="font-medium">面談ログ .txt:</span>{" "}
          {files.interviewLog ? (
            <>
              {files.interviewLog.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFilesChange({ ...files, interviewLog: null });
                  }}
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gray-300 text-xs text-gray-600 hover:bg-red-400 hover:text-white"
                  aria-label="面談ログを削除"
                >
                  &times;
                </button>
              )}
            </>
          ) : "未選択"}
        </p>
      </div>
    </section>
  );
}
