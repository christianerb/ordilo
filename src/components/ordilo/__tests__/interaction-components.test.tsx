import { fireEvent, render, screen } from "@testing-library/react";
import { Check, Copy, Folder } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { CollectionFolder } from "@/components/ordilo/collection-folder";
import { OrdiloActionSwap } from "@/components/ordilo/ordilo-action-swap";
import { OrdiloDisclosure } from "@/components/ordilo/ordilo-disclosure";
import { OtpCodeInput } from "@/components/ordilo/otp-code-input";

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
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Steuer-ID Hanna")).toBeDefined();
  });

  it("makes closed descendants inert without discarding entered values", () => {
    render(
      <OrdiloDisclosure title="Weitere Angaben" testId="details">
        <label>
          Spitzname
          <input defaultValue="Hanni" />
        </label>
      </OrdiloDisclosure>,
    );

    const disclosure = screen.getByTestId("details");
    const content = disclosure.querySelector(
      "[data-disclosure-content]",
    ) as HTMLElement;
    const input = disclosure.querySelector("input") as HTMLInputElement;
    expect(content).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Weitere Angaben" }));
    expect(content).not.toHaveAttribute("inert");
    fireEvent.change(input, { target: { value: "Hanna" } });
    fireEvent.click(screen.getByRole("button", { name: "Weitere Angaben" }));

    expect(content).toHaveAttribute("inert");
    expect(input.value).toBe("Hanna");
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

});
