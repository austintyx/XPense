import re
from datetime import datetime
from typing import Literal

import anthropic
from pydantic import BaseModel

from app.config import settings
from app.services.parser import SGT

CATEGORIES = ["Food", "Groceries", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Other"]

# Public-transit and ride-hailing merchant keywords are split into named patterns so both the
# top-level category rule and the Transport subcategory rule can reuse them without duplicating
# the keyword lists.
_PUBLIC_TRANSPORT_PATTERN = re.compile(r"BUS/MRT|\bMRT\b|TRANSIT|COMFORTDELGRO|EZ-?LINK", re.I)
_PRIVATE_TRANSPORT_PATTERN = re.compile(r"\bGRAB\b|GOJEK|CABCHARGE|\bTADA\b", re.I)

# Coffee/tea/juice-type merchants -- checked before time-of-day for Food subcategorization.
# The bubble-tea/milk-tea brand names were curated from a web search of chains currently (or
# recently) operating in Singapore -- not exhaustive, but covers the common ones. Short or
# ordinary-word brand names (KOI, TP Tea) are \b-word-boundary-anchored to avoid false-positiving
# on unrelated merchants (e.g. "koi" as in koi fish/ponds); deliberately excluded a few researched
# names that are too generic/collision-prone for plain substring matching (e.g. "The Alley" alone,
# "Winnie's", "Tea Tree" -- collides with the skincare product line).
_BEVERAGE_PATTERN = re.compile(
    r"STARBUCKS|COFFEE|\bCAFE\b|\bKOI\b|LIHO|GONG\s?CHA|\bTEA\b|BUBBLE TEA|JUICE|SMOOTHIE"
    r"|CHAGEE|MIXUE|HEY\s?TEA|CHA\s?PANDA|NAIXUE|NAYUKI|MOLLY\s?TEA"
    r"|TIGER\s?SUGAR|PLAY\s?MADE|SHARE\s?TEA|CHICHA SAN CHEN|XING\s?FU\s?TANG"
    r"|KUNG\s?FU\s?TEA|KEBUKE|BOBER\s?TEA|\bTP\s?TEA\b|TEN\s?REN|R&B\s?TEA"
    r"|EACH[\s-]?A[\s-]?CUP|WHALE\s?TEA|YOCHA|BOBII\s?FRUTII",
    re.I,
)

# Ordered rules: first pattern to match wins. Representative, not exhaustive -- unmatched
# merchants fall through to the AI step below.
_HARDCODED_RULES: list[tuple[re.Pattern, str]] = [
    (
        re.compile(_PUBLIC_TRANSPORT_PATTERN.pattern + "|" + _PRIVATE_TRANSPORT_PATTERN.pattern, re.I),
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


def food_subcategory(merchant: str, txn_at: datetime) -> str:
    if _BEVERAGE_PATTERN.search(merchant):
        return "Beverage"

    hour = txn_at.astimezone(SGT).hour
    if 5 <= hour < 11:
        return "Breakfast"
    if 11 <= hour < 15:
        return "Lunch"
    if 18 <= hour < 22:
        return "Dinner"
    return "Others"


def transport_subcategory(merchant: str) -> str:
    if _PUBLIC_TRANSPORT_PATTERN.search(merchant):
        return "Public"
    if _PRIVATE_TRANSPORT_PATTERN.search(merchant):
        return "Private"
    return "Others"


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


def subcategory_for(category: str | None, merchant: str, txn_at: datetime) -> str | None:
    if category == "Food":
        return food_subcategory(merchant, txn_at)
    if category == "Transport":
        return transport_subcategory(merchant)
    return None


def categorize_transaction(
    merchant: str, bank: str | None, txn_at: datetime
) -> tuple[str | None, str | None]:
    category = hardcoded_category(merchant) or ai_category(merchant, bank)
    subcategory = subcategory_for(category, merchant, txn_at)
    return category, subcategory
