import { expect, test } from "@playwright/test";


test.describe("MermaidPulse desktop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("locks the viewport with no page overflow", async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const root = page.locator("#root > div");
    await expect(root).toHaveClass(/h-screen/);
    await expect(root).toHaveClass(/overflow-hidden/);
  });

  test("renders the default preset with packets and heartbeats", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "MermaidPulse" })).toBeVisible();
    await expect(page.locator("svg.mp-base-svg")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-packet]").first()).toBeAttached({ timeout: 10_000 });
    const heartbeats = await page.locator("[data-heartbeat]").count();
    expect(heartbeats).toBeGreaterThan(3);
  });

  test("logs zero console errors while rendering", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await expect(page.locator("[data-packet]").first()).toBeAttached({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("node click opens the chaos inspector and outage drops success rate", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });

    await page.locator('[data-node-hit="Mesh"]').click();
    const inspector = page.getByTestId("node-inspector");
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText("Service Mesh")).toBeVisible();

    await inspector.getByRole("button", { name: /Outage/i }).click();
    await expect(page.locator("textarea")).toContainText("%% @node Mesh status=outage");

    const dockSuccess = page
      .getByText("Success rate")
      .locator("xpath=..")
      .locator("span.tabular-nums");
    await expect(dockSuccess).toHaveText(/^(?!100\.0%$).*%$/, { timeout: 10_000 });
  });

  test("throughput slider writes the rps directive into the editor", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    await page.locator('[data-node-hit="Catalog"]').click();
    const slider = page.getByLabel(/Target throughput/i);
    await slider.fill("4000");
    await expect(page.locator("textarea")).toContainText("rps=4000", { timeout: 10_000 });
  });

  test("pause stops packet motion, play resumes it", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /Pause traffic/i }).click();
    await expect(page.locator("[data-packet]")).toHaveCount(0);
    await page.getByRole("button", { name: /Play traffic/i }).click();
    await expect(page.locator("[data-packet]").first()).toBeAttached();
  });

  test("step request traces a single request hop by hop", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /Step request/i }).click();
    await expect(page.getByText(/hop 1\//)).toBeVisible();
    await page.getByRole("button", { name: /Step request/i }).click();
    await expect(page.getByText(/hop 2\//)).toBeVisible();
  });

  test("syntax error keeps the last valid diagram and pins the line", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    const toggle = page.getByRole("button", { name: /Show source|Show canvas/i });
    const onMobile = await toggle.isVisible();
    if (onMobile && (await toggle.textContent())?.includes("source")) await toggle.click();

    const editor = page.getByLabel(/Mermaid code editor/i);
    await editor.fill("flowchart LR\n  A[Start] -->");
    await expect(page.getByText(/Line 2/i).first()).toBeVisible({ timeout: 10_000 });

    if (onMobile) await toggle.click();
    await expect(page.locator("svg.mp-base-svg")).toBeVisible();
    await expect(page.locator("[data-packet]").first()).toBeAttached();
  });

  test("switches presets and rerenders the topology", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    await page.getByLabel(/Architecture preset/i).selectOption({ label: "Event-Driven Kafka & Worker Pipeline" });
    await expect(page.locator("textarea")).toHaveValue(/Kafka Event Bus/, { timeout: 10_000 });
    await expect(page.locator("[data-packet]").first()).toBeAttached();
  });

  test("zoom controls clamp between 25 and 300 percent", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    const readout = page.getByTestId("zoom-readout");
    for (let i = 0; i < 6; i += 1) {
      await page.getByRole("button", { name: /Zoom in/i }).click();
    }
    await expect(readout).toHaveText("300%");
    for (let i = 0; i < 12; i += 1) {
      await page.getByRole("button", { name: /Zoom out/i }).click();
    }
    await expect(readout).toHaveText("25%");
    await page.getByRole("button", { name: /Reset zoom/i }).click();
    await expect(readout).toHaveText("100%");
  });

  test("keyboard focus reaches a canvas node and opens the inspector", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-node-hit="Pricing"]')?.focus());
    await expect(page.locator('[data-node-hit="Pricing"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("node-inspector")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("node-inspector")).toHaveCount(0);
  });

  test("share URL encodes the diagram into the hash", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /Share URL/i }).first().click();
    await expect(page).toHaveURL(/#d=/);
  });

  test("download exports a standalone animated SVG", async ({ page }) => {
    await page.locator("[data-packet]").first().waitFor({ timeout: 20_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Download SVG/i }).first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.svg$/);
  });
});

test.describe("MermaidPulse mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps the workspace free of horizontal overflow", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("toggles between source and canvas panes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "MermaidPulse" })).toBeVisible();
    const toggle = page.getByRole("button", { name: /Show source|Show canvas/i });
    await toggle.click();
    await expect(page.getByRole("button", { name: /Show source|Show canvas/i })).toBeVisible();
    await expect(page.getByLabel(/Mermaid code editor/i)).toBeVisible();
  });
});
