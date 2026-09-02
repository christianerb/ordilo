import {
  formatPeopleLine,
  getPersonFallbackColor,
  getPersonInitial,
  getPersonShortName,
  resolveDocumentPeople,
} from "../lib/people";
import { AVATAR_COLORS } from "../lib/onboarding";

describe("people", () => {
  it("derives initials and short names from German names", () => {
    expect(getPersonInitial("emma sophie")).toBe("E");
    expect(getPersonInitial("  Ömer")).toBe("Ö");
    expect(getPersonInitial("")).toBe("?");
    expect(getPersonShortName("Emma Sophie Müller")).toBe("Emma");
  });

  it("gives an unknown person a stable preset colour", () => {
    const first = getPersonFallbackColor("Dr. Weber");
    expect(first).toBe(getPersonFallbackColor("dr. weber "));
    expect(AVATAR_COLORS).toContain(first);
  });

  it("resolves linked entities to members and keeps unlinked names", () => {
    const people = resolveDocumentPeople(
      [
        { entity_value: "Emma", linked_object_id: "m1" },
        { entity_value: "Emma Müller", linked_object_id: "m1" },
        { entity_value: "Frau Dr. Weber", linked_object_id: null },
        { entity_value: "frau dr. weber", linked_object_id: null },
        { entity_value: " ", linked_object_id: null },
      ],
      [{ id: "m1", name: "Emma Müller", avatar_color: "#27AE60" }],
    );
    expect(people).toEqual([
      { id: "m1", name: "Emma Müller", color: "#27AE60" },
      { id: null, name: "Frau Dr. Weber", color: null },
    ]);
  });

  it("formats the who-line without growing past a row", () => {
    const person = (name: string) => ({ name });
    expect(formatPeopleLine([])).toBe("");
    expect(formatPeopleLine([person("Emma Müller")])).toBe("Emma");
    expect(formatPeopleLine([person("Emma"), person("Leon")])).toBe("Emma & Leon");
    expect(formatPeopleLine([person("Emma"), person("Leon"), person("Mia")])).toBe(
      "Emma, Leon & Mia",
    );
    expect(
      formatPeopleLine([person("Emma"), person("Leon"), person("Mia"), person("Paul")]),
    ).toBe("Emma, Leon +2");
  });
});
