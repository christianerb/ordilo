import { GraduationCap, FileText, Receipt } from "lucide-react-native";

import { getDocumentKind, isDocumentType } from "../lib/document-kind";

describe("document kinds", () => {
  it("maps every known type to its icon and German label", () => {
    expect(getDocumentKind("school")).toMatchObject({
      icon: GraduationCap,
      label: "Schule",
    });
    expect(getDocumentKind("invoice")).toMatchObject({
      icon: Receipt,
      label: "Rechnung",
    });
  });

  it("falls back to the plain document for unknown or missing types", () => {
    expect(getDocumentKind(null)).toMatchObject({ icon: FileText, label: "Sonstiges" });
    expect(getDocumentKind("whatever")).toMatchObject({ icon: FileText });
    expect(isDocumentType("tax")).toBe(true);
    expect(isDocumentType("pdf")).toBe(false);
  });
});
