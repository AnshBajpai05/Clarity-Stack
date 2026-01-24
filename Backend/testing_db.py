from database import SessionLocal

db = SessionLocal()
print("DB opened successfully")
db.close()
