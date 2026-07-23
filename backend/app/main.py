from fastapi import FastAPI

from app.routers import health

app = FastAPI(title="XPense API")
app.include_router(health.router)
