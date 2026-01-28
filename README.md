# Haraj Scraper (Node + Playwright)

What it does:
- Logs into haraj.com.sa using username/password from `.env`.
- Opens **two tabs**:
  - **New ads**: increments from `START_ID` and **never stops**.
  - **Old ads**: decrements from `START_ID-1` and stops only if it hits **200 consecutive** removed/missing ads.
- Detects removed/missing ads by the Arabic phrase:
  - `العرض محذوف او قديم.شاهد العروض المشابهة في الأسفل`
  - These are **not stored** in DB.
- For every FOUND ad:
  - Clicks the contact button (`data-testid="post-contact"`) and extracts the seller phone number from `a[data-testid="contact_mobile"]`.
  - Captures GraphQL JSON responses from:
    - `https://graphql.haraj.com.sa/?queryName=posts...`
    - `https://graphql.haraj.com.sa/?queryName=comments...`
- Comments refresh worker updates comments for ads older than 24h.
- Sends a daily email report with how many ads were added in the last 24 hours.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env
# edit .env
npm start
```

## Notes
- This project uses **UI navigation** + **GraphQL response capture**. It does not need you to hardcode GraphQL payloads.
- If Haraj adds OTP/captcha/nafath, login may need extra steps.
