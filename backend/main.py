from contextlib import asynccontextmanager
from fastapi import FastAPI

from sqlmodel import SQLModel
from fastapi.middleware.cors import CORSMiddleware
from art import *

import core.models
from core.database import get_engine
from api.routers import (
    participants_router,
    buildings_router,
    apartments_router,
    employers_router,
    venues_router,
    jobs_router,
    checkin_router,
    financial_router,
    social_router,
    travel_router,
    activity_router,
)

tprint("Pura vida harni tsytsky",font="art")
print("Access API docs thorught this endpoint: http://localhost:8000/docs")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing hpdav api...")
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    print("Database tables verified/created.")
    yield
    print("Shutting down hpdav api...")


app = FastAPI()

# Allow the React frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(participants_router, prefix="/api")
app.include_router(buildings_router, prefix="/api")
app.include_router(apartments_router, prefix="/api")
app.include_router(employers_router, prefix="/api")
app.include_router(venues_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(checkin_router, prefix="/api")
app.include_router(financial_router, prefix="/api")
app.include_router(social_router, prefix="/api")
app.include_router(travel_router, prefix="/api")
app.include_router(activity_router, prefix="/api")


@app.get("/api/message")
def read_root():
    return {"message": "Hello from FastAPI!"}

@app.get("/api/health")
def health_check():
    return {"message": "Pura vida harni tsytsky!", "status": "up", "backend": "running"}
