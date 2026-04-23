# 🛡️ RFI Agent: Intelligent Command Centre

RFI Agent is a professional-grade **Administrative Surveillance & Management Dashboard**. Built with a high-performance FastAPI backend and a "Hyper-Visual" vanilla JavaScript frontend, it offers a secure and interactive environment for enterprise-level operations.

---

## 🚀 Deployment Guide

### 1. Environment Setup
Install the necessary high-performance dependencies:
```bash
pip install fastapi uvicorn sqlalchemy bcrypt python-jose[cryptography] python-multipart
```

### 2. Strategic Database Initialization
Reset and seed the surveillance database with default identity profiles:
```bash
python init_db.py
```

### 3. Activating the Command Centre
Launch the backend surveillance engine:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 🔐 Intelligence Access (Default Credentials)

| Identity Type | Email | Password |
| :--- | :--- | :--- |
| **Super Admin** | `super@rfiagent.com` | `admin123` |
| **Standard Admin** | `admin@rfiagent.com` | `admin123` |
| **Standard User** | `jane@example.com` | `password123` |

---

## ✨ Core Surveillance Features

*   **⚡ Hyper-Visual Dashboard:** Premium UI with glassmorphism and real-time data gradients.
*   **🧩 Modular Widget System:** Fully draggable and customizable layout (Sortable.js integration).
*   **📊 Interactive Intelligence:** Real-time chart morphing and multi-range time filtering.
*   **🛡️ Role-Based Access (RBAC):** Strict permission enforcement for Super Admin, Admin, and User tiers.
*   **👁️ Audit Surveillance:** Comprehensive logging of every identity action with IP tracking.
*   **🔐 Military-Grade Hashing:** Direct Bcrypt implementation for ultimate password security.

---

## 🛠️ System Architecture

### **Backend Engine**
*   **Framework:** FastAPI (Asynchronous High-Performance)
*   **Security:** JWT Token Exchange & Direct Bcrypt Hashing
*   **Database:** SQLAlchemy ORM with SQLite Persistence

### **Frontend Interface**
*   **Design:** Modern CSS3 with dynamic variables and animation tokens
*   **Logic:** Asynchronous Vanilla JavaScript (No heavy frameworks)
*   **Charts:** Advanced Chart.js implementation for real-time analytics

---
**Status:** `MISSION READY / OPTIMAL`
**Compiled By:** Antigravity AI Development Lead
