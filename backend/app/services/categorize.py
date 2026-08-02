import re
from datetime import datetime

from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DirectionEnum, MerchantCategoryCache
from app.services.parser import SGT

CATEGORIES = ["Food", "Groceries", "Transport", "Shopping", "Bills", "Entertainment", "Health", "Travel", "Other"]

# Subcategories for overseas (non-SGD currency) spend -- classified independently of the debit
# CATEGORIES list above via categorize_transaction's currency-routing branch, not through
# subcategory_for (which only knows Food/Transport). Kept in sync by hand with
# app/src/theme/tokens.ts's TRAVEL_SUBCATEGORIES, same no-shared-infra convention as CATEGORIES.
TRAVEL_SUBCATEGORIES = ["Food", "Groceries", "Transport", "Shopping", "Entertainment", "Accommodations"]

# Money coming in needs its own taxonomy -- kept in sync by hand with app/src/theme/tokens.ts's
# CREDIT_CATEGORIES (no shared-constants infrastructure exists between frontend/backend, same as
# the debit CATEGORIES list above already being duplicated independently on both sides).
CREDIT_CATEGORIES = [
    "Salary",
    "Transfer Received",
    "Refund",
    "Reimbursement",
    "Interest",
    "Gift",
    "Investment",
    "Other Income",
]

# Public-transit and ride-hailing merchant keywords are split into named patterns so both the
# top-level category rule and the Transport subcategory rule can reuse them without duplicating
# the keyword lists.
_PUBLIC_TRANSPORT_PATTERN = re.compile(r"BUS/MRT|\bMRT\b|TRANSIT|COMFORTDELGRO|EZ-?LINK", re.I)
# Singapore private-hire (ride-hailing/taxi-booking) companies, not limited to Grab/Gojek --
# RYDE, CDG (ComfortDelGro's own ride-hailing app/fleet, distinct from the EZ-Link/transit-topup
# use of "COMFORTDELGRO" in the public pattern above -- checked first in transport_subcategory,
# so there's no realistic collision), and TransCab added alongside. Researched, not yet confirmed
# against a real bank alert -- if a private-hire charge doesn't get picked up, check the actual
# merchant string first before assuming this list is wrong.
_PRIVATE_TRANSPORT_PATTERN = re.compile(r"\bGRAB\b|GOJEK|CABCHARGE|\bTADA\b|\bRYDE\b|\bCDG\b|TRANSCAB", re.I)

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


def ai_category(merchant: str, bank: str | None, categories: list[str] = CATEGORIES) -> str | None:
    """Ask Gemini (free tier) to classify a merchant name the hardcoded rules couldn't resolve.
    Never raises -- returns None on any failure (unset key, network error, unparseable reply,
    etc.) so this is a pure enrichment step that can never block a sync. Plain-text classification
    (not a structured-output schema) is deliberate: the answer space is just the category names in
    `categories`, so matching the reply against that list is simpler and more robust than
    depending on a schema-validation API surface. `categories` defaults to the debit/expense list;
    pass CREDIT_CATEGORIES for a credit-direction transaction."""
    if not settings.gemini_api_key:
        return None
    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=(
                "Classify this Singapore bank transaction merchant into exactly one "
                f"category: {', '.join(categories)}. Reply with ONLY the category name, nothing "
                f"else. Merchant: \"{merchant}\". Bank: {bank or 'unknown'}."
            ),
            config=types.GenerateContentConfig(
                max_output_tokens=20,
                temperature=0,
            ),
        )
        reply = (response.text or "").strip()
        for category in categories:
            if reply.lower() == category.lower():
                return category
        return None
    except Exception:
        return None


def subcategory_for(category: str | None, merchant: str, txn_at: datetime) -> str | None:
    if category == "Food":
        return food_subcategory(merchant, txn_at)
    if category == "Transport":
        return transport_subcategory(merchant)
    return None


def _normalize_merchant_key(merchant: str, scope: str) -> str:
    # Scoped so a debit, credit, and overseas ("travel") transaction that happen to share a
    # merchant string (e.g. a person's name via both a card refund and a PayNow transfer, or a
    # merchant that appears both locally and abroad) never share one cached category across
    # unrelated taxonomies.
    normalized = re.sub(r"\s+", " ", merchant).strip().upper()
    return f"{scope}:{normalized}"


def _get_cached_category(db: Session, merchant: str, scope: str) -> str | None:
    row = (
        db.query(MerchantCategoryCache)
        .filter_by(merchant_key=_normalize_merchant_key(merchant, scope))
        .one_or_none()
    )
    return row.category if row is not None else None


def remember_category(db: Session, merchant: str, category: str, scope: str = "debit") -> None:
    """Upserts the merchant->category cache, overwriting any existing entry -- called both after
    a successful AI classification and whenever a user manually (re)categorizes a transaction, so
    a user's correction always wins over a prior guess and sticks for every future transaction
    from that merchant. Flushes (but doesn't commit) so the change is visible to a subsequent
    _get_cached_category call later in the same request/batch -- this project's sessions are
    created with autoflush=False, so that visibility isn't automatic. `scope` is a plain string
    ("debit"/"credit"/"travel", typically a DirectionEnum's `.value`) rather than DirectionEnum
    itself -- overseas-ness ("travel") is orthogonal to money-flow direction, a Travel purchase is
    still direction=debit, so the cache scope needs a third value the enum doesn't have."""
    key = _normalize_merchant_key(merchant, scope)
    row = db.query(MerchantCategoryCache).filter_by(merchant_key=key).one_or_none()
    if row is None:
        db.add(MerchantCategoryCache(merchant_key=key, category=category))
    else:
        row.category = category
    db.flush()


def categorize_transaction(
    db: Session,
    merchant: str,
    bank: str | None,
    txn_at: datetime,
    direction: DirectionEnum = DirectionEnum.debit,
    currency: str = "SGD",
) -> tuple[str | None, str | None]:
    if currency != "SGD":
        # An overseas transaction (any non-SGD currency) always files under the fixed "Travel"
        # category, with its own subcategory classified straight from TRAVEL_SUBCATEGORIES --
        # never through the normal hardcoded-rules/CATEGORIES path (those are all local-merchant
        # patterns) and never through subcategory_for (which only knows Food/Transport and would
        # otherwise null out the subcategory just set here). Returns directly, skipping the
        # trailing subcategory_for call below.
        category = "Travel"
        subcategory = _get_cached_category(db, merchant, "travel")
        if subcategory is None:
            subcategory = ai_category(merchant, bank, TRAVEL_SUBCATEGORIES)
            if subcategory is not None:
                remember_category(db, merchant, subcategory, "travel")
        return category, subcategory

    if direction == DirectionEnum.credit:
        # None of the hardcoded rules (NTUC, Grab, Starbucks, ...) are meaningful for money
        # coming in -- skip straight to the credit-scoped cache/AI classification.
        category = _get_cached_category(db, merchant, direction.value)
        if category is None:
            category = ai_category(merchant, bank, CREDIT_CATEGORIES)
            if category is not None:
                remember_category(db, merchant, category, direction.value)
    else:
        category = hardcoded_category(merchant)
        if category is None:
            category = _get_cached_category(db, merchant, direction.value)
            if category is None:
                category = ai_category(merchant, bank, CATEGORIES)
                if category is not None:
                    remember_category(db, merchant, category, direction.value)
    subcategory = subcategory_for(category, merchant, txn_at)
    return category, subcategory
