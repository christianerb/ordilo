import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { UploadProgressCard, type UploadState } from "../upload-progress";

function makeUpload(overrides: Partial<UploadState> = {}): UploadState {
  return {
    id: "upload-1",
    file: new File(["document"], "mietvertrag.pdf", {
      type: "application/pdf",
    }),
    progress: 42,
    phase: "uploading",
    ...overrides,
  };
}

describe("UploadProgressCard", () => {
  it("shows the animated upload icon while a document uploads", () => {
    render(
      <UploadProgressCard
        upload={makeUpload()}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId("animated-upload-icon")).toBeInTheDocument();
    expect(screen.getByTestId("progress-bar")).toHaveStyle({ width: "42%" });
  });

  it("does not show the animated upload icon while the document is processed", () => {
    render(
      <UploadProgressCard
        upload={makeUpload({ phase: "processing" })}
        onRetry={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("animated-upload-icon")).not.toBeInTheDocument();
  });
});
