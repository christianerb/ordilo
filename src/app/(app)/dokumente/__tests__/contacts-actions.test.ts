import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/actions/result", () => ({
  FRIENDLY_ERROR: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
  getUserFamily: vi.fn(),
}));

import { deleteContact } from "@/app/(app)/dokumente/actions";
import { getUserFamily } from "@/lib/actions/result";
import { createClient } from "@/lib/supabase/server";

const FAMILY_ID = "family-1";

function mockContactUpdate(result: {
  data: { id: string } | null;
  error: Error | null;
}) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({ update }));

  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue({ from });
  return { from, update, query };
}

describe("deleteContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFamily as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: FAMILY_ID },
      error: null,
    });
  });

  it("marks only the family contact as dismissed", async () => {
    const { from, update, query } = mockContactUpdate({
      data: { id: "contact-1" },
      error: null,
    });

    const result = await deleteContact("contact-1");

    expect(result).toEqual({
      success: true,
      data: { id: "contact-1" },
    });
    expect(from).toHaveBeenCalledWith("contacts");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        source_key: null,
        status: "dismissed",
        user_edited_at: expect.any(String),
      }),
    );
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", "contact-1");
    expect(query.eq).toHaveBeenNthCalledWith(2, "family_id", FAMILY_ID);
  });

  it("fails when no family-scoped contact was updated", async () => {
    mockContactUpdate({ data: null, error: null });

    const result = await deleteContact("contact-outside-family");

    expect(result).toEqual({
      success: false,
      error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    });
  });
});
