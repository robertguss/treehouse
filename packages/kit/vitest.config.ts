import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "kit", include: ["test/**/*.test.ts"] },
});
