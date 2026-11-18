"""Create the first Selea administrator using the server console, not an HTTP endpoint."""
import getpass
import secrets
import sys
import uuid
from .main import db, password_hash

if __name__ == "__main__":
    email = input("Admin email: ").strip().lower()
    if "@" not in email:
        sys.exit("Invalid email")
    password = getpass.getpass("New admin password (12+ chars): ")
    if len(password) < 12:
        sys.exit("Password too short")
    with db() as con:
        if con.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            sys.exit("Account already exists. No promotion performed. Use a new email or review the database manually.")
        uid = uuid.uuid4().hex
        salt = secrets.token_hex(16)
        con.execute("INSERT INTO users(id,email,name,password) VALUES(?,?,?,?)", (uid,email,email.split("@")[0],salt+":"+password_hash(password,salt)))
        con.execute("INSERT INTO video_admins(user_id) VALUES(?)", (uid,))
    print("Administrator created. Sign in at /account.")
