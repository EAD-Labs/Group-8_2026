from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app import models  # noqa: F401 — ensure models are registered before create_all
from app.routers import auth, topics, classroom, checkpoint, progress, voice

app = FastAPI(title="AI KYRO — Metacognitive AI Scaffold API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(topics.router)
app.include_router(classroom.router)
app.include_router(checkpoint.router)
app.include_router(progress.router)
app.include_router(voice.router)


@app.on_event("startup")
def on_startup():
    # dev convenience: auto-create tables against sqlite. Swap for Alembic
    # migrations before this touches a real Postgres instance (HLD 8.4).
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
