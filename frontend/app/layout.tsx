import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./leaderboard.css";
import "./models.css";
import "./catalog-workspace.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceProvider } from "@/components/workspace-context";

const sans = localFont({src: "../public/aside/geist.woff2", variable: "--font-geist-sans", weight: "100 900", display: "swap"});
export const metadata: Metadata = {title: "Selea", description: "Selea dashboard."};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en" className={`${sans.variable} dark`}><body><TooltipProvider><WorkspaceProvider>{children}</WorkspaceProvider></TooltipProvider><Toaster theme="dark" /></body></html>;
}
