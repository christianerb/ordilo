import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only resolves conflicts between classes it recognises, and it
 * has no way to know that `rounded-ordilo-xl` belongs to the same border-radius
 * group as `rounded-lg`. Left unregistered, the two survive side by side and
 * the winner is decided by stylesheet order — which silently made shadcn's
 * `rounded-t-lg` compete with our drawer radius. Registering the scale here
 * makes the last class win, everywhere the tokens are used.
 *
 * Keep this list in sync with the `--radius-ordilo-*` tokens in globals.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["ordilo-base", "ordilo-sm", "ordilo-md", "ordilo-xl"],
    },
  },
});

/**
 * Merge Tailwind CSS class names intelligently.
 * Combines clsx (conditional classes) with tailwind-merge (conflict resolution).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
