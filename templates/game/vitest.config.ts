import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "__NAME__", include: ["test/**/*.test.ts"] },
});
