from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session, scoped_session
from sqlalchemy.engine import Engine

from models import Base


DATABASE_URL = "sqlite:///./claritystack.db"
print("USING DB FILE:", DATABASE_URL)


# --- Enable SQLite foreign keys ---
@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# --- Create engine ---
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # SQLite only
    echo=False
)


# --- Session factory ---
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# --- Dependency for FastAPI ---
def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

@event.listens_for(engine, "connect")
def enable_fk(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
