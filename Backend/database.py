import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session



# ─── DB URL from env (default to local SQLite for dev) ───────────────────────
# §4.2: the URL is now read from the environment instead of being hardcoded, so
# the documented Postgres path actually works (set DATABASE_URL=postgresql+psycopg2://…).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./claritystack.db")
_IS_SQLITE = DATABASE_URL.startswith("sqlite")
print("USING DB:", DATABASE_URL)


# ─── Single engine ───────────────────────────────────────────────────────────
# check_same_thread=False is a SQLite-only flag (needed under FastAPI's threadpool);
# it is invalid for Postgres, so only pass it for SQLite.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _IS_SQLITE else {},
    echo=False,
)


# ─── WAL mode + foreign keys on every new connection (SQLite only) ───────────
# These PRAGMAs are SQLite-specific; running them against Postgres errors. Guard
# the listener on the dialect so the same code serves both backends.
if _IS_SQLITE:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")   # concurrent readers + writer
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")  # safe and faster than FULL
        cursor.close()


# ─── Session factory ──────────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# ─── FastAPI dependency ───────────────────────────────────────────────────────
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Postgres migration note ──────────────────────────────────────────────────
# To migrate to Postgres (recommended for production):
#   1. Install: pip install psycopg2-binary alembic
#   2. Set DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/claritystack
#      (the code above already reads it and skips the SQLite-only flags/PRAGMAs).
#   3. Run: alembic upgrade head   (Alembic is the source of truth; see §2.3)
# The SQLAlchemy ORM layer is already database-agnostic; no model changes needed.
