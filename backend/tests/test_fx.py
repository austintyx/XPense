from datetime import datetime, timezone
from decimal import Decimal

import httpx
import pytest

from app.models import FxRate
from app.services import fx


def _fake_response(rates_by_day: dict[str, float]) -> httpx.Response:
    return httpx.Response(
        200,
        json={"rates": {day: {"SGD": rate} for day, rate in rates_by_day.items()}},
        request=httpx.Request("GET", "https://api.frankfurter.dev/v1/x"),
    )


def test_get_amount_in_sgd_short_circuits_for_sgd_with_no_network_call(db_session, monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("must not call the network for an already-SGD amount")

    monkeypatch.setattr(httpx, "get", fail_if_called)
    result = fx.get_amount_in_sgd(db_session, Decimal("19.80"), "SGD", datetime(2026, 7, 1, tzinfo=timezone.utc))
    assert result == Decimal("19.80")


def test_get_monthly_average_rate_averages_the_daily_rates_returned(db_session, monkeypatch):
    monkeypatch.setattr(
        httpx, "get", lambda *a, **k: _fake_response({"2026-07-01": 0.30, "2026-07-02": 0.32, "2026-07-03": 0.31})
    )
    rate = fx.get_monthly_average_rate(db_session, "MYR", 2026, 7)
    assert rate == Decimal("0.31")


def test_get_monthly_average_rate_ignores_days_with_no_published_rate(db_session, monkeypatch):
    # ECB doesn't publish on weekends/holidays -- averaging must use only the days actually
    # returned, not divide by the number of calendar days in the month.
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _fake_response({"2026-07-01": 0.30, "2026-07-02": 0.30}))
    rate = fx.get_monthly_average_rate(db_session, "MYR", 2026, 7)
    assert rate == Decimal("0.30")


def test_get_monthly_average_rate_returns_none_on_http_error(db_session, monkeypatch):
    def raise_error(*args, **kwargs):
        raise httpx.ConnectError("no network", request=httpx.Request("GET", "https://api.frankfurter.dev/v1/x"))

    monkeypatch.setattr(httpx, "get", raise_error)
    assert fx.get_monthly_average_rate(db_session, "MYR", 2026, 7) is None


def test_get_monthly_average_rate_returns_none_for_a_currency_with_no_published_rates(db_session, monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _fake_response({}))
    assert fx.get_monthly_average_rate(db_session, "XYZ", 2026, 7) is None


def test_get_monthly_average_rate_caches_a_fully_elapsed_month(db_session, monkeypatch):
    calls = []

    def counted_get(*args, **kwargs):
        calls.append(1)
        return _fake_response({"2026-07-01": 0.30, "2026-07-02": 0.32})

    monkeypatch.setattr(httpx, "get", counted_get)

    first = fx.get_monthly_average_rate(db_session, "MYR", 2026, 7)
    assert len(calls) == 1
    assert db_session.query(FxRate).filter_by(currency="MYR", year=2026, month=7).count() == 1

    # Same (fully-elapsed) month again -- must hit the cache, not the network.
    second = fx.get_monthly_average_rate(db_session, "MYR", 2026, 7)
    assert len(calls) == 1
    assert second == first


def test_get_monthly_average_rate_never_caches_the_current_in_progress_month(db_session, monkeypatch):
    calls = []

    def counted_get(*args, **kwargs):
        calls.append(1)
        return _fake_response({"2026-07-01": 0.30})

    monkeypatch.setattr(httpx, "get", counted_get)
    now = datetime.now(timezone.utc)

    fx.get_monthly_average_rate(db_session, "MYR", now.year, now.month)
    fx.get_monthly_average_rate(db_session, "MYR", now.year, now.month)
    assert len(calls) == 2
    assert db_session.query(FxRate).filter_by(currency="MYR", year=now.year, month=now.month).count() == 0


def test_get_amount_in_sgd_uses_the_previous_calendar_month_not_the_transactions_own_month(db_session, monkeypatch):
    # A transaction dated 15 Jul must convert using JUNE's average rate, not July's -- the
    # previous month is always fully elapsed by construction, so it's immediately stable/cacheable
    # with no partial-month averaging ever needed, unlike using the transaction's own month.
    calls = []

    def capturing_get(url, **kwargs):
        calls.append(url)
        return _fake_response({"2026-06-01": 0.32})

    monkeypatch.setattr(httpx, "get", capturing_get)
    result = fx.get_amount_in_sgd(db_session, Decimal("100.00"), "myr", datetime(2026, 7, 15, tzinfo=timezone.utc))

    assert result == Decimal("32.00")
    assert len(calls) == 1
    assert "2026-06-01..2026-06-30" in calls[0]


def test_get_amount_in_sgd_resolves_january_to_december_of_the_prior_year(db_session, monkeypatch):
    calls = []

    def capturing_get(url, **kwargs):
        calls.append(url)
        return _fake_response({"2025-12-01": 0.55})

    monkeypatch.setattr(httpx, "get", capturing_get)
    result = fx.get_amount_in_sgd(db_session, Decimal("10.00"), "USD", datetime(2026, 1, 10, tzinfo=timezone.utc))

    assert result == Decimal("5.50")
    assert "2025-12-01..2025-12-31" in calls[0]


def test_previous_month_handles_the_year_rollover():
    assert fx._previous_month(2026, 7) == (2026, 6)
    assert fx._previous_month(2026, 1) == (2025, 12)


def test_get_amount_in_sgd_returns_none_when_conversion_fails(db_session, monkeypatch):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("down", request=None)))
    assert fx.get_amount_in_sgd(db_session, Decimal("100.00"), "MYR", datetime(2026, 7, 15, tzinfo=timezone.utc)) is None
