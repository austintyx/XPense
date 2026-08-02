import calendar
from datetime import date, datetime, timezone
from decimal import Decimal

import httpx
from sqlalchemy.orm import Session

from app.models import FxRate

# Frankfurter (ECB reference rates) -- free, no API key, no rate limit for personal-scale use.
# Confirmed live: /v1/{start}..{end}?from=CCY&to=SGD returns one rate per business day in the
# range (no entry for weekends/ECB holidays, so callers must average only the days actually
# returned, not assume every calendar day has one).
FRANKFURTER_BASE = "https://api.frankfurter.dev/v1"


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _fetch_monthly_average(currency: str, year: int, month: int) -> Decimal | None:
    start, end = _month_bounds(year, month)
    # A still-in-progress month can't ask the API for days that haven't happened yet.
    today = datetime.now(timezone.utc).date()
    if end > today:
        end = today
    try:
        response = httpx.get(
            f"{FRANKFURTER_BASE}/{start.isoformat()}..{end.isoformat()}",
            params={"from": currency.upper(), "to": "SGD"},
            timeout=10,
        )
        response.raise_for_status()
        daily_rates = response.json().get("rates", {})
    except (httpx.HTTPError, ValueError):
        return None

    rates = [Decimal(str(day["SGD"])) for day in daily_rates.values() if "SGD" in day]
    if not rates:
        return None
    return sum(rates) / len(rates)


def get_monthly_average_rate(db: Session, currency: str, year: int, month: int) -> Decimal | None:
    """CCY->SGD average rate for one calendar month. Cached in `fx_rates` once the month has fully
    elapsed (a still-in-progress month's average shifts as new days publish, so that case is
    always recomputed fresh rather than caching a partial answer). Never raises -- an unsupported
    currency, a network error, or a malformed response all return None, so a failed lookup can
    never block a sync (same convention as categorize.py's ai_category)."""
    currency = currency.upper()
    now = datetime.now(timezone.utc)
    month_has_elapsed = (year, month) < (now.year, now.month)

    if month_has_elapsed:
        cached = db.query(FxRate).filter_by(currency=currency, year=year, month=month).first()
        if cached is not None:
            return cached.rate_to_sgd

    rate = _fetch_monthly_average(currency, year, month)
    if rate is None:
        return None

    if month_has_elapsed:
        db.add(FxRate(currency=currency, year=year, month=month, rate_to_sgd=rate))
        db.commit()

    return rate


def get_amount_in_sgd(db: Session, amount: Decimal, currency: str, txn_at: datetime) -> Decimal | None:
    """SGD-equivalent of `amount` for aggregation purposes -- `amount`/`currency` on the
    Transaction itself are never touched, this just fills the separate `amount_sgd` column. SGD
    input short-circuits (rate 1, no network call). Never raises; None means "couldn't convert",
    and callers should fall back to the raw amount rather than dropping the transaction."""
    if currency.upper() == "SGD":
        return amount

    rate = get_monthly_average_rate(db, currency, txn_at.year, txn_at.month)
    if rate is None:
        return None
    return amount * rate
