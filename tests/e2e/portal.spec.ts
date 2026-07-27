import { expect, test } from "@playwright/test";
import axe from "axe-core";

for (const path of ["/", "/acesso"]) {
  test(`${path} is keyboard-accessible and has no automated axe violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    const results = await page.evaluate(async (source) => {
      const script = document.createElement("script"); script.textContent = source; document.head.append(script);
      return (window as typeof window & { axe: typeof axe }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    }, axe.source);
    expect(results.violations).toEqual([]);
  });
}

test("secure access links redeem the fragment by POST and remove it from the address bar", async ({ page }) => {
  let redemptions = 0;
  await page.route("**/api/auth/link", async (route) => {
    redemptions += 1;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ token: "preview-safe-token" });
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Link inválido ou expirado." }) });
  });

  await page.goto("/acesso#token=preview-safe-token");

  await expect(page.getByRole("status")).toContainText("Link inválido ou expirado");
  expect(page.url()).not.toContain("token=");
  expect(redemptions).toBe(1);
});

test("agenda shows a safe empty state and opens booking without horizontal overflow", async ({ page }) => {
  await page.route("**/api/appointments", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ appointments: [], profile: { complete: false, name: null, insurancePlanId: null } }) });
  });
  await page.route("**/api/professionals", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ professionals: [] }) });
  });
  await page.route("**/api/insurance-plans", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ plans: [] }) });
  });
  await page.route("**/api/procedures/not-offered", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ procedures: [] }) });
  });
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Nenhuma consulta futura" })).toBeVisible();
  await page.getByRole("button", { name: "Marcar consulta" }).click();
  await expect(page.getByRole("heading", { name: "Escolha um horário disponível" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("booking shows only returned available days and switches cached slots without another request", async ({ page }) => {
  let availabilityRequests = 0;
  await page.route("**/api/appointments", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ appointments: [], profile: { complete: true, name: "Ana", insurancePlanId: "plan" } }) });
  });
  await page.route("**/api/professionals", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ professionals: [{ id: "1f7beaf5-94b1-4bdb-9aef-9874fc902987", name: "Dra. Priscila" }] }) });
  });
  await page.route("**/api/insurance-plans", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ plans: [] }) });
  });
  await page.route("**/api/procedures/not-offered", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ procedures: [] }) });
  });
  await page.route("**/api/availability?**", async (route) => {
    availabilityRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ days: [
      { date: "2026-07-30", slots: [{ startAt: "2026-07-30T12:00:00.000Z" }] },
      { date: "2026-08-03", slots: [{ startAt: "2026-08-03T13:00:00.000Z" }] },
    ] }) });
  });

  await page.goto("/agenda");
  await page.getByRole("button", { name: "Marcar consulta" }).click();
  await expect(page.locator(".days button")).toHaveCount(2);
  await expect(page.locator(".days")).not.toContainText("29");
  await expect(page.getByRole("button", { name: "09:00" })).toBeVisible();
  await page.locator(".days button").nth(1).click();
  await expect(page.getByRole("button", { name: "10:00" })).toBeVisible();
  expect(availabilityRequests).toBe(1);
});

test("joint booking requires a second name, keeps only consecutive starts and shows limitations", async ({ page }) => {
  await page.route("**/api/appointments", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ appointments: [], profile: { complete: true, name: "Ana", insurancePlanId: "plan" } }) });
  });
  await page.route("**/api/professionals", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ professionals: [{ id: "1f7beaf5-94b1-4bdb-9aef-9874fc902987", name: "Dra. Priscila" }] }) });
  });
  await page.route("**/api/insurance-plans", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ plans: [] }) });
  });
  await page.route("**/api/procedures/not-offered", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ procedures: [
      { id: "canal", name: "Canal em molar", description: "Não realizado." },
      { id: "siso", name: "Extração de siso", description: "Apenas particular; encaminhar para avaliação." },
      { id: "urgencia", name: "Urgência", description: "Encaminhar para avaliação." },
    ] }) });
  });
  await page.route("**/api/availability?**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ days: [{ date: "2026-07-30", slots: [
      { startAt: "2026-07-30T12:00:00.000Z" },
      { startAt: "2026-07-30T12:15:00.000Z" },
      { startAt: "2026-07-30T13:00:00.000Z" },
    ] }] }) });
  });

  await page.goto("/agenda");
  await page.getByRole("button", { name: "Marcar consulta" }).click();
  await page.getByRole("button", { name: "Sim, duas pessoas" }).click();
  await expect(page.getByLabel("Nome da segunda pessoa")).toBeVisible();
  await expect(page.getByText("Estes atendimentos não são marcados diretamente pelo portal:")).toBeVisible();
  await expect(page.getByText("Canal em molar")).toBeVisible();
  await expect(page.getByText("Extração de siso")).toBeVisible();
  await expect(page.getByText("Apenas particular; encaminhar para avaliação.")).toBeVisible();
  await expect(page.getByText("Urgência")).toBeVisible();
  await expect(page.getByText("Encaminhar para avaliação.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "09:00" })).toBeVisible();
  await expect(page.getByRole("button", { name: "09:15" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "10:00" })).toHaveCount(0);

  const confirm = page.getByRole("button", { name: "Confirmar consulta" });
  await page.getByRole("button", { name: "09:00" }).click();
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Nome da segunda pessoa").fill("Bia");
  await expect(confirm).toBeEnabled();
});
