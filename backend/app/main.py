from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers import auth, budget, categories, email_accounts, goals, health, sync, transactions, users
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="XPense API", lifespan=lifespan)
app.include_router(health.router)
app.include_router(transactions.router)
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(email_accounts.router)
app.include_router(budget.router)
app.include_router(goals.router)
app.include_router(users.router)
app.include_router(categories.router)
