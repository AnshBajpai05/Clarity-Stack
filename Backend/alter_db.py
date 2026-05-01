import sqlite3

def upgrade():
    try:
        conn = sqlite3.connect("claritystack.db")
        cur = conn.cursor()
        
        try:
            cur.execute("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user' NOT NULL")
            print("Added role to users")
        except Exception as e:
            print(f"Role exist: {e}")
            
        try:
            cur.execute("ALTER TABLE projects ADD COLUMN visibility VARCHAR(50) DEFAULT 'private' NOT NULL")
            print("Added visibility to projects")
        except Exception as e:
            print(f"Visibility exist: {e}")
            
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    upgrade()
