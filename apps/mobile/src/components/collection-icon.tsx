import {
  Briefcase,
  Building2,
  Car,
  FileText,
  GraduationCap,
  Heart,
  Home,
  Receipt,
  Shield,
  Wallet,
  type LucideIcon,
  type LucideProps,
} from "lucide-react-native";
import { createElement } from "react";

import {
  COLLECTION_ICON_OPTIONS,
  DEFAULT_COLLECTION_ICON_KEY,
} from "@/src/lib/collections";

/**
 * Maps collection icon keys to their Lucide components. Lives in the
 * component layer so the pure collections library stays loadable by Jest
 * without transforming lucide's ESM build. Keys must stay in sync with
 * COLLECTION_ICON_OPTIONS (and with src/lib/schemas/collections.ts on web).
 */
const ICONS_BY_KEY: Record<string, LucideIcon> = {
  "file-text": FileText,
  receipt: Receipt,
  building: Building2,
  shield: Shield,
  heart: Heart,
  "graduation-cap": GraduationCap,
  car: Car,
  home: Home,
  briefcase: Briefcase,
  wallet: Wallet,
};

for (const option of COLLECTION_ICON_OPTIONS) {
  if (!ICONS_BY_KEY[option.key]) {
    throw new Error(`Kein Icon für Sammlungs-Key "${option.key}" gemappt.`);
  }
}

/**
 * Renders a collection's icon. createElement keeps the dynamic lookup out
 * of JSX (react-hooks/static-components); unknown keys fall back to the
 * default document icon.
 */
export function CollectionIcon({
  iconKey,
  ...props
}: { iconKey: string | null | undefined } & LucideProps) {
  return createElement(
    (iconKey ? ICONS_BY_KEY[iconKey] : undefined) ??
      ICONS_BY_KEY[DEFAULT_COLLECTION_ICON_KEY],
    props,
  );
}

