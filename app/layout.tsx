import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WTA - Wife Travel Assistant",
  description: "경완님과 완이를 위한 전용 여행 비서 앱",
  manifest: "/manifest.json?v=2", // 버저닝 추가
  icons: {
    icon: "/icon.png?v=2",
    apple: "/icon.png?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="apple-touch-icon" href="/icon.png?v=2" />
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body>{children}</body>
    </html>
  );
}