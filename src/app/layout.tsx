import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "候補者情報取り込み | Candidate Intake",
  description: "PDF/面談ログ/フラグリストから共通解析→質問生成→FileMaker用Excel出力",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
