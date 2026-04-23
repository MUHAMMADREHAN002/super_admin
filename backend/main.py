from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import List, Optional
import random
from datetime import datetime, timedelta

from . import models, schemas, auth, database
import traceback
import sys
import os

models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Hyper-Visual Super Admin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("frontend/index.html")

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("frontend/favicon.png")

def log_action(db: Session, user_id: Optional[int], action: str, detail: str = "", ip: str = "", level: str = "INFO", func: str = None, line: int = None, thread_id: str = None):
    log = models.AuditLog(
        user_id=user_id, 
        action=action, 
        detail=detail, 
        ip_address=ip, 
        level=level,
        function_name=func,
        line_number=line,
        thread_id=thread_id
    )
    db.add(log)
    db.commit()

@app.middleware("http")
async def error_logging_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        db = next(database.get_db())
        # Try to get user from token if exists
        user_id = None
        try:
            user = await auth.get_current_user(request, db)
            user_id = user.id
        except:
            pass

        # Extract traceback info
        exc_type, exc_value, exc_traceback = sys.exc_info()
        tb = traceback.extract_tb(exc_traceback)[-1] # Get last frame
        
        filename = os.path.basename(tb.filename)
        func_name = tb.name
        line_no = tb.lineno
        
        error_detail = f"Unhandled {exc_type.__name__}: {str(e)} in {filename}"
        log_action(
            db, 
            user_id, 
            "SYSTEM_ERROR", 
            error_detail, 
            request.client.host if request.client else "", 
            "ERROR", 
            func_name, 
            line_no
        )
        # Re-raise to let FastAPI handle 500 response
        raise e

# --- Auth Endpoints ---

@app.post("/api/auth/register", response_model=schemas.User)
def register(user_data: schemas.UserCreate, db: Session = Depends(database.get_db), request: Request = None):
    # Check if user exists
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user_data.password)
    db_user = models.User(
        email=user_data.email, 
        full_name=user_data.full_name,
        hashed_password=hashed_password, 
        role="user"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    log_action(db, db_user.id, "register", f"New user registered: {db_user.email}", request.client.host if request else "")
    return db_user

@app.post("/api/auth/login", response_model=schemas.Token)
def login(form_data: schemas.UserCreate, db: Session = Depends(database.get_db), request: Request = None):
    user = db.query(models.User).filter(models.User.email == form_data.email).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()
    
    access_token = auth.create_access_token(data={"sub": user.email})
    log_action(db, user.id, "login", "User logged into the system", request.client.host if request else "")
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=schemas.User)
def get_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

# --- Admin Stats (Both admin and super_admin) ---

@app.get("/api/admin/stats", response_model=schemas.AdminStats)
def get_admin_stats(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin)
):
    total_users = db.query(models.User).filter(models.User.role == 'user').count()
    active_users = db.query(models.User).filter(models.User.is_active == True, models.User.role == 'user').count()
    
    # Real Metrics from Production Schema
    total_threads = db.query(models.Thread).count()
    pending_tasks = db.query(models.FollowupTask).filter(models.FollowupTask.status == 'PENDING').count()
    total_contacts = db.query(models.Contact).count()
    
    # Real live sessions is unique users active in last 15 mins
    fifteen_mins_ago = datetime.utcnow() - timedelta(minutes=15)
    sessions = db.query(func.count(distinct(models.AuditLog.user_id))).filter(models.AuditLog.timestamp >= fifteen_mins_ago).scalar()
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_threads": total_threads,
        "pending_tasks": pending_tasks,
        "total_contacts": total_contacts,
        "sessions": sessions or 0
    }

@app.get("/api/admin/users", response_model=List[schemas.User])
def list_users(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin)
):
    # Role-based filtering
    if current_user.role == 'super_admin':
        # Super admin sees all users
        return db.query(models.User).order_by(models.User.created_at.desc()).all()
    else:
        # Admin sees all users except other admins
        return db.query(models.User).filter(models.User.role != 'admin').order_by(models.User.created_at.desc()).all()

@app.get("/api/admin/users/{user_id}/detail", response_model=schemas.UserDetail)
def user_detail(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Role-based access control
    if current_user.role != 'super_admin' and user.role == 'admin':
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    widgets_count = db.query(models.DashboardWidget).filter(
        models.DashboardWidget.user_id == user_id
    ).count()

    # Fetch this user's own audit logs (most recent first)
    recent_logs = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.user_id == user_id)
        .order_by(models.AuditLog.id.desc())
        .limit(50)
        .all()
    )

    user_data = schemas.User.from_orm(user).dict()
    return {
        **user_data,
        "widgets_count": widgets_count,
        "recent_logs": recent_logs,
    }

