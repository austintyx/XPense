import httpx


def raise_for_status_with_body(response: httpx.Response) -> None:
    """Like response.raise_for_status(), but includes the response body in the exception
    message — OAuth providers put the actual error reason there, and it's otherwise silently
    dropped, leaving just a bare "401 Unauthorized" to debug from."""
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise httpx.HTTPStatusError(
            f"{exc}\nResponse body: {response.text}", request=exc.request, response=exc.response
        ) from exc
