import os
import psycopg2
from dotenv import load_dotenv
import re

# Path to the .env file
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path)

def check_connection():
    db_url = os.getenv("DATABASE_URL")
    print(f"Attempting to connect to: {db_url}")
    
    # Standardize the URL for psycopg2 (remove +psycopg2 if present)
    clean_url = re.sub(r'postgresql\+psycopg2://', 'postgresql://', db_url)
    
    try:
        # Connect to the database
        conn = psycopg2.connect(clean_url)
        print("Successfully connected to the database!")
        
        # Create a cursor
        cur = conn.cursor()
        
        # Check if tables exist
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = cur.fetchall()
        
        if tables:
            print(f"Found {len(tables)} tables:")
            for table in tables:
                print(f" - {table[0]}")
        else:
            print("Connected, but no tables found in the 'public' schema.")
            print("Note: This is likely a fresh database. The backend should automatically create tables on startup if configured to do so (Base.metadata.create_all).")
            
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Failed to connect: {e}")

if __name__ == "__main__":
    check_connection()
