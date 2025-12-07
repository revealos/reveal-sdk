import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm", "cjs"],
  target: "es2019",
  sourcemap: true,
  clean: true,
  minify: true,
  external: [
    // React is a peer dependency (optional)
    "react",
    "react-dom",
    // overlay-ui is imported by useNudgeDecision hook but should be external
    // (resolved at runtime, not bundled)
    "@reveal/overlay-ui",
  ],
});

