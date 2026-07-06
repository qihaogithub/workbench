import { expect, test } from "@playwright/test";

test("sketch playground edits and exports scene JSON", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("fixture")).toBeVisible();
  await expect(page.getByText("Drafts")).toHaveCount(0);
  await expect(page.getByText("Page 1")).toHaveCount(0);
  await page.getByLabel("fixture").selectOption("config-binding");
  await expect(page.getByText("Valid scene")).toBeVisible();

  await page.getByLabel("卡片").click();
  const stage = page.locator("[data-sketch-stage]");
  await stage.click({ position: { x: 320, y: 220 } });

  await page.getByPlaceholder("对象文本").fill("Playground card");
  await page.getByRole("button", { name: "Dev Data" }).click();
  await expect(page.getByLabel("scene-json")).toContainText("Playground card");

  await page.getByRole("button", { name: "Performance" }).click();
  await expect(page.getByText("100")).toBeVisible();
});

test("sketch playground can create image nodes from the toolbar", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("图片").click();
  await page.locator("[data-sketch-stage]").click({ position: { x: 300, y: 180 } });

  await page.getByRole("button", { name: "Dev Data" }).click();
  const sceneJson = page.getByLabel("scene-json");
  await expect(sceneJson).toContainText('"type": "image"');
  await expect(sceneJson).toContainText('"alt": "图片占位"');
});

test("sketch playground restores dragged object position with undo", async ({ page }) => {
  await page.goto("/");

  const xInput = page.getByRole("spinbutton", { name: "X" });
  await expect(xInput).toHaveValue("120");

  const card = page.locator('[data-sketch-node-id="card"]');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2);
  await page.mouse.up();

  await expect.poll(async () => Number(await xInput.inputValue())).toBeGreaterThan(120);

  await page.getByLabel("撤销").click();
  await expect(xInput).toHaveValue("120");
});
