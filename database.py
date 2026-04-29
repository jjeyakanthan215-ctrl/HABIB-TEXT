import sqlite3
import hashlib
import bcrypt
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
    # Ensure admin role is set for the default admin users
    cursor.execute("UPDATE users SET role = 'admin' WHERE username IN ('HABIB_Admin', 'Gayathri') AND (role IS NULL OR role = 'user')")
    conn.commit()
    conn.close()

    # Create default admin users if they do not exist
    create_user('HABIB_Admin', 'Habib@215', role='admin')
    create_user('Gayathri', 'Gayu215', role='admin')

def hash_password(password: str) -> str:
    # Use bcrypt to hash the password securely
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

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

    if row:
        stored_hash = row['password_hash']
        # Check for legacy SHA-256 hash (length 64, hex)
        if len(stored_hash) == 64 and not stored_hash.startswith('$'):
            legacy_hash = hashlib.sha256(password.encode('utf-8')).hexdigest()
            if stored_hash == legacy_hash:
                # Optionally, we could rehash and update the db here, but keeping it simple
                return row['role']
        else:
            # Bcrypt verify
            try:
                if bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8')):
                    return row['role']
            except ValueError:
                pass
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

def delete_user(username: str) -> bool:
    """Permanently delete a registered user. Admin accounts are protected."""
    if username in ['HABIB_Admin', 'Gayathri']:
        return False
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute('DELETE FROM users WHERE username = ?', (username,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# Initialize the database on module import
init_db()
