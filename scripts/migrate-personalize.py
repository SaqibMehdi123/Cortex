#!/usr/bin/env python3
"""Backfill userId on every user-owned table.

Adds a `userId` column to each table that the new per-user schema expects and
assigns every existing row to the FIRST registered user (the original owner of
this workspace). Safe to re-run: existing userId columns are left untouched.
Run before `prisma db push` so the required columns already hold valid values.
"""
import sqlite3
import sys

DB = "db/custom.db"

TABLES = [
    "Document", "Highlight", "ChatMessage", "Note", "Goal", "Milestone",
    "Task", "Plan", "NewsArticle", "CustomSource", "Paper", "Opportunity",
    "JobListing", "MindMap", "Flashcard", "ReviewLog", "ReadingSession",
    "FocusSession", "Setting",
]

con = sqlite3.connect(DB)
cur = con.cursor()

users = cur.execute("SELECT id, email FROM User ORDER BY createdAt ASC").fetchall()
if not users:
    print("No users found — nothing to backfill.")
    sys.exit(0)

owner_id, owner_email = users[0]
print(f"Assigning all existing data to: {owner_email} ({owner_id})")

for table in TABLES:
    cols = {r[1] for r in cur.execute(f'PRAGMA table_info("{table}")')}
    if "userId" not in cols:
        cur.execute(f'ALTER TABLE "{table}" ADD COLUMN "userId" TEXT NOT NULL DEFAULT \'\'')
        print(f"  + {table}: added userId column")
    n = cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE "userId" != ?', (owner_id,)).fetchone()[0]
    if n:
        cur.execute(f'UPDATE "{table}" SET "userId" = ? WHERE "userId" != ?', (owner_id, owner_id))
        print(f"  ~ {table}: reassigned {n} row(s)")
    else:
        print(f"  = {table}: already owned")

con.commit()
con.close()
print("Backfill complete. Now run: npx prisma db push")
