BASE_URL = 'https://haraj.com.sa/'


def post_url(post_id: int | str) -> str:
    return f'{BASE_URL}{str(post_id).strip()}'
