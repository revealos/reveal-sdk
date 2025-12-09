import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: {
    resolve: true,
  },
  format: ["esm", "cjs"],
  target: "es2019",
  sourcemap: true,
  clean: true,
  minify: true,
  external: ["react", "react-dom"],
});

