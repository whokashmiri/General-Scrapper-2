// src/haraj/contact.js
function normalizePhone(phoneRaw = "") {
  const s = String(phoneRaw).trim();
  const hasPlus = s.startsWith("+");
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
}

async function closeContactModal(page) {
  // Try Escape
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(150).catch(() => null);

  // If still visible, click the "X" inside the contact modal container
  const phoneLink = page.locator('a[data-testid="contact_mobile"]');
  const stillOpen = await phoneLink.isVisible().catch(() => false);

  if (stillOpen) {
    // In your HTML, the close button is:
    // <div class="bg-background-card ..."><button ...><svg data-icon="times">
    const closeBtn = page.locator('div.bg-background-card button:has(svg[data-icon="times"])');
    if (await closeBtn.count().catch(() => 0)) {
      await closeBtn.first().click({ timeout: 2000 }).catch(() => null);
      await page.waitForTimeout(150).catch(() => null);
    }
  }

  // Final fallback: click outside
  const stillOpen2 = await phoneLink.isVisible().catch(() => false);
  if (stillOpen2) {
    await page.mouse.click(5, 5).catch(() => null);
    await page.waitForTimeout(150).catch(() => null);
  }
}

export async function fetchSellerPhone(page, { timeoutMs = 20_000 } = {}) {
  // Ensure no stale modal
  await closeContactModal(page);

  const btn = page.locator('[data-testid="post-contact"]');
  if (!(await btn.count())) return null;

  await btn.first().click({ timeout: timeoutMs });

  const phoneLink = page.locator('a[data-testid="contact_mobile"]');

  // 1️⃣ Wait for modal link to appear
  const appeared = await phoneLink
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!appeared) {
    await closeContactModal(page);
    return null;
  }

  // 2️⃣ WAIT UNTIL PHONE NUMBER EXISTS (text or href)
  let phone = null;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const href = await phoneLink.first().getAttribute("href").catch(() => null);
    const txt = await phoneLink.first().innerText().catch(() => "");

    const candidate = normalizePhone(
      href?.startsWith("tel:") ? href.slice(4) : txt
    );

    if (candidate && candidate.length >= 9) {
      phone = candidate;
      break;
    }

    await page.waitForTimeout(200);
  }

  // 3️⃣ Close modal AFTER data is captured
  await closeContactModal(page);

  return phone;
}
