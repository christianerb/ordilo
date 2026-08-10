import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openUploadPicker: vi.fn(),
  openCreateNote: vi.fn(),
  addCollection: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/scan/scan-context", () => ({
  useScanActions: () => ({
    openUploadPicker: mocks.openUploadPicker,
    openCreateNote: mocks.openCreateNote,
  }),
}));

vi.mock("@/lib/collections/collections-context", () => ({
  useCollections: () => ({ addCollection: mocks.addCollection }),
}));

import { ComposerActionSheet } from "@/components/ordilo/composer-action-sheet";

describe("ComposerActionSheet", () => {
  it("opens the device picker directly for a photo or PDF", () => {
    const onOpenChange = vi.fn();
    render(<ComposerActionSheet open onOpenChange={onOpenChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Foto oder PDF hochladen" }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.openUploadPicker).toHaveBeenCalledTimes(1);
  });
});
