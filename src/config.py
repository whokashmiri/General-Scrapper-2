from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    haraj_username: str | None = None
    haraj_password: str | None = None

    headless: bool = False
    user_data_dir: Path = Path('./chrome-profile')
    session_cookies_file: Path = Path('./session/cookies.json')
    nav_timeout_ms: int = 60_000
    response_timeout_ms: int = 20_000
    contact_timeout_ms: int = 20_000

    startid: int = 11182031910
    concurrency_up: int = 3
    concurrency_down: int = 2
    max_ids_per_run: int = 0

    mongodb_uri: str = 'mongodb://localhost:27017'
    mongodb_db: str = 'haraj_scraper'
    ads_collection: str = 'ads'
    comments_collection: str = 'comments'

    graphql_url: str = 'https://graphql.haraj.com.sa/?queryName=posts&clientId=RtoTvuMj-MO1D-6WGE-vKdO-YKpWGp14gC8kv3&version=N0.0.1%20,%202026-05-30%2001/'
    client_id: str = 'RtoTvuMj-MO1D-6WGE-vKdO-YKpWGp14gC8kv3'

    refresh_comments_enabled: bool = True
    refresh_comments_every_hours: int = 24
    refresh_comments_older_than_hours: int = 24
    refresh_comments_limit: int = 500

    enable_comment_refresh: bool = True
    comment_refresh_interval_hours: int = 24
    comment_refresh_older_than_hours: int = 24
    comment_refresh_limit: int = 500
    comment_refresh_scroll_fallback: bool = True

    min_delay_ms: int = 600
    max_delay_ms: int = 1200


settings = Settings()
