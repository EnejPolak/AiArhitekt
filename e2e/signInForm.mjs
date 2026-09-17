/**
 * Shared production/local sign-in field fill.
 * Phase 3F stayed on /sign-in because it skipped cookie dismiss, network idle,
 * and React hydration on the controlled email/password inputs.
 */
export async function fillProductionSignIn(page, user) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const rejectCookies = page.getByRole("button", { name: /Reject All|Reject all|Reject/i });
  if (await rejectCookies.isVisible().catch(() => false)) {
    await rejectCookies.click();
  }
  await page.locator("#email").waitFor({ timeout: 20_000 });
  await page.waitForFunction(() => {
    const el = document.querySelector("#email");
    return Boolean(el && Object.keys(el).some((key) => key.startsWith("__react")));
  }, { timeout: 15_000 }).catch(() => {});
  await page.locator("#email").click();
  await page.locator("#email").fill("");
  await page.locator("#email").pressSequentially(user.email, { delay: 10 });
  await page.locator("#password").click();
  await page.locator("#password").fill("");
  await page.locator("#password").pressSequentially(user.password, { delay: 10 });
}
