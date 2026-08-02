from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models import DirectionEnum, FrequencyEnum, ProviderEnum


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    source_email_id: str
    provider: ProviderEnum | None
    amount: Decimal
    currency: str
    amount_sgd: Decimal | None
    direction: DirectionEnum
    merchant_raw: str | None
    merchant_clean: str | None
    category: str | None
    subcategory: str | None
    txn_at: datetime
    bank: str | None
    country: str | None
    raw_parsed: dict[str, Any] | None
    created_at: datetime


class EmailAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider: ProviderEnum
    provider_email: str
    last_synced_at: datetime | None
    created_at: datetime


class CategoryUpdateIn(BaseModel):
    category: str
    subcategory: str | None = None


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class CategoryCreateIn(BaseModel):
    name: str


class SubcategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    name: str


class SubcategoryCreateIn(BaseModel):
    name: str


class CategoriesOut(BaseModel):
    categories: list[CategoryOut]
    subcategories: list[SubcategoryOut]


class TransactionCreateIn(BaseModel):
    user_id: int
    amount: Decimal
    currency: str = "SGD"
    direction: DirectionEnum = DirectionEnum.debit
    merchant_raw: str | None = None
    merchant_clean: str | None = None
    category: str | None = None
    subcategory: str | None = None
    txn_at: datetime
    bank: str | None = None
    country: str | None = None


class TransactionDetailsUpdateIn(BaseModel):
    merchant: str
    amount: Decimal
    country: str | None = None


class CategorySummary(BaseModel):
    category: str | None
    total: Decimal


class SummaryOut(BaseModel):
    user_id: int
    month: str
    categories: list[CategorySummary]
    total: Decimal


class BudgetOut(BaseModel):
    user_id: int
    monthly_target: Decimal
    weekly_target: Decimal
    daily_target: Decimal


class BudgetUpdateIn(BaseModel):
    monthly_target: Decimal


class CategoryBudgetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category: str
    monthly_limit: Decimal


class CategoryBudgetUpdateIn(BaseModel):
    monthly_limit: Decimal


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    amount: Decimal
    frequency: FrequencyEnum
    next_due: datetime


class SubscriptionCreateIn(BaseModel):
    name: str
    amount: Decimal
    frequency: FrequencyEnum
    next_due: datetime


class SavingsGoalOut(BaseModel):
    user_id: int
    name: str
    target_amount: Decimal
    saved_amount: Decimal


class SavingsGoalUpdateIn(BaseModel):
    name: str
    target_amount: Decimal
    saved_amount: Decimal


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    name: str | None
    created_at: datetime


class UserUpdateIn(BaseModel):
    name: str


class RegisterIn(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str
