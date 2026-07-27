import base64
import json


def encode_state(user_id: int | None, return_to: str) -> str:
    """Pack the app user id and the mobile app's own deep-link redirect URI into the OAuth
    `state` param so both survive the round trip through the provider's consent screen.
    `user_id` is None for the login/signup flow, where connecting an account is what
    resolves (or creates) the user rather than requiring one to already exist."""
    payload = json.dumps({"user_id": user_id, "return_to": return_to}).encode()
    return base64.urlsafe_b64encode(payload).decode()


def decode_state(state: str) -> tuple[int | None, str]:
    padded = state + "=" * (-len(state) % 4)
    payload = json.loads(base64.urlsafe_b64decode(padded))
    return payload["user_id"], payload["return_to"]