@app.patch("/api/admin/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int,
    update_data: schemas.UserUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
    request: Request = None
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 🔒 SAFETY: Prevent disabling Super Admin accounts
    if db_user.role == 'super_admin' and update_data.is_active is False:
        raise HTTPException(status_code=403, detail="Cannot disable a Super Admin account")
    
    # Role Protection: Only super_admin can change roles
    if update_data.role is not None:
        if current_user.role != 'super_admin':
             raise HTTPException(status_code=403, detail="Only Super Admin can change user roles")
        db_user.role = update_data.role

    # Both Admin and Super Admin can toggle active status
    if update_data.is_active is not None:
        db_user.is_active = update_data.is_active
        
    if update_data.full_name is not None:
        db_user.full_name = update_data.full_name
        
    db.commit()
    db.refresh(db_user)
    
    detail_msg = f"Updated user {db_user.email}: active={db_user.is_active}, role={db_user.role}"
    log_action(db, current_user.id, "admin_update_user", detail_msg, request.client.host if request else "")
    
    return db_user

@app.delete("/api/admin/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
    request: Request = None
):
    if current_user.role != 'super_admin':
        raise HTTPException(status_code=403, detail="Only Super Admin can delete users")
    
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    db.delete(db_user)
    db.commit()
    
    log_action(db, current_user.id, "delete_user", f"Deleted user {db_user.email}", request.client.host if request else "")
    return {"message": "User deleted successfully"}

# 🚀 Robust Fallback For Environments Rejecting DELETE Methods
@app.post("/api/admin/users/{user_id}/delete")
def delete_user_post(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin),
    request: Request = None
):
    return delete_user(user_id, db, current_user, request)

@app.get("/api/admin/audit", response_model=List[schemas.AuditLogSchema])
def get_audit_logs(
    limit: int = 100,
    level: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin)
):
    # Role-based filtering
    if current_user.role == 'super_admin':
        query = db.query(models.AuditLog)
    else:
        # Admin sees all logs except Super Admin's activity
        super_admins = db.query(models.User.id).filter(models.User.role == 'super_admin').all()
        sa_ids = [sa.id for sa in super_admins]
        query = db.query(models.AuditLog).filter(
            models.AuditLog.user_id.notin_(sa_ids),
            models.AuditLog.level != 'ERROR' # Admin doesn't see technical errors
        )
    
    if level:
        query = query.filter(models.AuditLog.level == level)

    logs = query.order_by(models.AuditLog.timestamp.desc()).limit(limit).all()
    results = []
    for log in logs:
        user_email = "system"
        user_name = "N/A"
        if log.user:
            user_email = log.user.email
            user_name = log.user.full_name
        
        results.append({
            "id": log.id,
            "user_id": log.user_id,
            "thread_id": log.thread_id,
            "action": log.action,
            "detail": log.detail,
            "level": log.level,
            "function_name": log.function_name,
            "line_number": log.line_number,
            "ip_address": log.ip_address,
            "timestamp": log.timestamp,
            "user_email": user_email,
            "user_name": user_name
        })
    return results

@app.get("/api/admin/audit/{log_id}", response_model=schemas.AuditLogSchema)
def get_audit_log_detail(
    log_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_admin)
):
    log = db.query(models.AuditLog).filter(models.AuditLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    # Role-based access check
    if current_user.role != 'super_admin' and log.action == 'create_admin':
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    user_email = "system"
    user_name = "N/A"
    if log.user:
        user_email = log.user.email
        user_name = log.user.full_name
    
    return {
        "id": log.id,
        "user_id": log.user_id,
        "action": log.action,
        "detail": log.detail,
        "level": log.level,
        "function_name": log.function_name,
        "line_number": log.line_number,
        "ip_address": log.ip_address,
        "timestamp": log.timestamp,
        "user_email": user_email,
        "user_name": user_name
    }

# --- Super Admin Endpoints ---

@app.post("/api/superadmin/create-admin", response_model=schemas.User)
def create_admin(
    user_data: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_super_admin),
    request: Request = None
):
    # Check if user exists
    existing = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user_data.password)
    db_user = models.User(
        email=user_data.email, 
        full_name=user_data.full_name,
        hashed_password=hashed_password, 
        role=user_data.role or "admin"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    log_action(db, current_user.id, "create_admin", f"Created admin account: {db_user.email}", request.client.host if request else "")
    return db_user

# --- Admin Management (Super Admin Only) ---

@app.get("/api/superadmin/admins", response_model=List[schemas.User])
def list_admins(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_super_admin)
):
    return db.query(models.User).filter(
        models.User.role == 'admin'
    ).order_by(models.User.created_at.desc()).all()

@app.patch("/api/superadmin/admins/{admin_id}", response_model=schemas.User)
def update_admin(
    admin_id: int,
    update_data: schemas.UserUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_super_admin),
    request: Request = None
):
    db_admin = db.query(models.User).filter(
        models.User.id == admin_id,
        models.User.role == 'admin'
    ).first()
    if not db_admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    old_active = db_admin.is_active
    
    if update_data.is_active is not None:
        db_admin.is_active = update_data.is_active
    if update_data.full_name is not None:
        db_admin.full_name = update_data.full_name
        
    db.commit()
    db.refresh(db_admin)
    
    detail = f"Updated admin {db_admin.email}: active {old_active}->{db_admin.is_active}"
    log_action(db, current_user.id, "update_admin", detail, request.client.host if request else "")
    
    return db_admin

