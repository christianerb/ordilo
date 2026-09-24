/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../../../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function pathConstant(source: string, name: string): string {
  const match = new RegExp(`const ${name} =\\s*"([^"]+)"`).exec(source);
  if (!match) throw new Error(`${name} not found`);
  return match[1]!;
}

describe("Ordilo mark", () => {
  const icon = read("scripts/render-app-icons.mjs");
  const native = read("apps/mobile/src/components/ordilo-mark.tsx");
  const web = read("src/components/ordilo/ordilo-mark.tsx");

  it.each(["HEXAGON", "TRUNK", "EAR", "EAR_FOLD", "TUSK"])(
    "draws the app icon's %s in the native and web marks",
    (name) => {
      const expected = pathConstant(icon, name);
      expect(pathConstant(native, name)).toBe(expected);
      expect(pathConstant(web, name)).toBe(expected);
    },
  );

  it("uses the icon's 1024-unit canvas with a filled elephant", () => {
    expect(native).toContain('viewBox="0 0 1024 1024"');
    expect(web).toContain('viewBox="0 0 1024 1024"');
    expect(native).toContain("<Circle cx={500} cy={480} r={175} fill={colors.harborBlue} />");
    expect(native).toContain("fill={colors.washSage}");
    expect(native).toContain("stroke={colors.warmApricot}");
  });
});
