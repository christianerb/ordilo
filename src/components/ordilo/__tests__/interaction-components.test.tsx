import { fireEvent, render, screen } from "@testing-library/react";
import { Check, Copy, Folder, NotebookPen } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { CollectionFolder } from "@/components/ordilo/collection-folder";
import { OrdiloActionSwap } from "@/components/ordilo/ordilo-action-swap";
import { OrdiloDisclosure } from "@/components/ordilo/ordilo-disclosure";
import { OtpCodeInput } from "@/components/ordilo/otp-code-input";
import { OrdiloSegmentedNav } from "@/components/ordilo/ordilo-segmented-nav";

describe("Ordilo interaction components", () => {
  it("discloses secondary information on request", () => {
    render(
      <OrdiloDisclosure title="Weitere Angaben" testId="details">
        <p>Steuer-ID Hanna</p>
      </OrdiloDisclosure>,
    );

    const trigger = screen.getByRole("button", { name: "Weitere Angaben" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Steuer-ID Hanna")).toBeDefined();
  });

  it("distributes a pasted code across the remaining OTP fields", () => {
    const onChange = vi.fn();
    render(
      <OtpCodeInput
        value=""
        onChange={onChange}
        label="Anmelde-Codes"
      />,
    );

    fireEvent.paste(screen.getByLabelText("Ziffer 1 des Anmelde-Codes"), {
      clipboardData: { getData: () => "123456" },
    });

    expect(onChange).toHaveBeenCalledWith("123456");
  });

  it("acknowledges a completed action without adding another surface", () => {
    const { rerender } = render(
      <OrdiloActionSwap
        active={false}
        idleLabel="Kopieren"
        activeLabel="Kopiert"
        IdleIcon={Copy}
        ActiveIcon={Check}
      />,
    );
    expect(screen.getByText("Kopieren")).toBeDefined();

    rerender(
      <OrdiloActionSwap
        active
        idleLabel="Kopieren"
        activeLabel="Kopiert"
        IdleIcon={Copy}
        ActiveIcon={Check}
      />,
    );
    expect(screen.getByText("Kopiert")).toBeDefined();
  });

  it("renders a collection as a calm folder cover", () => {
    render(
      <CollectionFolder
        name="Versicherungen"
        documentCount={2}
        Icon={Folder}
        color={{ bg: "#F1EEE8", fg: "#305460" }}
      />,
    );

    expect(screen.getByTestId("collection-folder")).toBeDefined();
    expect(screen.getByText("2 Dokumente")).toBeDefined();
  });

  it("exposes stable URL-driven morphing tabs", () => {
    render(
      <OrdiloSegmentedNav
        label="Ansicht in Dokumente"
        items={[
          { href: "/dokumente", label: "Dokumente", active: false },
          { href: "/dokumente?tab=notizen", label: "Notizen", active: true },
          { href: "/dokumente?tab=kontakte", label: "Kontakte", active: false },
        ]}
        testId="document-tabs"
        variant="morphing"
      />,
    );

    expect(screen.getByRole("navigation", { name: "Ansicht in Dokumente" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Notizen" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Kontakte" })).toHaveAttribute(
      "href",
      "/dokumente?tab=kontakte",
    );
  });

  it("aligns icons and counts in the default segmented tabs", () => {
    render(
      <OrdiloSegmentedNav
        label="Dokumentansicht"
        items={[
          {
            href: "/dokumente?tab=notizen",
            label: "Notizen",
            active: true,
            icon: NotebookPen,
            count: 3,
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "Notizen 3" });
    expect(link).toHaveClass(
      "flex",
      "items-center",
      "justify-center",
      "gap-1.5",
    );
    expect(link.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("3")).toHaveClass("sm:inline");
  });
});
