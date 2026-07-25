import re
from datetime import datetime
from typing import Literal

import anthropic
from pydantic import BaseModel

from app.config import settings
from app.services.parser import SGT

CATEGORIES = ["Food", "Groceries", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Other"]

# Ordered rules: first pattern to match wins. Representative, not exhaustive -- unmatched
# merchants fall through to the AI step below.
_HARDCODED_RULES: list[tuple[re.Pattern, str]] = [
    (
        re.compile(r"BUS/MRT|\bMRT\b|TRANSIT|COMFORTDELGRO|EZ-?LINK|\bGRAB\b|GOJEK|CABCHARGE|\bTADA\b", re.I),
        "Transport",
    ),
    (
        re.compile(r"NTUC|FAIRPRICE|SHENG SIONG|COLD STORAGE|\bGIANT\b|DON DON DONKI|PRIME SUPERMARKET", re.I),
        "Groceries",
    ),
    (re.compile(r"SHOPEE|LAZADA|AMAZON|ZALORA|TAOBAO", re.I), "Shopping"),
    (
        re.compile(r"NETFLIX|SPOTIFY|DISNEY\+|SHAW THEATRES|GOLDEN VILLAGE|\bGV\b|CATHAY CINEMA", re.I),
        "Entertainment",
    ),
    (re.compile(r"SINGTEL|STARHUB|\bM1\b|SP GROUP|SP SERVICES|\bPUB\b", re.I), "Bills"),
    (re.compile(r"GUARDIAN|WATSONS|\bCLINIC\b|HOSPITAL|POLYCLINIC", re.I), "Health"),
]


def hardcoded_category(merchant: str) -> str | None:
    for pattern, category in _HARDCODED_RULES:
        if pattern.search(merchant):
            return category
    return None


def food_subcategory(txn_at: datetime) -> str:
    hour = txn_at.astimezone(SGT).hour
    if 11 <= hour < 15:
        return "Lunch"
    if 15 <= hour < 18:
        return "Snacks"
    if 18 <= hour < 22:
        return "Dinner"
    return "Drinks"


class _MerchantCategoryResult(BaseModel):
    category: Literal[
        "Food", "Groceries", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Other"
    ]


def ai_category(merchant: str, bank: str | None) -> str | None:
    """Ask Claude to classify a merchant name the hardcoded rules couldn't resolve. Never
    raises -- returns None on any failure (unset key, network error, etc.) so this is a pure
    enrichment step that can never block a sync."""
    if not settings.llm_api_key:
        return None
    try:
        client = anthropic.Anthropic(api_key=settings.llm_api_key)
        response = client.messages.parse(
            model="claude-haiku-4-5",
            max_tokens=64,
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Classify this Singapore bank transaction merchant into exactly one "
                        f"spending category. Merchant: \"{merchant}\". Bank: {bank or 'unknown'}."
                    ),
                }
            ],
            output_format=_MerchantCategoryResult,
        )
        parsed = response.parsed_output
        return parsed.category if parsed is not None else None
    except Exception:
        return None


def categorize_transaction(
    merchant: str, bank: str | None, txn_at: datetime
) -> tuple[str | None, str | None]:
    category = hardcoded_category(merchant) or ai_category(merchant, bank)
    subcategory = food_subcategory(txn_at) if category == "Food" else None
    return category, subcategory
