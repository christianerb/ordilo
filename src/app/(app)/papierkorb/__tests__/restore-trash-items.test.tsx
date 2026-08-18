import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { RestoreTrashItems } from "../restore-trash-items";

const documentItem = {
  item_type: "document",
  id: "doc-1",
  label: "Schulbrief",
  deleted_at: "2026-08-10T10:00:00.000Z",
};

const taskItem = {
  item_type: "task",
  id: "task-1",
  label: "Schulsachen kaufen",
  deleted_at: "2026-08-11T10:00:00.000Z",
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: true, error: null });
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("RestoreTrashItems", () => {
  it("restores a document and removes it from the list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );
    render(<RestoreTrashItems items={[documentItem]} />);

    fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));

    await waitFor(() => expect(screen.queryByText("Schulbrief")).toBeNull());
    expect(fetch).toHaveBeenCalledWith("/api/documents/doc-1/restore", {
      method: "POST",
    });
    expect(toast.success).toHaveBeenCalledWith("Dokument wiederhergestellt");
  });

  it("restores a task through the dedicated RPC", async () => {
    render(<RestoreTrashItems items={[taskItem]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    });

    expect(mockRpc).toHaveBeenCalledWith("restore_task", {
      p_task_id: "task-1",
    });
    expect(screen.queryByText("Schulsachen kaufen")).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Aufgabe wiederhergestellt");
  });

  it("keeps the item visible when restoring fails", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });
    render(<RestoreTrashItems items={[taskItem]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Wiederherstellen" }));
    });

    expect(screen.getByText("Schulsachen kaufen")).toBeDefined();
    expect(toast.error).toHaveBeenCalledWith(
      "Wiederherstellen hat nicht geklappt.",
    );
  });
});
