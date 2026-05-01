
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Project, ProjectMember

engine = create_engine("sqlite:///./claritystack.db")
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

print("--- Project Members ---")
members = db.query(ProjectMember).all()
for m in members:
    print(f"ProjectID: {m.project_id}, Email: '{m.user_email}', Role: {m.role}")

db.close()
