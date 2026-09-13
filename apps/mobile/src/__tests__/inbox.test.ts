import {
  deriveInboxStatus,
  formatInboxReceivedAt,
  INBOX_STATUS_LABELS,
  loadInboxEmails,
} from "../lib/inbox";

const mockFrom = jest.fn();

jest.mock("../lib/supabase", () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

/** A chainable Supabase query that resolves to the given result when awaited. */
function queryResolving(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "order", "limit"]) {
    query[method] = jest.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => void) => resolve(result);
  return query as Record<string, jest.Mock> & { then: unknown };
}

const EMAIL_ROW = {
  id: "email-1",
  source_email_id: "provider-message-1",
  from_address: "schule@example.org",
  subject: "Elternabend im November",
  received_at: "2026-09-07T10:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("formatInboxReceivedAt", () => {
  const now = new Date("2026-09-07T12:00:00Z");

  it("uses human German steps from „Gerade eben“ to a date", () => {
    expect(formatInboxReceivedAt("2026-09-07T12:00:00Z", now)).toBe("Gerade eben");
    expect(formatInboxReceivedAt("2026-09-07T11:59:20Z", now)).toBe("Gerade eben");
    expect(formatInboxReceivedAt("2026-09-07T11:59:00Z", now)).toBe("vor 1 Minute");
    expect(formatInboxReceivedAt("2026-09-07T11:15:00Z", now)).toBe("vor 45 Minuten");
    expect(formatInboxReceivedAt("2026-09-07T11:00:00Z", now)).toBe("vor 1 Stunde");
    expect(formatInboxReceivedAt("2026-09-07T08:00:00Z", now)).toBe("vor 4 Stunden");
    expect(formatInboxReceivedAt("2026-09-06T12:00:00Z", now)).toBe("Gestern");
    expect(formatInboxReceivedAt("2026-09-04T12:00:00Z", now)).toBe("vor 3 Tagen");
  });

  it("falls back to a German date after a week", () => {
    const label = formatInboxReceivedAt("2026-08-20T12:00:00Z", now);
    expect(label).toContain("2026");
    expect(label).toContain("August");
  });

  it("never breaks on unreadable or future timestamps", () => {
    expect(formatInboxReceivedAt("bald", now)).toBe("");
    expect(formatInboxReceivedAt("2026-09-07T13:00:00Z", now)).toBe("Gerade eben");
  });
});

describe("deriveInboxStatus", () => {
  it("lets an unanswered suggestion win over everything else", () => {
    expect(deriveInboxStatus({ pendingSuggestions: 2, documentId: "doc-1" })).toBe("new_suggestions");
    expect(deriveInboxStatus({ pendingSuggestions: 1, documentId: null })).toBe("new_suggestions");
  });

  it("marks emails with a library document and settled ones", () => {
    expect(deriveInboxStatus({ pendingSuggestions: 0, documentId: "doc-1" })).toBe("in_library");
    expect(deriveInboxStatus({ pendingSuggestions: 0, documentId: null })).toBe("filed");
  });

  it("has a plain German label for every status", () => {
    expect(INBOX_STATUS_LABELS).toEqual({
      new_suggestions: "Neue Vorschläge",
      in_library: "In der Ablage",
      filed: "Abgelegt",
    });
  });
});

describe("loadInboxEmails", () => {
  it("returns an empty list without touching other tables when no mail arrived", async () => {
    mockFrom.mockReturnValue(queryResolving({ data: [], error: null }));

    await expect(loadInboxEmails("fam-1")).resolves.toEqual([]);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("inbound_emails");
  });

  it("asks for the family's emails newest first and keeps deleted ones out", async () => {
    const emailsQuery = queryResolving({ data: [], error: null });
    mockFrom.mockReturnValue(emailsQuery);

    await loadInboxEmails("fam-1");

    expect(emailsQuery.eq).toHaveBeenCalledWith("family_id", "fam-1");
    expect(emailsQuery.neq).toHaveBeenCalledWith("retention", "deleted");
    expect(emailsQuery.order).toHaveBeenCalledWith("received_at", { ascending: false });
  });

  it("joins pending suggestions and the linked document into a status per email", async () => {
    const emailsQuery = queryResolving({
      data: [
        EMAIL_ROW,
        { ...EMAIL_ROW, id: "email-2", source_email_id: "provider-message-2", subject: "Rechnung" },
        { ...EMAIL_ROW, id: "email-3", source_email_id: "provider-message-3", subject: "" },
      ],
      error: null,
    });
    const suggestionsQuery = queryResolving({
      data: [
        { inbound_email_id: "email-1", status: "pending" },
        { inbound_email_id: "email-1", status: "dismissed" },
      ],
      error: null,
    });
    const documentsQuery = queryResolving({
      data: [{ id: "doc-9", source_email_id: "provider-message-2" }],
      error: null,
    });
    mockFrom.mockImplementation((table: string) =>
      table === "inbound_emails"
        ? emailsQuery
        : table === "inbound_suggestions"
          ? suggestionsQuery
          : documentsQuery,
    );

    const emails = await loadInboxEmails("fam-1");

    expect(emails).toEqual([
      {
        id: "email-1",
        subject: "Elternabend im November",
        fromAddress: "schule@example.org",
        receivedAt: "2026-09-07T10:00:00Z",
        pendingSuggestions: 1,
        documentId: null,
        status: "new_suggestions",
      },
      {
        id: "email-2",
        subject: "Rechnung",
        fromAddress: "schule@example.org",
        receivedAt: "2026-09-07T10:00:00Z",
        pendingSuggestions: 0,
        documentId: "doc-9",
        status: "in_library",
      },
      {
        id: "email-3",
        subject: "",
        fromAddress: "schule@example.org",
        receivedAt: "2026-09-07T10:00:00Z",
        pendingSuggestions: 0,
        documentId: null,
        status: "filed",
      },
    ]);
  });

  it("surfaces a plain German error when a query fails", async () => {
    mockFrom.mockReturnValue(queryResolving({ data: null, error: { message: "RLS" } }));

    await expect(loadInboxEmails("fam-1")).rejects.toThrow(
      "Die eingegangene Post konnte nicht geladen werden. Bitte versuch es nochmal.",
    );
  });
});
