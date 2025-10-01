import { test } from "./helpers/test_helper";
import { expect } from "@playwright/test";

test("copy message content - basic functionality", async ({ po }) => {
  await po.setUp({ autoApprove: true });
  await po.importApp("minimal");

  await po.sendPrompt("[dump] Just say hello without creating any files");

  await po.page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"]);

  const copyButton = po.page.getByTestId("copy-message-button").first();
  await copyButton.click();

  const clipboardContent = await po.page.evaluate(() =>
    navigator.clipboard.readText(),
  );

  // Test that copy functionality works
  expect(clipboardContent.length).toBeGreaterThan(0);
  expect(clipboardContent).not.toContain("<spawn-");
});

test("copy message content - spawn-write conversion", async ({ po }) => {
  await po.setUp({ autoApprove: true });
  await po.importApp("minimal");

  await po.sendPrompt(
    "Create a simple React component in src/components/Button.tsx",
  );

  await po.page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"]);

  const copyButton = po.page.getByTestId("copy-message-button").first();
  await copyButton.click();

  const clipboardContent = await po.page.evaluate(() =>
    navigator.clipboard.readText(),
  );

  // Should convert spawn-write to markdown format (flexible path matching)
  expect(clipboardContent).toContain("### File:");
  expect(clipboardContent).toContain("```");
  expect(clipboardContent).not.toContain("<spawn-write");
});

test("copy button tooltip states", async ({ po }) => {
  await po.setUp({ autoApprove: true });
  await po.importApp("minimal");

  await po.sendPrompt("Say hello");

  const copyButton = po.page.getByTestId("copy-message-button").first();

  // Check initial tooltip
  await copyButton.hover();
  const tooltip = po.page.locator('[role="tooltip"]');
  await expect(tooltip).toHaveText("Copy");

  // Copy and check "Copied!" state
  await po.page
    .context()
    .grantPermissions(["clipboard-read", "clipboard-write"]);
  await copyButton.click();
  await copyButton.hover();
  await expect(tooltip).toHaveText("Copied!");
});
