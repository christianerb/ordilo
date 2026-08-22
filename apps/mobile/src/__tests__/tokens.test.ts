import { colors, radii, spacing, typography } from "../theme/tokens";

/**
 * Guards the contract with DESIGN.md: the native tokens must carry the
 * exact Family Journal values. If DESIGN.md changes, change it here too.
 */
describe("design tokens", () => {
  it("carries the exact DESIGN.md palette", () => {
    expect(colors).toMatchObject({
      warmWhite: "#FDFCFA",
      sand: "#F7F5F1",
      sandLight: "#F1EEE8",
      sandWarm: "#EFE8DC",
      graphite: "#262421",
      mistLight: "#D3CEC5",
      mist: "#9C978C",
      mistDark: "#625D54",
      harborBlue: "#305460",
      harborBlueDark: "#285064",
      harborBlueDarker: "#193232",
      warmApricot: "#E46018",
      warmApricotLight: "#F0B4A0",
      blueSoft: "#E4F0FC",
      destructive: "#C0392B",
      destructiveBackground: "#F9E8E5",
    });
  });

  it("keeps the documented radii and spacing scales", () => {
    expect(radii).toMatchObject({ base: 10, sm: 12, md: 20, lg: 24, xl: 28 });
    expect(spacing).toMatchObject({
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      "2xl": 48,
    });
  });

  it("uses Figtree for every type role", () => {
    for (const role of Object.values(typography)) {
      expect(role.fontFamily).toMatch(/^Figtree_/);
    }
  });
});
