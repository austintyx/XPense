from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models import DirectionEnum, ProviderEnum, TransactionTypeEnum


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    source_email_id: str
    provider: ProviderEnum | None
    amount: Decimal
    currency: str
    direction: DirectionEnum
    type: TransactionTypeEnum
    merchant_raw: str | None
    merchant_clean: str | None
    category: str | None
    subcategory: str | None
    txn_at: datetime
    bank: str | None
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


class TransactionCreateIn(BaseModel):
    user_id: int
    amount: Decimal
    currency: str = "SGD"
    direction: DirectionEnum = DirectionEnum.debit
    type: TransactionTypeEnum = TransactionTypeEnum.expense
    merchant_raw: str | None = None
    merchant_clean: str | None = None
    category: str | None = None
    txn_at: datetime
    bank: str | None = None


class CategorySummary(BaseModel):
    category: str | None
    total: Decimal


class SummaryOut(BaseModel):
    user_id: int
    month: str
    categories: list[CategorySummary]
    total: Decimal
