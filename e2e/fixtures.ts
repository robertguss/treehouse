import { test as base, expect } from "@playwright/test";
import { TEST_PASSCODE } from "./constants.ts";

// Every test starts signed in, and fails if the page logs an error.
export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "console errors").toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page }, use) => {
    const response = await page.request.post("/login", {
      form: { passcode: TEST_PASSCODE, next: "/" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(303);
    await use(page);
  },
});

export { expect };

export function screenshotPath(name: string, projectName: string): string {
  return `test-results/screens/${name}-${projectName}.png`;
}
