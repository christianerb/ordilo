import {
  AlertCircle,
  Building2,
  CalendarClock,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import type { HomeInsight } from "@/lib/ai/insights";

/**
 * Canonical insight-key → icon map for the /home Hinweise surfaces
 * (today-hero.tsx and home-client.tsx render from this single source).
 */
export const INSIGHT_ICONS: Record<HomeInsight["icon"], LucideIcon> = {
  alert: AlertCircle,
  receipt: Receipt,
  building: Building2,
  calendar: CalendarClock,
};
