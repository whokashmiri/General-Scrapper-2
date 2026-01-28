export const NOT_FOUND_PHRASE = "العرض محذوف او قديم.شاهد العروض المشابهة في الأسفل";

export async function isAdNotFound(page) {
  const text = await page.locator("body").innerText().catch(() => "");
  return text.includes(NOT_FOUND_PHRASE);
}
