
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Project

engine = create_engine("sqlite:///./claritystack.db")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

projects = db.query(Project).all()
for p in projects:
    print(f"ID: {p.id}, Name: '{p.name}', Visibility: {p.visibility}, Owner: {p.owner}")

db.close()
