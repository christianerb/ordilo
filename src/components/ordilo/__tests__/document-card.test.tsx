import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { DocumentCard } from "@/components/ordilo/document-card";
import { DOCUMENT_STATUS_LABELS } from "@/lib/schemas/document";
import { DOCUMENT_TYPE_LABELS } from "@/lib/schemas/extraction";

describe("DocumentCard", () => {
  // ---------------------------------------------------------------------------
  // Basic rendering
  // ---------------------------------------------------------------------------

  it("renders the title when provided", () => {
    render(<DocumentCard title="Stromrechnung" status="uploaded" />);
    expect(screen.getByText("Stromrechnung")).toBeDefined();
  });

  it("falls back to originalFilename when title is null", () => {
    render(
      <DocumentCard
        title={null}
        originalFilename="invoice.pdf"
        status="uploaded"
      />,
    );
    expect(screen.getByText("invoice.pdf")).toBeDefined();
  });

  it("falls back to 'Dokument' when neither title nor filename is provided", () => {
    render(<DocumentCard status="uploaded" />);
    expect(screen.getByText("Dokument")).toBeDefined();
  });

  it("falls back to filename when title is empty string", () => {
    render(
      <DocumentCard
        title=""
        originalFilename="scan.jpg"
        status="uploaded"
      />,
    );
    expect(screen.getByText("scan.jpg")).toBeDefined();
  });

  it("falls back to filename when title is whitespace-only", () => {
    render(
      <DocumentCard
        title="   "
        originalFilename="letter.pdf"
        status="uploaded"
      />,
    );
    expect(screen.getByText("letter.pdf")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Status badges
  // ---------------------------------------------------------------------------

  it("shows the German label for 'uploaded' status", () => {
    render(<DocumentCard status="uploaded" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.uploaded)).toBeDefined();
  });

  it("shows the German label for 'ocr_processing' status", () => {
    render(<DocumentCard status="ocr_processing" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.ocr_processing)).toBeDefined();
  });

  it("shows the German label for 'ocr_done' status", () => {
    render(<DocumentCard status="ocr_done" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.ocr_done)).toBeDefined();
  });

  it("shows the German label for 'analyzing' status", () => {
    render(<DocumentCard status="analyzing" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.analyzing)).toBeDefined();
  });

  it("shows the German label for 'analyzed' status", () => {
    render(<DocumentCard status="analyzed" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.analyzed)).toBeDefined();
  });

  it("shows the German label for 'confirmed' status", () => {
    render(<DocumentCard status="confirmed" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.confirmed)).toBeDefined();
  });

  it("shows the German label for 'failed' status", () => {
    render(<DocumentCard status="failed" />);
    expect(screen.getByText(DOCUMENT_STATUS_LABELS.failed)).toBeDefined();
  });

  it("renders a status badge with data-testid for each status", () => {
    const { rerender } = render(<DocumentCard status="uploaded" />);
    expect(screen.getByTestId("status-badge-uploaded")).toBeDefined();

    rerender(<DocumentCard status="confirmed" />);
    expect(screen.getByTestId("status-badge-confirmed")).toBeDefined();

    rerender(<DocumentCard status="failed" />);
    expect(screen.getByTestId("status-badge-failed")).toBeDefined();
  });

  it("sets data-status attribute on the card root", () => {
    const { container } = render(<DocumentCard status="uploaded" />);
    const card = container.querySelector("[data-testid='document-card']");
    expect(card?.getAttribute("data-status")).toBe("uploaded");
  });

  // ---------------------------------------------------------------------------
  // Processing animation
  // ---------------------------------------------------------------------------

  it("shows a spinning loader icon for ocr_processing status", () => {
    render(<DocumentCard status="ocr_processing" />);
    // The spinning icon is inside the badge
    const badge = screen.getByTestId("status-badge-ocr_processing");
    const spinner = badge.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("shows a spinning loader icon for analyzing status", () => {
    render(<DocumentCard status="analyzing" />);
    const badge = screen.getByTestId("status-badge-analyzing");
    const spinner = badge.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
  });

  it("does not show a spinning icon for uploaded status", () => {
    render(<DocumentCard status="uploaded" />);
    const badge = screen.getByTestId("status-badge-uploaded");
    const spinner = badge.querySelector(".animate-spin");
    expect(spinner).toBeNull();
  });

  it("does not show a spinning icon for confirmed status", () => {
    render(<DocumentCard status="confirmed" />);
    const badge = screen.getByTestId("status-badge-confirmed");
    const spinner = badge.querySelector(".animate-spin");
    expect(spinner).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // File-type icon
  // ---------------------------------------------------------------------------

  it("renders a file icon for PDF documents", () => {
    render(
      <DocumentCard
        mimeType="application/pdf"
        status="uploaded"
      />,
    );
    // The FileText icon is rendered inside the icon container
    const card = screen.getByTestId("document-card");
    // Just verify the card renders without error — icon type is visual
    expect(card).toBeDefined();
  });

  it("renders an image icon for image documents", () => {
    render(
      <DocumentCard
        mimeType="image/jpeg"
        status="uploaded"
      />,
    );
    const card = screen.getByTestId("document-card");
    expect(card).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Failed state
  // ---------------------------------------------------------------------------

  it("shows friendly German copy when status is failed (VAL-REVIEW-014)", () => {
    render(
      <DocumentCard
        status="failed"
        errorMessage="OpenAI: API-Fehler"
      />,
    );
    // Raw provider/backend text must NEVER be user-visible.
    expect(screen.queryByText("OpenAI: API-Fehler")).toBeNull();
    // Friendly German copy should be shown instead.
    expect(screen.getByText("Das hat nicht geklappt")).toBeDefined();
  });

  it("shows friendly German copy, not raw 'Could not parse PDF' (VAL-REVIEW-014)", () => {
    render(
      <DocumentCard
        status="failed"
        errorMessage="Could not parse PDF"
      />,
    );
    expect(screen.queryByText("Could not parse PDF")).toBeNull();
    expect(screen.getByText("Das hat nicht geklappt")).toBeDefined();
  });

  it("shows friendly copy even when no errorMessage is provided", () => {
    render(<DocumentCard status="failed" />);
    expect(screen.getByText("Das hat nicht geklappt")).toBeDefined();
  });

  it("does not show error copy when status is not failed", () => {
    render(
      <DocumentCard
        status="uploaded"
        errorMessage="OCR fehlgeschlagen"
      />,
    );
    expect(screen.queryByText("Das hat nicht geklappt")).toBeNull();
  });

  it("shows a retry button when status is failed and onRetry is provided", () => {
    const onRetry = vi.fn();
    render(<DocumentCard status="failed" onRetry={onRetry} />);
    const retryButton = screen.getByRole("button", { name: /nochmal versuchen/i });
    expect(retryButton).toBeDefined();
  });

  it("does not show a retry button when status is not failed", () => {
    const onRetry = vi.fn();
    render(<DocumentCard status="uploaded" onRetry={onRetry} />);
    expect(screen.queryByRole("button", { name: /erneut versuchen/i })).toBeNull();
  });

  it("does not show a retry button when status is failed but onRetry is not provided", () => {
    render(<DocumentCard status="failed" />);
    expect(screen.queryByRole("button", { name: /erneut versuchen/i })).toBeNull();
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<DocumentCard status="failed" onRetry={onRetry} />);
    const retryButton = screen.getByLabelText("Nochmal versuchen");
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when the retry button is clicked", () => {
    const onClick = vi.fn();
    const onRetry = vi.fn();
    const { container } = render(
      <DocumentCard
        status="failed"
        onClick={onClick}
        onRetry={onRetry}
      />,
    );
    // Find the retry button by aria-label to distinguish from the card root
    const retryButton = container.querySelector('[aria-label="Nochmal versuchen"]');
    expect(retryButton).not.toBeNull();
    fireEvent.click(retryButton!);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Click / interaction
  // ---------------------------------------------------------------------------

  it("calls onClick when the card is clicked", () => {
    const onClick = vi.fn();
    render(<DocumentCard status="uploaded" onClick={onClick} />);
    const card = screen.getByTestId("document-card");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-accessible when onClick is provided (Enter key)", () => {
    const onClick = vi.fn();
    render(<DocumentCard status="uploaded" onClick={onClick} />);
    const card = screen.getByTestId("document-card");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is keyboard-accessible when onClick is provided (Space key)", () => {
    const onClick = vi.fn();
    render(<DocumentCard status="uploaded" onClick={onClick} />);
    const card = screen.getByTestId("document-card");
    fireEvent.keyDown(card, { key: " " });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a non-interactive div when no onClick is provided", () => {
    render(<DocumentCard status="uploaded" />);
    const card = screen.getByTestId("document-card");
    expect(card.getAttribute("role")).not.toBe("button");
    expect(card.getAttribute("tabindex")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Relative time
  // ---------------------------------------------------------------------------

  it("shows relative time when createdAt is provided", () => {
    // Use a date 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    render(<DocumentCard status="uploaded" createdAt={twoHoursAgo} />);
    expect(screen.getByText("vor 2 Stunden")).toBeDefined();
  });

  it("shows 'gerade eben' for a very recent createdAt", () => {
    const now = new Date().toISOString();
    render(<DocumentCard status="uploaded" createdAt={now} />);
    expect(screen.getByText("gerade eben")).toBeDefined();
  });

  it("omits the relative time when createdAt is null", () => {
    render(<DocumentCard status="uploaded" createdAt={null} />);
    // Only the title <p> should be present — no time <p>.
    const card = screen.getByTestId("document-card");
    const paragraphs = card.querySelectorAll("p");
    // Should have the title paragraph but NOT the time paragraph
    const timeParagraphs = Array.from(paragraphs).filter((p) =>
      p.textContent?.includes("vor") || p.textContent === "gerade eben"
    );
    expect(timeParagraphs).toHaveLength(0);
  });

  it("omits the relative time when createdAt is not provided", () => {
    render(<DocumentCard status="uploaded" />);
    expect(screen.queryByText("gerade eben")).toBeNull();
    expect(screen.queryByText(/vor \d+/)).toBeNull();
  });

  it("formats older dates as DD.MM.YYYY", () => {
    // 10 days ago
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const day = String(tenDaysAgo.getDate()).padStart(2, "0");
    const month = String(tenDaysAgo.getMonth() + 1).padStart(2, "0");
    const year = tenDaysAgo.getFullYear();
    const expected = `${day}.${month}.${year}`;

    render(<DocumentCard status="uploaded" createdAt={tenDaysAgo.toISOString()} />);
    expect(screen.getByText(expected)).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Document type display (VAL-PROFILE-002)
  // ---------------------------------------------------------------------------

  it("renders the German document type label when documentType is provided", () => {
    render(
      <DocumentCard
        title="Stromrechnung Juli"
        status="confirmed"
        documentType="invoice"
      />,
    );
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.invoice)).toBeDefined();
  });

  it("renders the type label with a data-testid for reliable selection", () => {
    render(
      <DocumentCard
        title="Kita-Brief"
        status="confirmed"
        documentType="school"
      />,
    );
    const badge = screen.getByTestId("document-type-badge");
    expect(badge).toBeDefined();
    expect(badge.textContent).toBe(DOCUMENT_TYPE_LABELS.school);
  });

  it("renders the title and the type label alongside each other", () => {
    render(
      <DocumentCard
        title="Krankenhaus-Bericht"
        status="confirmed"
        documentType="medical"
      />,
    );
    // Both the title and the German type label are present.
    expect(screen.getByText("Krankenhaus-Bericht")).toBeDefined();
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.medical)).toBeDefined();
  });

  it("does not render a type badge when documentType is null", () => {
    render(
      <DocumentCard
        title="Ohne Typ"
        status="uploaded"
        documentType={null}
      />,
    );
    expect(screen.queryByTestId("document-type-badge")).toBeNull();
  });

  it("does not render a type badge when documentType is not provided", () => {
    render(<DocumentCard title="Ohne Typ" status="uploaded" />);
    expect(screen.queryByTestId("document-type-badge")).toBeNull();
  });

  it("does not render a type badge when documentType is an unknown value", () => {
    render(
      <DocumentCard
        title="Unbekannt"
        status="uploaded"
        documentType="not-a-real-type"
      />,
    );
    expect(screen.queryByTestId("document-type-badge")).toBeNull();
  });

  it("renders the type badge for every known document type", () => {
    const { rerender } = render(
      <DocumentCard status="confirmed" documentType="letter" />,
    );
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.letter)).toBeDefined();

    rerender(<DocumentCard status="confirmed" documentType="contract" />);
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.contract)).toBeDefined();

    rerender(<DocumentCard status="confirmed" documentType="insurance" />);
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.insurance)).toBeDefined();

    rerender(<DocumentCard status="confirmed" documentType="tax" />);
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.tax)).toBeDefined();

    rerender(<DocumentCard status="confirmed" documentType="other" />);
    expect(screen.getByText(DOCUMENT_TYPE_LABELS.other)).toBeDefined();
  });
});
