import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemberForm } from "@/components/ordilo/member-form";

describe("MemberForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the relationship list without needing to open 'Weitere Angaben'", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    expect(screen.getByTestId("relationship-list")).toBeInTheDocument();
  });

  it("submits a plain role when there is nobody else in the family yet", () => {
    const onSubmit = vi.fn();
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Emma" } });

    // No other members → the only thing to say is a role.
    fireEvent.click(screen.getByTestId("relationship-solo-row"));
    fireEvent.click(screen.getByTestId("solo-role-chip-Kind"));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Emma",
        relations: [{ role: "Kind", member_ids: [] }],
      }),
    );
  });

  it("collects one relationship per person — 'Mutter von Emma', 'Partnerin von Chris'", () => {
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

    fireEvent.click(screen.getByTestId("relationship-add"));
    fireEvent.click(screen.getByTestId("relationship-pick-mem-2"));
    fireEvent.click(screen.getByTestId("role-chip-Mutter"));

    fireEvent.click(screen.getByTestId("relationship-add"));
    fireEvent.click(screen.getByTestId("relationship-pick-mem-3"));
    fireEvent.click(screen.getByTestId("role-chip-Partner:in"));

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

  it("groups two people under the same role", () => {
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
          relations: [{ role: "Mutter", member_ids: ["mem-2"] }],
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("relationship-add"));
    fireEvent.click(screen.getByTestId("relationship-pick-mem-3"));
    fireEvent.click(screen.getByTestId("role-chip-Mutter"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [{ role: "Mutter", member_ids: ["mem-2", "mem-3"] }],
      }),
    );
  });

  it("shows saved relationships as one row per person and drops one via the picker", () => {
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
    expect(screen.getByTestId("relationship-row-mem-2")).toHaveTextContent("Emma");
    expect(screen.getByTestId("relationship-row-mem-3")).toHaveTextContent("Mutter");

    // Removing happens where the role is picked — one affordance per row.
    fireEvent.click(screen.getByTestId("relationship-row-mem-3"));
    fireEvent.click(screen.getByTestId("role-remove"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [{ role: "Mutter", member_ids: ["mem-2"] }],
      }),
    );
  });

  it("changes an existing role instead of adding a second one for the same person", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={onSubmit}
        otherMembers={[{ id: "mem-2", name: "Chris" }]}
        initialValues={{
          name: "Karina",
          relations: [{ role: "Schwester", member_ids: ["mem-2"] }],
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("relationship-row-mem-2"));
    fireEvent.click(screen.getByTestId("role-chip-Partner:in"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [{ role: "Partner:in", member_ids: ["mem-2"] }],
      }),
    );
  });

  it("changes a role in place, keeping the first relationship first", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={onSubmit}
        otherMembers={[
          { id: "mem-2", name: "Emma" },
          { id: "mem-3", name: "Chris" },
        ]}
        initialValues={{
          name: "Karina",
          relations: [
            { role: "Mutter", member_ids: ["mem-2"] },
            { role: "Schwester", member_ids: ["mem-3"] },
          ],
        }}
      />,
    );

    // Re-picking Emma's role must not push her behind Chris — the first
    // relationship is what becomes the person's primary role.
    fireEvent.click(screen.getByTestId("relationship-row-mem-2"));
    fireEvent.click(screen.getByTestId("role-chip-Tochter"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [
          { role: "Tochter", member_ids: ["mem-2"] },
          { role: "Schwester", member_ids: ["mem-3"] },
        ],
      }),
    );
  });

  it("keeps relationships whose person the list does not know", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={onSubmit}
        otherMembers={[{ id: "mem-2", name: "Emma" }]}
        initialValues={{
          name: "Karina",
          relations: [
            { role: "Mutter", member_ids: ["mem-2", "mem-unknown"] },
            { role: "Partner:in", member_ids: ["mem-gone"] },
          ],
        }}
      />,
    );

    // Editing something else must not delete what could not be rendered.
    fireEvent.click(screen.getByTestId("relationship-solo-row"));
    fireEvent.click(screen.getByTestId("solo-role-chip-Oma"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [
          { role: "Oma", member_ids: [] },
          { role: "Mutter", member_ids: ["mem-2", "mem-unknown"] },
          { role: "Partner:in", member_ids: ["mem-gone"] },
        ],
      }),
    );
  });

  it("takes a free-text role under 'Andere'", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Hinzufügen"
        onSubmit={onSubmit}
        otherMembers={[{ id: "mem-2", name: "Emma" }]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Uta" } });
    fireEvent.click(screen.getByTestId("relationship-add"));
    fireEvent.click(screen.getByTestId("relationship-pick-mem-2"));
    fireEvent.click(screen.getByTestId("role-chip-custom"));
    fireEvent.change(screen.getByTestId("role-custom-input"), {
      target: { value: "Patentante" },
    });
    fireEvent.click(screen.getByTestId("role-custom-confirm"));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: [{ role: "Patentante", member_ids: ["mem-2"] }],
      }),
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

  it("opens optional fields initially when saved optional values exist", () => {
    render(
      <MemberForm
        submitLabel="Speichern"
        onSubmit={vi.fn()}
        initialValues={{ birthdate: "01.02.2010" }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Weitere Angaben (optional)" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("preserves optional values across repeated close and open", () => {
    render(<MemberForm submitLabel="Hinzufügen" onSubmit={vi.fn()} />);
    const trigger = screen.getByRole("button", {
      name: "Weitere Angaben (optional)",
    });

    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Geburtsdatum"), {
      target: { value: "01.02.2010" },
    });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(screen.getByLabelText("Geburtsdatum")).toHaveValue("01.02.2010");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
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

  it("keeps the plain-role row available when other members exist", () => {
    const onSubmit = vi.fn();
    render(
      <MemberForm
        submitLabel="Hinzufügen"
        onSubmit={onSubmit}
        otherMembers={[{ id: "mem-2", name: "Emma" }]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Uta" } });

    // "Oma" without the grandchildren in Ordilo is still a thing to say.
    fireEvent.click(screen.getByTestId("relationship-solo-row"));
    fireEvent.click(screen.getByTestId("solo-role-chip-Oma"));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ relations: [{ role: "Oma", member_ids: [] }] }),
    );
  });

  it("excludes the member's own id from the people a relationship can point at", () => {
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
    fireEvent.click(screen.getByTestId("relationship-add"));
    expect(screen.queryByTestId("relationship-pick-mem-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("relationship-pick-mem-2")).toBeInTheDocument();
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
