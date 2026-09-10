from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.content.loader import load_content
from app.database import Base, engine
from app import models  # noqa: F401 — ensure models are registered before create_all
from app.routers import auth, baseline, checkpoint, classroom, progress, topics, voice


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate authored content before serving a single request. A bad
    # misconception reference would otherwise surface as an unaggregatable
    # doubt-log row days into a pilot; failing at boot is far cheaper.
    load_content()

    if settings.env == "dev":
        # dev convenience against sqlite. Alembic owns the schema everywhere
        # else — see backend/migrations. Running create_all against a database
        # Alembic manages would create tables outside its version history and
        # leave the next migration unable to apply.
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AI KYRO — Metacognitive AI Scaffold API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Set CORS_ALLOW_ORIGINS in .env for staging/production (PROJECT.md D8).
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # EventSource reconnects send Last-Event-ID; it must survive CORS or SSE
    # resume silently degrades to replaying from turn 0 (HLD T2.10).
    expose_headers=["Last-Event-ID"],
)

app.include_router(auth.router)
app.include_router(topics.router)
app.include_router(classroom.router)
app.include_router(baseline.router)
app.include_router(checkpoint.router)
app.include_router(progress.router)
app.include_router(voice.router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "llm_mode": settings.llm_mode,
        "speech_provider": settings.speech_provider,
    }
