import os
import sys

# Add services/api to path
sys.path.append(os.path.join(os.getcwd(), 'services', 'api'))

from app.db.session import engine, Base
from app.models import entities
from sqlalchemy import text

def init_db():
    print("Connecting to database...")
    try:
        with engine.connect() as conn:
            print("Connection successful!")
            print("Creating tables...")
            Base.metadata.create_all(bind=engine)
            print("Tables created successfully!")
            
            # Check tables
            result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
            tables = result.fetchall()
            print(f"Total tables in DB: {len(tables)}")
            for t in tables:
                print(f" - {t[0]}")
                
    except Exception as e:
        print(f"Error during DB init: {e}")

if __name__ == "__main__":
    init_db()
