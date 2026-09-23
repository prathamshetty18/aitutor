import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { AuthProvider } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Harmony — Your AI-Powered Academic Companion",
  description:
    "Harmony knows your grades AND your struggles. Mindful journaling, AI Chat, adaptive curriculum planner, and smart alerts.",
  icons: {
    icon: "/Project_logo.png",
    shortcut: "/Project_logo.png",
    apple: "/Project_logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
