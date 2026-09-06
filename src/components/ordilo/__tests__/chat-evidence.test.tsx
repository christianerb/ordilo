import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatEvidence } from "../chat-evidence";

describe("document evidence reading surface", () => {
  it("opens the exact quoted passage with its page and highlighted value", () => {
    render(<ChatEvidence source={{ document_id: "test", title: "Hannahs Ticket", excerpt: "Gültig bis 31.08.2027", quote: "Gültig bis 31.08.2027", highlight: "31.08.2027", page_number: 2, cited: true, score: 1 }} onOpenDocument={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Fundstelle öffnen: Hannahs Ticket" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Originaltext · Seite 2")).toBeInTheDocument();
    expect(within(dialog).getByText("31.08.2027").tagName).toBe("MARK");
    expect(within(dialog).getByRole("button", { name: "Original öffnen" })).toBeInTheDocument();
  });
  it("does not offer a broken original-file action for a manual note", () => {
    render(<ChatEvidence source={{document_id:"note",title:"Notiz",excerpt:"Obst mitbringen",quote:"Obst mitbringen",score:1,cited:true,has_original:false}} onOpenDocument={vi.fn()} />);
    fireEvent.click(screen.getByRole("button",{name:"Fundstelle öffnen: Notiz"}));
    expect(within(screen.getByRole("dialog")).queryByRole("button",{name:"Original öffnen"})).not.toBeInTheDocument();
  });
});
