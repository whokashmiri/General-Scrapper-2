# Haraj nodriver scraper

Python nodriver scraper for Haraj posts, seller contact phone, comments capture, session reuse, and MongoDB persistence.

## Setup

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and set `HARAJ_USERNAME`, `HARAJ_PASSWORD`, `MONGODB_URI`, `STARTID`, `CONCURRENCY_UP`, and `CONCURRENCY_DOWN`.

Run:

```bash
python -m haraj_scraper.main
```

The first run opens Chrome, logs in, and saves cookies/profile in `SESSION_COOKIES_FILE` and `USER_DATA_DIR`. Later runs reuse the same session. If Haraj asks for OTP/CAPTCHA/Nafath, complete it manually in the opened browser, then rerun.

## ID behavior

With:

```env
STARTID=36
CONCURRENCY_UP=3
CONCURRENCY_DOWN=2
```

The first batch scrapes IDs: `36, 37, 38, 35, 34`.

Set `MAX_IDS_PER_RUN` to keep walking outward from `STARTID`; set `0` for a single batch.

## Comment refresh

Set `ENABLE_COMMENT_REFRESH=true` to keep a background task running. It checks posts whose comments are older than `COMMENT_REFRESH_OLDER_THAN_HOURS` and refreshes them every `COMMENT_REFRESH_INTERVAL_HOURS`.

## Notes

Use your own account, respect Haraj terms and rate limits, and do not use this to bypass OTP, CAPTCHA, Nafath, or access controls.
