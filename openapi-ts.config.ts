import { defineConfig } from "@hey-api/openapi-ts";

// Output lands inside src/ so the ordinary `tsc` build compiles it — no second
// build step and no path mapping.
//
// Never hand-edit src/clients/generated. The spec is the source of truth: change
// it in infoticon/backend-v2, re-dump it (`yarn spec:dump`), then regenerate here.
export default defineConfig({
  input: "./openapi.json",
  output: "src/clients/generated",
  plugins: [{ name: "@hey-api/client-fetch", throwOnError: true }],
});
