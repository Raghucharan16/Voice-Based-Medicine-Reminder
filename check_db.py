#!/usr/bin/env python3
"""
Script to check database tables
"""

import sqlite3
import os

# Database path
db_path = "data/medicine_reminder.db"

if os.path.exists(db_path):
    print(f"Database file exists: {db_path}")
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get all table names
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    
    print(f"Tables found: {[table[0] for table in tables]}")
    
    # Check each table structure
    for table in tables:
        table_name = table[0]
        print(f"\n--- Table: {table_name} ---")
        cursor.execute(f"PRAGMA table_info({table_name});")
        columns = cursor.fetchall()
        for col in columns:
            print(f"  {col[1]} ({col[2]})")
    
    conn.close()
else:
    print(f"Database file does not exist: {db_path}")
