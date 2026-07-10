"use client";

import {
  Files,
  Search,
  Users,
  ListTodo,
  type LucideIcon,
} from "lucide-react";

export interface NavTab {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_TABS: NavTab[] = [
  { label: "Dokumente", href: "/dokumente", icon: Files },
  { label: "Fragen", href: "/suche", icon: Search },
  { label: "Familie", href: "/familie", icon: Users },
  { label: "Aufgaben", href: "/aufgaben", icon: ListTodo },
];

export function isTabActive(tab: NavTab, pathname: string): boolean {
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

export function shouldShowNav(pathname: string): boolean {
  return pathname !== "/onboarding" && !pathname.startsWith("/onboarding/");
}

export interface SidebarCollection {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface SidebarProfile {
  familyName: string;
  email: string | null;
}

const SIDEBAR_COLLAPSED_KEY = "ordilo:sidebar-collapsed";

export function readCollapsedPreference(): boolean {
  try {
    return window.localStorage?.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeCollapsedPreference(value: boolean): void {
  try {
    window.localStorage?.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch {
    // Storage may be unavailable, non-fatal.
  }
}

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 17) return "day";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

export function getGreeting(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "Guten Morgen";
  if (hour >= 11 && hour < 18) return "Guten Tag";
  if (hour >= 18 && hour < 22) return "Guten Abend";
  return "Gute Nacht";
}

export const TIME_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export function getProfileDisplayName(profile: SidebarProfile): string {
  return profile.email?.split("@")[0] || profile.familyName;
}

export const DESKTOP_SHELL_SURFACE_STYLE = {
  backgroundColor: "var(--sand-light)",
  backgroundImage:
    "radial-gradient(140px circle at 26px -10px, color-mix(in srgb, var(--petrol) 3%, transparent), transparent 60%), radial-gradient(240px circle at 100% 105%, color-mix(in srgb, var(--petrol) 6%, transparent), transparent 70%), linear-gradient(180deg, var(--sand) 0%, var(--sand-light) 40%, var(--sand-warm) 100%)",
} as const;
