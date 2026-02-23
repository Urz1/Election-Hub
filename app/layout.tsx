import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1e293b",
};

export const metadata: Metadata = {
  title: "ElectHub | Election Management Platform",
  description: "Create, manage, and run secure elections with region-based access control and live dashboards.",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ElectHub" },
  authors: [{ name: "Sadam Husen Ali", url: "https://sadam.tech" }],
  creator: "Sadam Husen Ali",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
