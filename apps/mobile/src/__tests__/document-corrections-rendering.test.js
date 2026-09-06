/* global jest, describe, it, expect, beforeEach, afterEach */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Alert, TextInput } from "react-native";
import DocumentReviewScreen from "../../app/document/[id]";
import { ApiError } from "../lib/api";
import { loadDocumentReview } from "../lib/document-review";
import { loadCorrectionBaseline, saveDocumentCorrections } from "../lib/document-corrections";
import { refreshLibraryDocuments } from "../lib/library";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }), useLocalSearchParams: () => ({ id: "doc-1" }) }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn() }));
jest.mock("expo-linking", () => ({ canOpenURL: jest.fn(), openURL: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock("react-native-reanimated", () => ({ __esModule: true, default: { View: require("react-native").View } }));
jest.mock("lucide-react-native", () => new Proxy({}, { get: (_target, name) => name === "__esModule" ? true : String(name) }));
jest.mock("../theme/motion", () => ({ contentEntering: () => undefined }));
jest.mock("../components/ui", () => Object.fromEntries(["Card", "DetailTopBar", "EmptyState", "IconButton", "IconTile", "ListGroup", "ListRow", "ListSkeleton", "OrdiloButton", "Screen", "SectionHeader"].map((name) => [name, name])));
jest.mock("../components/offline-document-button", () => ({ OfflineDocumentButton: "OfflineDocumentButton" }));
jest.mock("../components/confirm-dialog", () => ({ ConfirmDialog: "ConfirmDialog" }));
jest.mock("../components/create-choice-sheet", () => ({ CreateChoiceSheet: "CreateChoiceSheet" }));
jest.mock("../components/ordilo-character", () => ({ OrdiloCharacter: "OrdiloCharacter" }));
jest.mock("../components/ordilo-mark", () => ({ OrdiloMark: "OrdiloMark" }));
jest.mock("../components/person", () => ({ PersonChip: "PersonChip" }));
jest.mock("../components/swipe-image-preview", () => ({ SwipeImagePreview: "SwipeImagePreview" }));
jest.mock("../lib/session", () => ({ useSession: () => ({ session: null }) }));
jest.mock("../lib/family-context", () => {
  const family = { id: "family-1" };
  return { useFamily: () => ({ family }) };
});
jest.mock("../lib/api", () => ({ ApiError: class ApiError extends Error { constructor(message, status) { super(message); this.status = status; } } }));
jest.mock("../lib/document-corrections", () => ({ loadCorrectionBaseline: jest.fn(), saveDocumentCorrections: jest.fn() }));
jest.mock("../lib/document-review", () => ({
  loadDocumentReview: jest.fn(), canReviewDocument: (status) => status === "analyzed",
  calendarEligibleDateIndices: () => [], defaultCalendarDateIndices: () => [], getDocumentConsequences: () => [],
  isImageFile: () => false, documentTypeLabels: { school: "Schule" },
}));
jest.mock("../lib/notifications", () => ({}));
jest.mock("../lib/scan", () => ({}));
jest.mock("../lib/feedback", () => ({ success: jest.fn(), fail: jest.fn(), select: jest.fn(), tap: jest.fn() }));
jest.mock("../lib/library", () => ({ refreshLibraryDocuments: jest.fn() }));
jest.mock("../lib/people", () => ({ resolveDocumentPeople: () => [] }));
jest.mock("../lib/tasks", () => ({ fetchFamilyMembers: async () => [] }));

function baseline() {
  return { revision: "revision-1", document: {
    status: "confirmed", created_at: "2026-09-01T12:00:00Z", confirmed_at: "2026-09-01T12:00:00Z",
    original_filename: "brief.pdf", mime_type: "application/pdf", page_count: 1,
    document_type: "school", title: "Ausflug", summary: "Ein Schulbrief", suggested_category: "Schule", tags: ["Ausflug"],
    credential_text: null, organizations: [{ name: "Grundschule", type: "school", confidence: 1 }], contacts: [],
    family_members: [{ name: "Emma", person_id: "person-1", confidence: 1 }],
    dates: [{ id: "date-1", date: "2026-10-01", label: "Ausflug", type: "event", confidence: 1 }],
    tasks: [{ id: "task-1", title: "Geld mitgeben", due_date: "2026-09-30", confidence: 1 }],
    amounts: [{ amount: "8", currency: "EUR", label: "Eintritt", kind: "total", value_date: null, confidence: 1 }],
    facts: [{ id: "fact-1", fact_type: "identifier", label: "Klasse", value: "3a", confidence: 1 }],
  } };
}

let tree;
let original;
const field = (label) => tree.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label);
const button = (title) => tree.root.findByProps({ title });
async function openEditor() {
  await act(async () => { tree = renderer.create(<DocumentReviewScreen />); });
  await act(async () => { tree.root.findAllByProps({ accessibilityLabel: "Angaben ändern" })[0].props.onPress(); });
  expect(loadCorrectionBaseline).toHaveBeenCalledWith("doc-1");
}
function change(label, value) { act(() => field(label).props.onChangeText(value)); }

beforeEach(() => {
  jest.clearAllMocks();
  original = baseline();
  loadDocumentReview.mockResolvedValue(original.document);
  loadCorrectionBaseline.mockResolvedValue(original);
  saveDocumentCorrections.mockResolvedValue(undefined);
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.restoreAllMocks(); });

describe("confirmed document corrections", () => {
  it("edits the confirmed metadata and saves stable IDs with the revision baseline", async () => {
    await openEditor();
    change("Name des Dokuments", "Tierpark");
    change("Zusammenfassung", "Korrigierter Schulbrief");
    change("Kategorie", "Familie");
    change("Person 1", "Hannah");
    change("Datum Termin 1", "2026-10-02");
    change("Bezeichnung Termin 1", "Tierparkbesuch");
    change("Aufgabe 1", "Erlaubnis mitgeben");
    change("Fälligkeitsdatum Aufgabe 1", "2026-10-01");
    change("Betrag 1", "12,50");
    change("Währung Betrag 1", "CHF");
    change("Kennung 1", "4b");
    change("Neues Schlagwort", "Wichtig");
    act(() => tree.root.findAllByProps({ accessibilityLabel: "Hinzufügen" })[0].props.onPress());
    saveDocumentCorrections.mockImplementation(async (_id, _baseline, draft) => { loadDocumentReview.mockResolvedValue(draft); });
    await act(async () => button("Änderungen speichern").props.onPress());
    expect(saveDocumentCorrections).toHaveBeenCalledTimes(1);
    const [id, savedBaseline, draft] = saveDocumentCorrections.mock.calls[0];
    expect(id).toBe("doc-1");
    expect(savedBaseline).toBe(original);
    expect(draft).toMatchObject({ title: "Tierpark", summary: "Korrigierter Schulbrief", suggested_category: "Familie", tags: ["Ausflug", "Wichtig"],
      family_members: [{ name: "Hannah", person_id: null }], dates: [{ id: "date-1", date: "2026-10-02", label: "Tierparkbesuch" }],
      tasks: [{ id: "task-1", title: "Erlaubnis mitgeben", due_date: "2026-10-01" }],
      amounts: [{ amount: "12,50", currency: "CHF", kind: "total" }], facts: [{ id: "fact-1", value: "4b" }],
      organizations: original.document.organizations,
    });
    expect(original.document.title).toBe("Ausflug");
    expect(original.document.dates[0].date).toBe("2026-10-01");
    expect(refreshLibraryDocuments).toHaveBeenCalledTimes(1);
    expect(loadDocumentReview).toHaveBeenCalledTimes(2);
    expect(field("Name des Dokuments")).toBeUndefined();
  });

  it("cancels all local metadata changes without saving", async () => {
    await openEditor();
    change("Name des Dokuments", "Nicht speichern");
    change("Betrag 1", "99");
    change("Person 1", "Andere Person");
    await act(async () => button("Abbrechen").props.onPress());
    expect(saveDocumentCorrections).not.toHaveBeenCalled();
    expect(field("Name des Dokuments")).toBeUndefined();
    const titles = tree.root.findAllByType(require("react-native").Text).map((node) => node.props.children);
    expect(titles).toContain("Ausflug");
    expect(titles).not.toContain("Nicht speichern");
    await act(async () => tree.root.findAllByProps({ accessibilityLabel: "Angaben ändern" })[0].props.onPress());
    expect(field("Betrag 1").props.value).toBe("8");
    expect(field("Person 1").props.value).toBe("Emma");
  });

  it("retains the entire draft after a conflict until the user explicitly reloads", async () => {
    await openEditor();
    change("Name des Dokuments", "Mein Entwurf");
    change("Betrag 1", "24");
    saveDocumentCorrections.mockRejectedValue(new ApiError("conflict", 409));
    await act(async () => button("Änderungen speichern").props.onPress());
    expect(Alert.alert).toHaveBeenCalledWith("Inzwischen geändert", expect.any(String), expect.any(Array));
    expect(field("Name des Dokuments").props.value).toBe("Mein Entwurf");
    expect(field("Betrag 1").props.value).toBe("24");
    expect(refreshLibraryDocuments).not.toHaveBeenCalled();
    expect(loadDocumentReview).toHaveBeenCalledTimes(1);
    const actions = Alert.alert.mock.calls.at(-1)[2];
    expect(actions[0]).toMatchObject({ text: "Eingaben behalten", style: "cancel" });
    loadDocumentReview.mockResolvedValue({ ...original.document, title: "Stand der Familie" });
    await act(async () => actions.find((action) => action.text === "Aktuellen Stand laden").onPress());
    expect(field("Name des Dokuments")).toBeUndefined();
    expect(loadDocumentReview).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(require("react-native").Text).map((node) => node.props.children)).toContain("Stand der Familie");
  });
});
