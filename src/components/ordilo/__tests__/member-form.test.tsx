import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemberForm } from "@/components/ordilo/member-form";

describe("MemberForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the role chips without needing to open 'Weitere Angaben'", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("relationship-editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kind" })).toBeInTheDocument();
  });

  it("submits the name and a role picked via chip as a relation", () => {
    const onSubmit = vi.fn();
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Emma" } });
    fireEvent.click(screen.getByRole("button", { name: "Kind" }));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Emma",
        relations: [{ role: "Kind", member_ids: [] }],
      }),
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
      expect.objectContaining({ name: "Emma", relations: [] }),
    );
  });

  it("keeps a pre-existing custom role, editable as free text", () => {
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={vi.fn()}
        initialValues={{ name: "Emma", relations: [{ role: "Tante", member_ids: [] }] }}
      />,
    );
    fireEvent.click(screen.getByTestId("relationship-summary-0"));
    expect(screen.getByTestId("relationship-custom-role-0")).toHaveValue("Tante");
  });

  it("collects several relations at once — 'Mutter von Emma' and 'Partnerin von Chris'", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Hinzufügen"
        onSubmit={onSubmit}
        otherMembers={[
          { id: "mem-2", name: "Emma" },
          { id: "mem-3", name: "Chris" },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Karina" } });

    fireEvent.click(screen.getByRole("button", { name: "Mutter" }));
    fireEvent.click(screen.getByTestId("relationship-member-0-mem-2"));
    fireEvent.click(screen.getByTestId("relationship-done-0"));

    fireEvent.click(screen.getByTestId("relationship-add"));
    fireEvent.click(screen.getByRole("button", { name: "Partner:in" }));
    fireEvent.click(screen.getByTestId("relationship-member-1-mem-3"));
    fireEvent.click(screen.getByTestId("relationship-done-1"));

    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Karina",
        relations: [
          { role: "Mutter", member_ids: ["mem-2"] },
          { role: "Partner:in", member_ids: ["mem-3"] },
        ],
      }),
    );
  });

  it("shows a saved relation as a sentence and removes it on demand", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={onSubmit}
        otherMembers={[
          { id: "mem-2", name: "Emma" },
          { id: "mem-3", name: "Hanna" },
        ]}
        initialValues={{
          name: "Karina",
          relations: [{ role: "Mutter", member_ids: ["mem-2", "mem-3"] }],
        }}
      />,
    );
    expect(screen.getByTestId("relationship-summary-0")).toHaveTextContent(
      "Mutter von Emma und Hanna",
    );

    fireEvent.click(screen.getByTestId("relationship-remove-0"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ relations: [] }),
    );
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

  it("offers no people to relate to when there are no other members", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    expect(screen.queryByText("von (optional)")).not.toBeInTheDocument();
    // The role chips still work — a lone person simply has a role.
    expect(screen.getByRole("button", { name: "Mutter" })).toBeInTheDocument();
  });

  it("submits a free-text role entered under 'Andere'", () => {
    const onSubmit = vi.fn();
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Uta" } });
    fireEvent.click(screen.getByRole("button", { name: "Andere" }));
    fireEvent.change(screen.getByTestId("relationship-custom-role-0"), {
      target: { value: "Patentante" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [{ role: "Patentante", member_ids: [] }],
      }),
    );
  });

  it("excludes the member's own id from the people a relation can point at", () => {
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
    expect(screen.queryByTestId("relationship-member-0-mem-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("relationship-member-0-mem-2")).toBeInTheDocument();
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
