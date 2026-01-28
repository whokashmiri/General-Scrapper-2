import readline from 'node:readline';
import { CONFIG } from '../config.js';

const LOGIN_URL = 'https://haraj.com.sa/login.php';

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

// src/haraj/login.js
export async function ensureLoggedIn(
  page,
  { username, password, timeoutMs = 60_000 } = {}
) {
  if (!username || !password) {
    throw new Error("HARAJ_USERNAME / HARAJ_PASSWORD missing in env");
  }

  // Always start from home to ensure login button exists
  if (!page.url().startsWith("https://haraj.com.sa")) {
    await page.goto("https://haraj.com.sa", { waitUntil: "domcontentloaded" });
  }

  const modal = page.locator('[data-testid="auth_modal"]');

  // If already logged in, modal/login link often not visible
  // We try to open login modal; if cannot find login trigger, assume logged-in
  const loginByTestId = page.locator('[data-testid="login-link"]');

  // Fallback: any button with "دخــــول"
  const loginByText = page.getByRole("button", { name: /دخــــول/i });

  async function openModal() {
    // try testid first
    if (await loginByTestId.count()) {
      await loginByTestId.first().scrollIntoViewIfNeeded().catch(() => {});
      await loginByTestId.first().click({ timeout: 10_000 }).catch(() => {});
    } else if (await loginByText.count()) {
      await loginByText.first().scrollIntoViewIfNeeded().catch(() => {});
      await loginByText.first().click({ timeout: 10_000 }).catch(() => {});
    } else {
      return false;
    }

    // wait short for modal
    const ok = await modal
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    return ok;
  }

  // Try opening modal a few times
  let opened = false;
  for (let i = 0; i < 3 && !opened; i++) {
    opened = await openModal();
    if (!opened) await page.waitForTimeout(700);
  }

  // If modal still not visible:
  // - either already logged in
  // - or selector mismatch / site changed
  if (!opened) {
    // Heuristic: if login button exists but modal won't open => real issue
    const hasLoginBtn = (await loginByTestId.count()) || (await loginByText.count());
    if (hasLoginBtn) {
      await page.screenshot({ path: "login_failed.png", fullPage: true }).catch(() => {});
      throw new Error(
        "Login modal did not appear. Saved screenshot: login_failed.png. Selector/UI likely changed."
      );
    }
    // No login button: assume already logged in
    return;
  }

  // Username step
  const userInput = modal.locator('[data-testid="auth_username"]');
  await userInput.waitFor({ state: "visible", timeout: timeoutMs });
  await userInput.fill(username);

  const nextBtn = modal.locator('[data-testid="auth_submit_username"]');
  await nextBtn.click();

  // Password step
  const passInput = modal.locator('[data-testid="auth_password"]');
  await passInput.waitFor({ state: "visible", timeout: timeoutMs });
  await passInput.fill(password);

  const loginBtn = modal.locator('[data-testid="auth_submit_login"]');
  await loginBtn.click();

  // Wait modal close
  const closed = await modal
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!closed) {
    await page.screenshot({ path: "login_stuck.png", fullPage: true }).catch(() => {});
    throw new Error(
      "Login did not complete (modal still visible). Saved screenshot: login_stuck.png"
    );
  }
}
