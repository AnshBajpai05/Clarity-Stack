import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine.url import make_url
from dotenv import load_dotenv

from models import Base

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/claritystack"
)
print("USING DB:", DATABASE_URL.split("@")[-1])  # log host/db only, never the password


# ---------------------------------------------------------------------------
# Auto-bootstrap: create the Postgres database if it doesn't exist yet.
# This means teammates only need Postgres installed — no manual CREATE DATABASE.
# ---------------------------------------------------------------------------
def _ensure_database_exists(url: str) -> None:
    try:
        parsed = make_url(url)
        db_name = parsed.database
        # Connect to the default maintenance db ('postgres') to run CREATE DATABASE
        admin_url = url.replace(f"/{db_name}", "/postgres", 1)
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", echo=False)
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": db_name}
            ).fetchone()
            if not exists:
                conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                print(f"[DB] Created database '{db_name}'")
            else:
                print(f"[DB] Database '{db_name}' already exists")
        admin_engine.dispose()
    except Exception as e:
        print(f"[DB] WARNING: Could not auto-create database: {e}")


_ensure_database_exists(DATABASE_URL)


# ---------------------------------------------------------------------------
# Engine — Postgres connection pool (no SQLite-specific args)
# ---------------------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    pool_size=10,          # keep 10 persistent connections
    max_overflow=20,       # allow up to 20 extra under burst load
    pool_pre_ping=True,    # test connections before handing them out
    echo=False
)


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
