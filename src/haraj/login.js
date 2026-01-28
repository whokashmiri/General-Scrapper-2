export async function ensureLoggedIn(page, { username, password, timeoutMs = 60_000 } = {}) {
  if (!username || !password) {
    throw new Error("HARAJ_USERNAME / HARAJ_PASSWORD missing in env");
  }

  const loginLink = page.locator('[data-testid="login-link"]');
  if (!(await loginLink.count())) {
    // Likely already logged in
    return;
  }

  await loginLink.first().click();

  const modal = page.locator('[data-testid="auth_modal"]');
  await modal.waitFor({ state: "visible", timeout: timeoutMs });

  const userInput = modal.locator('[data-testid="auth_username"]');
  await userInput.waitFor({ state: "visible", timeout: timeoutMs });
  await userInput.fill(username);

  await modal.locator('[data-testid="auth_submit_username"]').click();

  const passInput = modal.locator('[data-testid="auth_password"]');
  await passInput.waitFor({ state: "visible", timeout: timeoutMs });
  await passInput.fill(password);

  await modal.locator('[data-testid="auth_submit_login"]').click();

  // Wait for modal to close OR login link to disappear
  await Promise.race([
    modal.waitFor({ state: "hidden", timeout: timeoutMs }).catch(() => null),
    loginLink.waitFor({ state: "hidden", timeout: timeoutMs }).catch(() => null),
  ]);

  if (await modal.isVisible().catch(() => false)) {
    throw new Error(
      "Login modal still visible. Credentials invalid or extra step (OTP/CAPTCHA/nafath) required."
    );
  }
}
