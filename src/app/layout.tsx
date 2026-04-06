import type { Metadata } from "next";
import { Outfit, Space_Grotesk } from "next/font/google";
import { teamConfig } from "@/lib/team-config";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${teamConfig.teamName} | Forge612`,
  description: `${teamConfig.teamName} team portal — schedules, payments, and roster management powered by Forge612.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${spaceGrotesk.variable} antialiased`}
      style={{
        // @ts-expect-error CSS custom properties
        "--team-accent": teamConfig.accentColor,
        "--team-accent-light": teamConfig.accentColorLight,
      }}
    >
      <body className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
