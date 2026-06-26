from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.engine import Engine

from models import Base


DATABASE_URL = "sqlite:///./claritystack.db"
print("USING DB FILE:", DATABASE_URL)


# ─── Single engine (no duplicate) ────────────────────────────────────────────
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)


# ─── WAL mode + foreign keys on every new connection ─────────────────────────
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
#   3. Remove connect_args and the pragma listener above
#   4. Run: alembic init migrations && alembic revision --autogenerate -m "init"
#   5. Run: alembic upgrade head
# The SQLAlchemy ORM layer is already database-agnostic; no model changes needed.
