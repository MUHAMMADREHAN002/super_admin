# RFI Agent - Admin Dashboard

A comprehensive admin panel built with FastAPI backend and vanilla JavaScript frontend.

## Setup

1. Install dependencies:
   ```bash
   pip install fastapi uvicorn sqlalchemy psycopg2-binary python-jose[cryptography] passlib[bcrypt] python-multipart
   ```

2. Initialize the database:
   ```bash
   python init_db.py
   ```

3. Run the backend:
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Open the frontend:
   - Navigate to `http://localhost:8000` in your browser
   - Or navigate to `frontend/index.html` directly

## Login Credentials

- **Super Admin**: super@rfiagent.com / admin123
- **Admin**: admin@rfiagent.com / admin123
- **User (Jane)**: jane@example.com / password123
- **User (Bob)**: bob@example.com / password123 (disabled)

## Features

- **Role-based Access Control**: Super Admin, Admin, and User roles with permission enforcement
- **Admin Dashboard**: KPI stats, user management, audit logs
- **Audit Logging**: Complete audit trail for all user actions
- **User Management**: View, edit, and manage user roles and status
- **Drag-and-Drop Widgets**: Customizable KPI dashboard
- **Real-time Updates**: Live data synchronization
- **Responsive Design**: Mobile-friendly interface
- **JWT Authentication**: Secure token-based authentication

## API Endpoints

### Auth
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login (returns JWT token)
- `GET /api/auth/me` - Get current user info

### Admin Only
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/{user_id}/detail` - User details with activity
- `PATCH /api/admin/users/{user_id}` - Update user role/status
- `GET /api/admin/audit` - Audit logs viewer

### Super Admin Only
- `POST /api/superadmin/create-admin` - Create new admin account