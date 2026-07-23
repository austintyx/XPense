from fastapi import FastAPI

from app.routers import health, transactions

app = FastAPI(title="XPense API")
app.include_router(health.router)
app.include_router(transactions.router)
