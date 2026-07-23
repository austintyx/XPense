from fastapi import FastAPI

from app.routers import auth, health, transactions

app = FastAPI(title="XPense API")
app.include_router(health.router)
app.include_router(transactions.router)
app.include_router(auth.router)
