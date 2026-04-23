from pydantic import BaseModel, EmailStr
from typing import List, Optional, Any
from datetime import datetime

# --- USER SCHEMAS ---

class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: Optional[str] = "user"

class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None

class User(UserBase):
    id: int
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- AUDIT & LOG SCHEMAS ---

class AuditLogSchema(BaseModel):
    id: int
    user_id: Optional[int]
    thread_id: Optional[str] = None
    action: str
    detail: Optional[str] = ""
    level: Optional[str] = "INFO"
    function_name: Optional[str] = None
    line_number: Optional[int] = None
    ip_address: Optional[str] = ""
    timestamp: datetime
    user_email: Optional[str] = "system"
    user_name: Optional[str] = None

    class Config:
        from_attributes = True

class UserActivityLog(AuditLogSchema):
    pass

class UserDetail(User):
    widgets_count: int
    recent_logs: List[UserActivityLog] = []

# --- DASHBOARD SCHEMAS ---

class AdminStats(BaseModel):
    total_users: int
    active_users: int
    total_threads: int # Real Metric
    pending_tasks: int # Real Metric
    total_contacts: int # Real Metric
    sessions: int # Placeholder for live web analytics

class WidgetLayout(BaseModel):
    widget_type: str
    x: int
    y: int
    w: int
    h: int

class DashboardLayout(BaseModel):
    widgets: List[WidgetLayout]

class Token(BaseModel):
    access_token: str
    token_type: str
