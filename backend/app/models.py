import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base


class ProviderEnum(str, enum.Enum):
    google = "google"
    microsoft = "microsoft"


class DirectionEnum(str, enum.Enum):
    debit = "debit"
    credit = "credit"


class FrequencyEnum(str, enum.Enum):
    weekly = "weekly"
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Nullable -- accounts created purely via Gmail/Outlook OAuth never set one; password login is
    # opt-in on top of that, either at registration or by later "claiming" a password-less account.
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    email_accounts: Mapped[list["EmailAccount"]] = relationship(back_populates="user")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user")
    categories: Mapped[list["Category"]] = relationship(back_populates="user")
    subcategories: Mapped[list["Subcategory"]] = relationship(back_populates="user")
    category_budgets: Mapped[list["CategoryBudget"]] = relationship(back_populates="user")
    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="user")


class EmailAccount(Base):
    __tablename__ = "email_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    provider: Mapped[ProviderEnum] = mapped_column(SAEnum(ProviderEnum, name="provider_enum"), nullable=False)
    provider_email: Mapped[str] = mapped_column(String, nullable=False)
    access_token_enc: Mapped[str] = mapped_column(String, nullable=False)
    refresh_token_enc: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="email_accounts")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    source_email_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    provider: Mapped[ProviderEnum | None] = mapped_column(
        SAEnum(ProviderEnum, name="provider_enum"), nullable=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    direction: Mapped[DirectionEnum] = mapped_column(SAEnum(DirectionEnum, name="direction_enum"), nullable=False)
    merchant_raw: Mapped[str | None] = mapped_column(String, nullable=True)
    merchant_clean: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    subcategory: Mapped[str | None] = mapped_column(String, nullable=True)
    txn_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    bank: Mapped[str | None] = mapped_column(String, nullable=True)
    # Optional, human-entered/edited override -- when unset, the frontend derives a display
    # country from `currency` (see app/src/utils/derive.ts's effectiveCountry). No backend logic
    # ever writes this automatically; it only ever reflects what a person explicitly entered.
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    # SGD-equivalent of `amount`, computed via services/fx.py at save time using that month's
    # average exchange rate -- `amount`/`currency` above are never touched, so the original foreign
    # amount always stays available for display. Equals `amount` verbatim when `currency` is
    # already "SGD" (no lookup needed). Nullable because a rate lookup can fail (unsupported
    # currency, the FX API being down) -- every aggregate query falls back to raw `amount` via
    # COALESCE in that case rather than dropping the transaction from totals.
    amount_sgd: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    raw_parsed: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="transactions")


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    icon: Mapped[str | None] = mapped_column(String, nullable=True)

    user: Mapped["User"] = relationship(back_populates="categories")


class Subcategory(Base):
    __tablename__ = "subcategories"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Free text, matching a built-in category name or a custom Category.name -- same convention
    # Transaction.category/subcategory already use (no FK, since built-in categories aren't rows).
    category: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)

    user: Mapped["User"] = relationship(back_populates="subcategories")


class CategoryBudget(Base):
    __tablename__ = "category_budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    # Free text, same convention as Subcategory.category -- built-in categories (Food, Transport,
    # ...) have no row in Category, so a limit keyed by Category.id would silently exclude them.
    category: Mapped[str] = mapped_column(String, nullable=False)
    monthly_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    user: Mapped["User"] = relationship(back_populates="category_budgets")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    frequency: Mapped[FrequencyEnum] = mapped_column(SAEnum(FrequencyEnum, name="frequency_enum"), nullable=False)
    next_due: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped["User"] = relationship(back_populates="subscriptions")


class MerchantCategoryCache(Base):
    __tablename__ = "merchant_category_cache"

    # Not user-scoped, deliberately -- "STARBUCKS is Food" is a fact independent of whose account
    # synced it, so one global cache maximizes hits across every user, not just within one.
    id: Mapped[int] = mapped_column(primary_key=True)
    merchant_key: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    monthly_target: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class FxRate(Base):
    __tablename__ = "fx_rates"

    # A small cache of monthly-average CCY->SGD rates (services/fx.py) so repeated transactions
    # in an already-known month don't each re-hit the FX API. Only fully-elapsed months get cached
    # (see fx.py) -- the current, still-in-progress month's average shifts day to day, so it's
    # recomputed fresh every time rather than caching a partial answer.
    id: Mapped[int] = mapped_column(primary_key=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    year: Mapped[int] = mapped_column(nullable=False)
    month: Mapped[int] = mapped_column(nullable=False)
    rate_to_sgd: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("currency", "year", "month", name="uq_fx_rates_currency_year_month"),)


class SavingsGoal(Base):
    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    saved_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
