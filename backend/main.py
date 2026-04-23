from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Path, Query
from fastapi.responses import JSONResponse
from sqlmodel import Session, SQLModel
from fastapi.middleware.cors import CORSMiddleware
from art import *

from core.database import get_engine, get_db_session

tprint("Pura vida harni tsytsky",font="art")
tprint("Simple as possible as promised bro",font="cybermedum")

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

#app.include_router(knowledge_router.router)


@app.get("/api/message")
def read_root():
    return {"message": "Hello from FastAPI!"}

@app.get("/api/health")
def health_check():
    return {"message": "Pura vida harni tsytsky!", "status": "up", "backend": "running"}
