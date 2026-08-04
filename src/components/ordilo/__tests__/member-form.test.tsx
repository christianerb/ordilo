import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemberForm } from "@/components/ordilo/member-form";

describe("MemberForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the Rolle chips without needing to open 'Weitere Angaben'", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Rolle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kind" })).toBeInTheDocument();
  });

  it("submits name and the role picked via chip", () => {
    const onSubmit = vi.fn();
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Emma" } });
    fireEvent.click(screen.getByRole("button", { name: "Kind" }));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Emma", role: "Kind" }),
    );
  });

  it("clears the role when the selected chip is tapped again", () => {
    const onSubmit = vi.fn();
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Emma" } });
    const chip = screen.getByRole("button", { name: "Kind" });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Emma", role: "" }),
    );
  });

  it("shows a pre-existing custom role as an extra selected chip (edit mode)", () => {
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={vi.fn()}
        initialValues={{ name: "Emma", role: "Tante" }}
      />,
    );
    const customChip = screen.getByRole("button", { name: "Tante" });
    expect(customChip).toHaveAttribute("aria-pressed", "true");
  });

  it("does not show the photo section without a memberId (add mode)", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    expect(screen.queryByTestId("member-photo-button")).not.toBeInTheDocument();
  });

  it("shows the photo section when a memberId is provided (edit mode)", () => {
    render(
      <MemberForm submitLabel="Speichern" onSubmit={vi.fn()} memberId="mem-1" />,
    );
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    expect(screen.getByTestId("member-photo-button")).toBeInTheDocument();
  });

  it("opens a crop dialog after selecting a photo, then uploads the cropped result", async () => {
    const onPhotoChange = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.example.com/photo.jpg" }),
    });
    stubCanvasAndObjectUrls();
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={vi.fn()}
        memberId="mem-1"
        onPhotoChange={onPhotoChange}
      />,
    );
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("member-photo-input");
    fireEvent.change(input, { target: { files: [file] } });

    // Upload hasn't happened yet — the crop dialog is shown first.
    const cropImage = await screen.findByTestId("photo-crop-image");
    expect(global.fetch).not.toHaveBeenCalled();

    Object.defineProperties(cropImage, {
      naturalWidth: { value: 800, configurable: true },
      naturalHeight: { value: 600, configurable: true },
    });
    fireEvent.load(cropImage);

    fireEvent.click(screen.getByTestId("photo-crop-confirm"));

    await waitFor(() => {
      expect(onPhotoChange).toHaveBeenCalledWith("https://cdn.example.com/photo.jpg");
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/family-members/mem-1/photo",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows a German error message when the photo upload fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Datei zu groß." }),
    });
    stubCanvasAndObjectUrls();
    render(
      <MemberForm submitLabel="Speichern" onSubmit={vi.fn()} memberId="mem-1" />,
    );
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));

    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    const input = screen.getByTestId("member-photo-input");
    fireEvent.change(input, { target: { files: [file] } });

    const cropImage = await screen.findByTestId("photo-crop-image");
    Object.defineProperties(cropImage, {
      naturalWidth: { value: 800, configurable: true },
      naturalHeight: { value: 600, configurable: true },
    });
    fireEvent.load(cropImage);
    fireEvent.click(screen.getByTestId("photo-crop-confirm"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Datei zu groß.");
    });
  });

  it("removes a photo and calls onPhotoChange(null)", async () => {
    const onPhotoChange = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={vi.fn()}
        memberId="mem-1"
        photoUrl="https://cdn.example.com/old.jpg"
        onPhotoChange={onPhotoChange}
      />,
    );
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    fireEvent.click(screen.getByTestId("member-photo-remove"));

    await waitFor(() => {
      expect(onPhotoChange).toHaveBeenCalledWith(null);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/family-members/mem-1/photo",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("does not show the 'Beziehung zu' select when there are no other members", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    expect(screen.queryByLabelText("Beziehung zu")).not.toBeInTheDocument();
  });

  it("shows the relationship label input only after a related member is selected", () => {
    render(
      <MemberForm
        submitLabel="Hinzufügen"
        onSubmit={vi.fn()}
        otherMembers={[{ id: "mem-2", name: "Anna" }]}
      />,
    );
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    expect(screen.queryByTestId("member-relationship-label")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Beziehung zu"), {
      target: { value: "mem-2" },
    });
    expect(screen.getByTestId("member-relationship-label")).toBeInTheDocument();
  });

  it("submits the related member and relationship label", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Hinzufügen"
        onSubmit={onSubmit}
        otherMembers={[{ id: "mem-2", name: "Anna" }]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ben" } });
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    fireEvent.change(screen.getByLabelText("Beziehung zu"), {
      target: { value: "mem-2" },
    });
    fireEvent.change(screen.getByTestId("member-relationship-label"), {
      target: { value: "Ehepartner" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        related_member_id: "mem-2",
        relationship_label: "Ehepartner",
      }),
    );
  });

  it("excludes the member's own id from the 'Beziehung zu' options", () => {
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={vi.fn()}
        memberId="mem-1"
        otherMembers={[
          { id: "mem-1", name: "Emma" },
          { id: "mem-2", name: "Anna" },
        ]}
      />,
    );
    fireEvent.click(screen.getByText("Weitere Angaben (optional)"));
    const select = screen.getByLabelText("Beziehung zu") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).not.toContain("Emma");
    expect(optionLabels).toContain("Anna");
  });
});

/**
 * jsdom does not implement canvas rendering or object URLs. Stub just
 * enough of the crop dialog's canvas + toBlob pipeline for the "confirm
 * crop" path to run in tests.
 */
function stubCanvasAndObjectUrls() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: BlobCallback) => {
      callback(new Blob(["fake-jpeg"], { type: "image/jpeg" }));
    },
  );
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      value: () => "blob:mock",
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: () => {},
      configurable: true,
    });
  }
}
