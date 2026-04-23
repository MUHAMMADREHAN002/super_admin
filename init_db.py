from backend.database import SessionLocal, engine
from backend import models, auth
from datetime import datetime, timedelta
import random

# ─── Sample audit events per role ────────────────────────────────────────────
SUPER_ADMIN_LOGS = [
    ("login",             "Successful login from admin panel",                "192.168.1.1"),
    ("create_admin",      "Created admin account john@example.com",           "192.168.1.1"),
    ("view_audit_logs",   "Accessed system-wide audit log viewer",            "192.168.1.1"),
    ("update_user_role",  "Changed jane@example.com role: user → admin",      "192.168.1.1"),
    ("login",             "Successful login — session renewed",               "10.0.0.5"),
    ("disable_user",      "Deactivated user bob@example.com",                 "10.0.0.5"),
    ("enable_user",       "Re-enabled user bob@example.com",                  "10.0.0.5"),
    ("view_dashboard",    "Loaded KPI dashboard — 3 widgets",                 "10.0.0.5"),
    ("save_layout",       "Dashboard layout saved (bar, line, pie widgets)",  "10.0.0.5"),
    ("login",             "Login from new IP detected",                        "203.0.113.7"),
    ("SYSTEM_ERROR",      "Unhandled ZeroDivisionError: division by zero",     "127.0.0.1", "ERROR", "calculate_revenue", 42),
    ("SYSTEM_ERROR",      "Database Connection Timeout during sync",           "127.0.0.1", "ERROR", "sync_external_data", 108),
]

ADMIN_LOGS = [
    ("register",          "Account created by super admin",                   "192.168.1.1"),
    ("login",             "First successful login",                           "192.168.1.10"),
    ("view_users",        "Accessed user directory — 4 records",              "192.168.1.10"),
    ("update_user",       "Updated jane@example.com status to inactive",      "192.168.1.10"),
    ("login",             "Session login — daily access",                     "192.168.1.10"),
    ("view_audit_logs",   "Attempted to access system-wide logs (denied)",    "172.16.0.3"),
    ("login_failed",      "ERROR: Incorrect password attempt — brute force?", "198.51.100.42"),
    ("login_failed",      "ERROR: Second failed login attempt",               "198.51.100.42"),
    ("login",             "Successful login after failed attempts",           "192.168.1.10"),
    ("save_layout",       "Saved dashboard with revenue + sessions widgets",  "192.168.1.10"),
]

USER_JANE_LOGS = [
    ("register",          "Self-registration via signup form",                "10.20.30.40"),
    ("login",             "Successful first login",                           "10.20.30.40"),
    ("login",             "Login — normal session",                           "10.20.30.41"),
    ("view_dashboard",    "Accessed personal dashboard",                      "10.20.30.41"),
    ("login_failed",      "ERROR: Session token expired — forced re-login",   "10.20.30.41"),
    ("login",             "Re-authenticated after session expiry",            "10.20.30.41"),
    ("login",             "Login from mobile browser detected",               "172.16.5.100"),
]

USER_BOB_LOGS = [
    ("register",          "Account seeded by system init script",             "127.0.0.1"),
    ("login",             "First login via admin-provided credentials",       "10.40.50.60"),
    ("login_failed",      "ERROR: Wrong password — account temporarily locked","198.51.100.11"),
    ("login",             "Account unlocked, successful login",               "10.40.50.60"),
    ("view_dashboard",    "Opened KPI dashboard for the first time",          "10.40.50.60"),
    ("login_failed",      "ERROR: Login attempt from unrecognized IP",        "203.0.113.99"),
]

def make_logs(db, user, log_entries):
    """Create AuditLog entries for a user with staggered timestamps."""
    base = datetime.utcnow() - timedelta(hours=len(log_entries) * 3)
    for i, entry in enumerate(log_entries):
        # Extract fields based on entry length (to support old and new formats)
        action = entry[0]
        detail = entry[1]
        ip     = entry[2]
        level  = entry[3] if len(entry) > 3 else "INFO"
        func   = entry[4] if len(entry) > 4 else None
        line   = entry[5] if len(entry) > 5 else None

        ts = base + timedelta(hours=i * 3, minutes=random.randint(0, 59))
        db.add(models.AuditLog(
            user_id       = user.id,
            action        = action,
            detail        = detail,
            ip_address    = ip,
            level         = level,
            function_name = func,
            line_number   = line,
            timestamp     = ts,
        ))

def init_db():
    print("Resetting database tables...")
    models.Base.metadata.drop_all(bind=engine)
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # ── Super Admin ──────────────────────────────────────────────────────────
    super_admin = models.User(
        email           = "super@rfiagent.com",
        full_name       = "System Superadmin",
        hashed_password = auth.get_password_hash("admin123"),
        role            = "super_admin",
        is_active       = True,
        created_at      = datetime.utcnow() - timedelta(days=30),
        last_login      = datetime.utcnow() - timedelta(hours=1),
    )
    db.add(super_admin)
    db.flush()  # get ID without committing
    make_logs(db, super_admin, SUPER_ADMIN_LOGS)

    # ── Admin ────────────────────────────────────────────────────────────────
    admin = models.User(
        email           = "admin@rfiagent.com",
        full_name       = "John Doe",
        hashed_password = auth.get_password_hash("admin123"),
        role            = "admin",
        is_active       = True,
        created_at      = datetime.utcnow() - timedelta(days=20),
        last_login      = datetime.utcnow() - timedelta(hours=5),
    )
    db.add(admin)
    db.flush()
    make_logs(db, admin, ADMIN_LOGS)

    # ── Users ────────────────────────────────────────────────────────────────
    jane = models.User(
        email           = "jane@example.com",
        full_name       = "Jane Smith",
        hashed_password = auth.get_password_hash("password123"),
        role            = "user",
        is_active       = True,
        created_at      = datetime.utcnow() - timedelta(days=15),
        last_login      = datetime.utcnow() - timedelta(hours=10),
    )
    db.add(jane)
    db.flush()
    make_logs(db, jane, USER_JANE_LOGS)

    bob = models.User(
        email           = "bob@example.com",
        full_name       = "Bob Johnson",
        hashed_password = auth.get_password_hash("password123"),
        role            = "user",
        is_active       = False,  # disabled for demo
        created_at      = datetime.utcnow() - timedelta(days=10),
        last_login      = datetime.utcnow() - timedelta(days=3),
    )
    db.add(bob)
    db.flush()
    make_logs(db, bob, USER_BOB_LOGS)

    db.commit()
    print("\n[OK] Database seeded successfully!")
    print("------------------------------------------")
    print("  SUPER ADMIN --> super@rfiagent.com / admin123")
    print("  ADMIN       --> admin@rfiagent.com / admin123")
    print("  USER (Jane) --> jane@example.com / password123")
    print("  USER (Bob)  --> bob@example.com  / password123  [disabled]")
    print("------------------------------------------\n")
    db.close()

if __name__ == "__main__":
    init_db()