# --- KPI / Stats Logic (Legacy-style for widgets) ---

@app.get("/api/admin/stats/kpi")
def get_kpi_data(
    time_range: Optional[str] = "30d",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.check_role(["super_admin", "admin"]))
):
    """Returns chart data for the given time range (1h, 6h, 12h, 24h, 7d, 30d)."""
    now = datetime.utcnow()

    # Map each range to a timedelta and slot configuration
    RANGE_MAP = {
        "1h":  (timedelta(hours=1),   6,  lambda i: f"{(i+1)*10}m"),
        "6h":  (timedelta(hours=6),   6,  lambda i: f"{i+1}h"),
        "12h": (timedelta(hours=12),  6,  lambda i: f"{(i+1)*2}h"),
        "24h": (timedelta(hours=24),  6,  lambda i: f"{(i+1)*4}h"),
        "7d":  (timedelta(days=7),    7,  lambda i: (now - timedelta(days=6-i)).strftime("%a")),
        "30d": (timedelta(days=180),  6,  lambda i: (now - timedelta(days=(5-i)*30)).strftime("%b")),
    }
    delta, slots, label_fn = RANGE_MAP.get(time_range, RANGE_MAP["30d"])
    since   = now - delta
    labels  = [label_fn(i) for i in range(slots)]

    # Fetch real data within the window
    threads = db.query(models.Thread).filter(models.Thread.created_at >= since).all()
    emails  = db.query(models.Email).filter(models.Email.created_at  >= since).all()

    def bucket(items, n):
        counts = [0] * n
        span = delta.total_seconds()
        slot_size = span / n
        for item in items:
            age = (now - item.created_at).total_seconds()
            idx = min(int((span - age) / slot_size), n - 1)
            if 0 <= idx < n:
                counts[idx] += 1
        return counts

    bar_data  = bucket(threads, slots)
    line_data = bucket(emails,  slots)

    # Pie / Doughnut always uses full DB (not time-filtered)
    status_stats = db.query(
        models.Thread.status, func.count(models.Thread.id)
    ).group_by(models.Thread.status).all()

    # Hyper-Visual fallback for empty databases
    is_empty = sum(bar_data) == 0 and sum(line_data) == 0

    MOCK = {
        "1h":  ([2,3,4,3,5,6],  [1,2,3,2,4,5]),
        "6h":  ([4,6,5,8,10,9], [3,5,4,7,9,8]),
        "12h": ([6,10,8,13,16,14],[5,8,7,11,14,12]),
        "24h": ([8,14,12,18,22,20],[7,12,10,16,20,18]),
        "7d":  ([5,8,12,10,15,22,19],[4,7,10,8,13,19,16]),
        "30d": ([12,18,15,24,38,52],[8,14,11,18,30,44]),
    }

    if is_empty:
        bar_data, line_data = MOCK.get(time_range, MOCK["30d"])
        status_labels = ["Processed", "Pending", "Failed"]
        status_data   = [65, 25, 10]
    else:
        status_labels = [s[0] for s in status_stats] if status_stats else ["Empty"]
        status_data   = [s[1] for s in status_stats] if status_stats else [0]

    return {
        "bar":  {"labels": labels, "data": bar_data},
        "line": {"labels": labels, "data": line_data},
        "pie":  {"labels": status_labels, "data": status_data},
        "doughnut": {
            "labels": ["Processing", "Completed"],
            "data": [
                db.query(models.Thread).filter(models.Thread.status == 'PROCESSING').count() or (15 if is_empty else 0),
                db.query(models.Thread).filter(models.Thread.status == 'COMPLETED').count() or (85 if is_empty else 0),
            ]
        },
        "sessions": db.query(func.count(distinct(models.AuditLog.user_id))).filter(
            models.AuditLog.timestamp >= (now - timedelta(minutes=15))
        ).scalar() or (7 if is_empty else 0),
    }

# --- Dashboard Layout Endpoints ---

@app.get("/api/dashboard/layout", response_model=List[schemas.WidgetLayout])
def get_layout(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    widgets = db.query(models.DashboardWidget).filter(models.DashboardWidget.user_id == current_user.id).all()
    return widgets

@app.post("/api/dashboard/layout")
def save_layout(
    layout: schemas.DashboardLayout,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db.query(models.DashboardWidget).filter(models.DashboardWidget.user_id == current_user.id).delete()
    for w in layout.widgets:
        db_widget = models.DashboardWidget(
            user_id=current_user.id,
            widget_type=w.widget_type,
            x=w.x, y=w.y, w=w.w, h=w.h
        )
        db.add(db_widget)
    db.commit()
    return {"message": "Layout saved"}
