import { expect, screenshotPath, test } from "./fixtures.ts";

test("first visit asks who you are, then shows the home screen", async ({ page }, info) => {
  await page.goto("/");
  await expect(page.getByTestId("picker")).toBeVisible();
  await page.screenshot({ path: screenshotPath("launcher-picker", info.project.name) });
  await page.getByTestId("pick-kid3").click();
  await expect(page.getByTestId("me")).toContainText("Little Kid");
  await page.screenshot({ path: screenshotPath("launcher", info.project.name) });
});

test("the passcode gate keeps strangers out", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByPlaceholder("Family passcode")).toBeVisible();
  await context.close();
});
