import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='useEffect']",
          message:
            "Direct useEffect is banned. Use useMountEffect from @/lib/hooks/use-mount-effect for mount-only side effects, or derive state inline / use event handlers instead. See Factory's 'Why we banned React useEffect' article.",
        },
      ],
    },
  },
  {
    // Allow useEffect only inside useMountEffect itself
    files: ["src/lib/hooks/use-mount-effect.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];

export default eslintConfig;
