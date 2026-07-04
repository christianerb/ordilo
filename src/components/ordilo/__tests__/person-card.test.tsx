import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PersonCard } from "@/components/ordilo/person-card";

describe("PersonCard", () => {
  // ---------------------------------------------------------------------------
  // Basic rendering
  // ---------------------------------------------------------------------------

  it("renders the member's name", () => {
    render(<PersonCard name="Emma" />);
    expect(screen.getByText("Emma")).toBeDefined();
  });

  it("renders the role when provided", () => {
    render(<PersonCard name="Emma" role="Kind" />);
    expect(screen.getByText("Kind")).toBeDefined();
  });

  it("omits the role line when role is null", () => {
    render(<PersonCard name="Emma" role={null} />);
    expect(screen.queryByText("null")).toBeNull();
    expect(screen.queryByText("undefined")).toBeNull();
  });

  it("omits the role line when role is an empty string", () => {
    const { container } = render(<PersonCard name="Emma" role="" />);
    // Only the name <p> should be present — no role <p>.
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Emma");
  });

  it("shows the first letter of the name as the avatar initial", () => {
    render(<PersonCard name="Emma" />);
    expect(screen.getByText("E")).toBeDefined();
  });

  it("uppercases the avatar initial", () => {
    render(<PersonCard name="emma" />);
    expect(screen.getByText("E")).toBeDefined();
  });

  it("uses '?' as the avatar initial for an empty name", () => {
    render(<PersonCard name="" />);
    expect(screen.getByText("?")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Avatar color
  // ---------------------------------------------------------------------------

  it("applies the avatarColor as the background of the avatar circle", () => {
    render(<PersonCard name="Emma" avatarColor="#E46018" />);
    const avatar = screen.getByText("E").closest("div");
    expect(avatar?.style.backgroundColor).toBe("rgb(228, 96, 24)");
  });

  it("falls back to the default petrol color when avatarColor is null", () => {
    render(<PersonCard name="Emma" avatarColor={null} />);
    const avatar = screen.getByText("E").closest("div");
    // Deep Petrol #305460 → rgb(48, 84, 96)
    expect(avatar?.style.backgroundColor).toBe("rgb(48, 84, 96)");
  });

  // ---------------------------------------------------------------------------
  // Birthdate (German format)
  // ---------------------------------------------------------------------------

  it("displays the birthdate in German format (DD.MM.YYYY)", () => {
    render(<PersonCard name="Emma" birthdate="2018-03-12" />);
    expect(screen.getByText("12.03.2018")).toBeDefined();
  });

  it("omits the birthdate when null", () => {
    render(<PersonCard name="Emma" birthdate={null} />);
    // No German-format date should appear.
    expect(screen.queryByText(/\d{2}\.\d{2}\.\d{4}/)).toBeNull();
  });

  it("omits the birthdate when not provided", () => {
    render(<PersonCard name="Emma" />);
    expect(screen.queryByText(/\d{2}\.\d{2}\.\d{4}/)).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Click / navigation
  // ---------------------------------------------------------------------------

  it("calls onClick when the card is clicked (display-only mode)", () => {
    const onClick = vi.fn();
    render(<PersonCard name="Emma" onClick={onClick} />);
    // The card content is inside a button.
    const button = screen.getByText("Emma").closest("button");
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as a div (not a button) when no callbacks are provided", () => {
    render(<PersonCard name="Emma" />);
    const nameElement = screen.getByText("Emma");
    // No button should wrap the content.
    expect(nameElement.closest("button")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Edit / Remove actions
  // ---------------------------------------------------------------------------

  it("renders an edit button when onEdit is provided", () => {
    const onEdit = vi.fn();
    render(<PersonCard name="Emma" onEdit={onEdit} />);
    const editButton = screen.getByRole("button", { name: /bearbeiten/i });
    expect(editButton).toBeDefined();
  });

  it("renders a remove button when onRemove is provided", () => {
    const onRemove = vi.fn();
    render(<PersonCard name="Emma" onRemove={onRemove} />);
    const removeButton = screen.getByRole("button", { name: /entfernen/i });
    expect(removeButton).toBeDefined();
  });

  it("calls onEdit when the edit button is clicked", () => {
    const onEdit = vi.fn();
    render(<PersonCard name="Emma" onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onRemove when the remove button is clicked", () => {
    const onRemove = vi.fn();
    render(<PersonCard name="Emma" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /entfernen/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when the edit button is clicked", () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    render(<PersonCard name="Emma" onClick={onClick} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: /bearbeiten/i }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when the remove button is clicked", () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(<PersonCard name="Emma" onClick={onClick} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: /entfernen/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not render action buttons when onEdit and onRemove are not provided", () => {
    render(<PersonCard name="Emma" />);
    expect(screen.queryByRole("button", { name: /bearbeiten/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /entfernen/i })).toBeNull();
  });
});
