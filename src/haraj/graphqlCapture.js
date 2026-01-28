export function attachGraphqlCapture(
  page,
  { includeQueryNames = ["posts", "comments"] } = {}
) {
  const captured = new Map(); // queryName -> { json, url, at }

  const handler = async (response) => {
    try {
      const url = response.url();
      if (!url.startsWith("https://graphql.haraj.com.sa")) return;

      const u = new URL(url);
      const queryName = u.searchParams.get("queryName") || "unknown";
      if (includeQueryNames.length && !includeQueryNames.includes(queryName)) return;

      const ct = (response.headers()["content-type"] || "").toLowerCase();
      if (!ct.includes("application/json")) return;

      const json = await response.json();
      captured.set(queryName, {
        json,
        url,
        at: new Date().toISOString(),
      });
    } catch {
      // swallow
    }
  };

  page.on("response", handler);

  return {
    /** get last response for a queryName */
    get(queryName) {
      return captured.get(queryName) || null;
    },

    /** get all captured responses */
    all() {
      return Object.fromEntries(captured.entries());
    },

    /** clear before navigating to a new postId */
    clear() {
      captured.clear();
    },

    /** wait until required queries arrive */
    async waitFor(
      { want = includeQueryNames, timeoutMs = 15_000 } = {}
    ) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const ok = want.every((q) => captured.has(q));
        if (ok) return true;
        await page.waitForTimeout(200);
      }
      return false;
    },

    /** detach listener when page is done */
    detach() {
      page.off("response", handler);
    },
  };
}
