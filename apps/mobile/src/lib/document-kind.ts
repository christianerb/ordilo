import {
  FileText,
  GraduationCap,
  KeyRound,
  Landmark,
  Mail,
  NotebookPen,
  Receipt,
  ShieldCheck,
  Stethoscope,
  FilePen,
  type LucideIcon,
} from "lucide-react-native";

import { documentTypeLabels, type DocumentType } from "./document-review";
import { colors } from "../theme/tokens";

/**
 * How a document kind looks at a glance: one icon and one quiet tint per
 * kind, so a list of letters, bills and school notes reads by shape
 * before anyone reads a title. Tints stay inside the paper palette —
 * the icon carries the meaning, the tint only groups.
 */
export interface DocumentKindAppearance {
  icon: LucideIcon;
  label: string;
  /** Background of the leading tile. */
  tint: string;
  /** Icon colour on that tile. */
  ink: string;
}

const APPEARANCES: Record<DocumentType, Omit<DocumentKindAppearance, "label">> = {
  invoice: { icon: Receipt, tint: colors.washApricot, ink: "#9A4A12" },
  letter: { icon: Mail, tint: colors.washBlue, ink: colors.harborBlue },
  contract: { icon: FilePen, tint: colors.sandWarm, ink: "#6B5330" },
  medical: { icon: Stethoscope, tint: "#F4E1E1", ink: "#9E3B3B" },
  school: { icon: GraduationCap, tint: colors.washSage, ink: "#2F6B52" },
  insurance: { icon: ShieldCheck, tint: colors.washBlue, ink: colors.harborBlueDark },
  tax: { icon: Landmark, tint: colors.sandWarm, ink: "#6B5330" },
  credentials: { icon: KeyRound, tint: "#EAE4F2", ink: "#5E4A80" },
  note: { icon: NotebookPen, tint: colors.washSageSoft, ink: "#2F6B52" },
  other: { icon: FileText, tint: colors.sandLight, ink: colors.mistDark },
};

const KNOWN = new Set<string>(Object.keys(APPEARANCES));

export function isDocumentType(value: string | null | undefined): value is DocumentType {
  return typeof value === "string" && KNOWN.has(value);
}

export function getDocumentKind(
  documentType: string | null | undefined,
): DocumentKindAppearance {
  const type: DocumentType = isDocumentType(documentType) ? documentType : "other";
  return { ...APPEARANCES[type], label: documentTypeLabels[type] };
}
