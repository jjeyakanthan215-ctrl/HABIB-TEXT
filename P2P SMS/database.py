import sqlite3
import hashlib
import os

# On Render, use /data for persistent storage (set DB_PATH env var in Render dashboard).
# Falls back to local users.db for development.
DB_FILE = os.environ.get('DB_PATH', 'users.db')

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    # Ensure the directory exists (important when DB_PATH points to /data/)
    db_dir = os.path.dirname(DB_FILE)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    ''')
    # Migration: add role column if upgrading from an older DB schema
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'")
    except Exception:
        pass  # Column already exists, that's fine
    # Ensure admin role is set for the default admin user
    cursor.execute("UPDATE users SET role = 'admin' WHERE username = 'HABIB_Admin' AND (role IS NULL OR role = 'user')")
    conn.commit()
    conn.close()

    # Create default admin user if not exists
    create_user('HABIB_Admin', 'Habib@215', role='admin')

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def create_user(username: str, password: str, role: str = 'user') -> bool:
    """Create a new user. Returns True if successful, False if username exists."""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
            (username, hash_password(password), role)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username: str, password: str):
    """
    Verify a user's password.
    Returns the user's role string on success, or None on failure.
    """
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT password_hash, role FROM users WHERE username = ?', (username,))
    row = cursor.fetchone()
    conn.close()

    if row and row['password_hash'] == hash_password(password):
        return row['role']
    return None

def get_total_users() -> int:
    """Return the total number of registered users."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) as count FROM users')
    row = cursor.fetchone()
    conn.close()
    return row['count'] if row else 0

def get_all_users():
    """Return a list of all registered users."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, username, role FROM users')
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r['id'], "username": r['username'], "role": r['role']} for r in rows]

# Initialize the database on module import
init_db()
