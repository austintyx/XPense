from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth,
    budget,
    categories,
    category_budgets,
    email_accounts,
    goals,
    health,
    subscriptions,
    sync,
    transactions,
    users,
)
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="XPense API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Auth is carried via a user_id in query params/bodies, not cookies -- no cross-origin
    # credentialed requests exist, so allow_credentials stays False (also mutually exclusive
    # with a wildcard-friendly origin story if this ever needed to loosen further).
    allow_origins=[origin.strip() for origin in settings.cors_allowed_origins.split(",") if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)
app.include_router(health.router)
app.include_router(transactions.router)
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(email_accounts.router)
app.include_router(budget.router)
app.include_router(goals.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(category_budgets.router)
app.include_router(subscriptions.router)
