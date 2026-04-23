from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from art import *

app = FastAPI()

# Allow the React frontend to communicate with this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/message")
def read_root():
    return {"message": "Hello from FastAPI!"}

@app.get("/api/health")
def health_check():
    return {"message": "Pura vida harni tsytsky!", "status": "up", "backend": "running"}
