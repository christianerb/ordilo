import { defineConfig } from "deepsec/config";
import { generatedMatchersPlugin } from "./generated-matchers.js";

export default defineConfig({
  defaultModel: "gpt-5.5", // <deepsec:default-model>
  defaultAgent: "codex", // <deepsec:default-agent>
  ai: {"mode":"local","provider":"local"}, // <deepsec:model-route>
  projects: [
    { id: "ordilo", root: ".." },
    // <deepsec:projects-insert-above>
  ],
  plugins: [generatedMatchersPlugin],
});
