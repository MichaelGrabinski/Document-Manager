# Document Manager — Setup, Running & User Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup (Windows)](#local-development-setup-windows)
5. [Production Server Setup (Linux)](#production-server-setup-linux)
6. [Nginx Configuration](#nginx-configuration)
7. [User Management](#user-management)
8. [Using the Application](#using-the-application)
9. [Environment Variables Reference](#environment-variables-reference)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Document Manager is a web application for uploading, organizing, searching, and viewing PDF documents. It features:

- **PDF upload** with automatic text extraction (text-layer + OCR fallback for scanned documents)
- **Automatic keyword extraction** and summary generation (local or OpenAI-powered)
- **Group/folder organization** with role-based access
- **Full-text search** across documents and keywords
- **PDF viewer** built into the browser
- **Role-based access control** (Admin, Editor, Viewer)

---

## Architecture

The app has two parts:

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend + API proxy** | Next.js 15 (React 19) | Serves the UI, handles PDF text extraction/OCR, proxies API calls to Django |
| **Backend API + Database** | Django 5 + Django REST Framework | User authentication, document/group CRUD, file storage |

```
Browser
  │
  ├─ HTTPS ─→ nginx ─→ Next.js (port 3003) ─→ Django (port 8550)
  │              │
  │              └─ serves /file/* routes
  │
  └─ Static assets served by Next.js at /file/_next/*
```

**Database options:**
- **Microsoft SQL Server** (default) — requires ODBC Driver 18 and connection details in `backend/.env`
- **SQLite** (fallback for testing only) — set `DJANGO_DB_ENGINE=sqlite` in `backend/.env`

---

## Prerequisites

### All Platforms
- **Node.js** 18+ (recommend 20 LTS)
- **pnpm** package manager (`npm install -g pnpm`)
- **Python** 3.10+
- **Git**
- **ODBC Driver 18 for SQL Server** (required for MSSQL database)
- Access to a **Microsoft SQL Server** instance

### Windows Additional
- Download ODBC Driver 18 from [Microsoft](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

### Linux Additional
- Build tools: `sudo apt install -y build-essential python3-venv python3-pip`
- Install Microsoft ODBC Driver 18 (see [Microsoft docs](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server))
- `unixodbc-dev` package: `sudo apt install -y unixodbc-dev`

---

## Local Development Setup (Windows)

### 1. Clone the Repository

```powershell
git clone https://github.com/MichaelGrabinski/Document-Manager.git
cd Document-Manager
```

### 2. Install Frontend Dependencies

```powershell
pnpm install
```

### 3. Set Up the Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 4. Configure Environment Files

**`backend/.env`** — configure your SQL Server connection:
```env
# Database — MSSQL is the default engine
DJANGO_DB_ENGINE=mssql
DJANGO_DB_HOST=TOEHSQL1
DJANGO_DB_PORT=1433
DJANGO_DB_NAME=FileManager
DJANGO_DB_USER=YourUser
DJANGO_DB_PASSWORD=YourPassword
DJANGO_DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DJANGO_DB_TRUST_CERT=true
DJANGO_CORS_ALLOW_ALL=true
```

**`.env.local`** (project root) — already included:
```env
USE_REAL_PDF_TEXT=true
ENABLE_PDFTOTEXT=true
DISABLE_AI=false
NEXT_PUBLIC_BASE_PATH=/file
NEXT_PUBLIC_API_BASE=
NEXT_PUBLIC_DISABLE_AUTH=false
DJANGO_ORIGIN=http://127.0.0.1:8000
```

### 5. Initialize the Database

```powershell
cd backend
python manage.py migrate
```

### 6. Create Users

```powershell
python manage.py createsuperuser
# Follow prompts — this user gets admin + editor + viewer roles
```

Or create multiple users at once:
```powershell
python manage.py shell -c "from django.contrib.auth.models import User; u = User.objects.create_user('Michael', password='admin123', is_superuser=True, is_staff=True); print('Created:', u.username)"
```

### 7. Start Both Services

**Terminal 1 — Django backend:**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python manage.py runserver 0.0.0.0:8000
```

**Terminal 2 — Next.js frontend:**
```powershell
pnpm dev
```

### 8. Open the App

Go to **http://localhost:3000/file** in your browser.

> **Tip:** To skip login during development, start Next.js with:
> ```powershell
> $env:NEXT_PUBLIC_DISABLE_AUTH='true'; pnpm dev
> ```

---

## Production Server Setup (Linux)

### 1. Clone & Install

```bash
cd /home/youruser
git clone https://github.com/MichaelGrabinski/Document-Manager.git
cd Document-Manager

# Frontend
pnpm install
pnpm build

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure Backend Environment

Edit `backend/.env`:
```env
DJANGO_DB_ENGINE=mssql
DJANGO_DB_HOST=TOEHSQL1
DJANGO_DB_PORT=1433
DJANGO_DB_NAME=FileManager
DJANGO_DB_USER=YourUser
DJANGO_DB_PASSWORD=YourPassword
DJANGO_DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DJANGO_DB_TRUST_CERT=true
DJANGO_CORS_ALLOW_ALL=true
DJANGO_SESSION_COOKIE_SECURE=true
DJANGO_SESSION_COOKIE_SAMESITE=Lax
```

### 3. Initialize Database & Create Users

```bash
cd backend
source venv/bin/activate
python3 manage.py migrate

# Create users via script:
cat > /tmp/create_users.py << 'EOF'
from django.contrib.auth.models import User
users = [
    ('Michael', 'admin123', True, True),
    ('docuser', 'docpass123', True, False),
    ('viewer1', 'viewpass123', False, False),
]
for uname, pwd, is_staff, is_super in users:
    u, created = User.objects.get_or_create(username=uname)
    u.set_password(pwd)
    u.is_staff = is_staff
    u.is_superuser = is_super
    u.save()
    print(('Created' if created else 'Updated') + ': ' + uname)
EOF
python3 manage.py shell < /tmp/create_users.py
```

### 4. Start Both Services

**Terminal 1 — Django:**
```bash
cd /home/youruser/Document-Manager/backend
source venv/bin/activate
DJANGO_SESSION_COOKIE_SECURE=true python3 manage.py runserver 0.0.0.0:8550
```

**Terminal 2 — Next.js (production mode):**
```bash
cd /home/youruser/Document-Manager
DJANGO_ORIGIN=http://127.0.0.1:8550 PORT=3003 pnpm start
```

Or for development mode:
```bash
DJANGO_ORIGIN=http://127.0.0.1:8550 PORT=3003 pnpm dev
```

### 5. Access

- Direct: `http://your-server:3003/file`
- Via nginx: `https://your-domain/file`

---

## Nginx Configuration

Add this to your nginx `server` block (inside the `listen 443 ssl` block):

```nginx
# Document Manager — match /file and /file/*
location /file {
    proxy_pass http://127.0.0.1:3003;
    proxy_http_version 1.1;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        $connection_upgrade;

    proxy_redirect off;
    client_max_body_size 200m;
}
```

> **Important:** Use `location /file` (no trailing slash, no `^~`). Do NOT add a separate `location = /file { return 301 /file/; }` — that causes a redirect loop with Next.js `trailingSlash: false`.

After editing:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## User Management

### Role System

| Role | Django Flag | Permissions |
|------|------------|-------------|
| **Admin** | `is_superuser = True` | Full access: upload, delete, edit, manage groups, manage users |
| **Editor** | `is_staff = True` | Upload documents, edit keywords, assign to groups |
| **Viewer** | (default) | View and search documents only |

Roles are **cumulative** — an Admin automatically has Editor and Viewer permissions too.

### Creating Users

**Option 1 — Django Admin Panel:**
```bash
python manage.py createsuperuser
```
Then go to `http://your-server:8550/admin/` and create users through the web UI.

**Option 2 — Command Line:**
```bash
# Admin user (all roles)
python manage.py shell -c "
from django.contrib.auth.models import User
u = User.objects.create_user('username', password='password')
u.is_superuser = True
u.is_staff = True
u.save()
print('Admin created:', u.username)
"

# Editor user (editor + viewer)
python manage.py shell -c "
from django.contrib.auth.models import User
u = User.objects.create_user('editor1', password='password')
u.is_staff = True
u.save()
print('Editor created:', u.username)
"

# Viewer user (viewer only)
python manage.py shell -c "
from django.contrib.auth.models import User
User.objects.create_user('viewer1', password='password')
print('Viewer created')
"
```

### Changing Passwords

```bash
python manage.py changepassword username
```

### Default Test Accounts

| Username | Password | Role |
|----------|----------|------|
| Michael | admin123 | Admin |
| docuser | docpass123 | Editor |
| viewer1 | viewpass123 | Viewer |

---

## Using the Application

### Logging In

1. Go to `https://your-domain/file` (or `http://localhost:3000/file` for local dev)
2. Enter your username and password
3. Click **Login** (for local Django accounts) or **Windows Login** (if AD is configured)

### Uploading Documents

1. Log in with an **Admin** or **Editor** account
2. Click the **+ Upload** button in the top-right area
3. Select a PDF file (max ~200 MB)
4. Optionally add keywords (comma-separated)
5. Optionally assign to a group
6. Click **Upload**

The system will automatically:
- Extract text from the PDF (text-layer or OCR for scanned documents)
- Generate keywords from the content
- Create a summary

### Searching Documents

- Use the **search bar** at the top to search by:
  - Document name
  - Keywords (both manual and AI-extracted)
  - Full text content
- Search is instant and filters as you type

### Managing Groups

1. Log in as **Admin**
2. Groups appear in the **left sidebar**
3. Click the **+** icon in the sidebar to add a new group
4. Right-click a group to edit or delete it
5. Groups can have:
   - **Search keys** — alternative terms that match this group in search
   - **Allowed roles** — restrict which roles can see documents in this group

### Viewing Documents

- Click on any document card to open it in the built-in PDF viewer
- Click **View Full Text** to see the extracted text content

### Bulk Upload (Settings Page)

1. Go to **Settings** (gear icon or `/file/settings`)
2. Select multiple PDF files at once
3. Optionally assign all to a group
4. Click **Upload All** — files are processed one at a time with progress tracking

---

## Environment Variables Reference

### Next.js (`.env.local` in project root)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_BASE_PATH` | `/file` | URL path prefix for the app |
| `NEXT_PUBLIC_DISABLE_AUTH` | `false` | Set `true` to bypass login (dev only) |
| `DJANGO_ORIGIN` | `http://127.0.0.1:8000` | Django backend URL (server-side only) |
| `USE_REAL_PDF_TEXT` | `true` | Enable PDF text extraction |
| `ENABLE_PDFTOTEXT` | `true` | Try `pdftotext` CLI as fallback |
| `DISABLE_AI` | `false` | Disable OpenAI calls |
| `OPENAI_API_KEY` | (none) | OpenAI key for AI summaries/keywords (optional) |
| `PORT` | `3000` | Next.js listen port |

### Django (`backend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DJANGO_DB_ENGINE` | `mssql` | Database: `mssql` (default) or `sqlite` (testing only) |
| `DJANGO_DB_HOST` | `TOEHSQL1` | SQL Server hostname |
| `DJANGO_DB_PORT` | `1433` | SQL Server port |
| `DJANGO_DB_NAME` | `FileManager` | Database name |
| `DJANGO_DB_USER` | (none) | Database username |
| `DJANGO_DB_PASSWORD` | (none) | Database password |
| `DJANGO_CORS_ALLOW_ALL` | `true` | Allow cross-origin requests |
| `DJANGO_SESSION_COOKIE_SECURE` | `false` | Set `true` when behind HTTPS |
| `DJANGO_SESSION_COOKIE_SAMESITE` | `Lax` | Cookie SameSite policy |
| `DJANGO_MEDIA_ROOT` | `backend/media` | Where uploaded PDFs are stored on disk |

---

## Troubleshooting

### "Login fails silently" (no error message, stays on login page)
- **Cause:** Session cookie not being sent. Ensure `DJANGO_SESSION_COOKIE_SECURE=true` on HTTPS deployments and `DJANGO_SESSION_COOKIE_SAMESITE=Lax`.
- Also clear your browser cookies for the domain and try again.

### "ERR_TOO_MANY_REDIRECTS"
- **Cause:** Nginx `location = /file { return 301 /file/; }` conflicts with Next.js `trailingSlash: false`.
- **Fix:** Use `location /file { ... }` (no `=`, no trailing slash). Remove any `location = /file` redirect.

### "No textual content extracted" for scanned PDFs
- The app uses **Tesseract.js** for OCR on image-only PDFs. This runs automatically when the text-layer extraction produces fewer than 25 characters.
- OCR processes up to 8 pages and may take 10-30 seconds per page.

### Documents uploaded on Windows don't appear on Linux (or vice versa)
- Both environments must point to the **same MSSQL database** (same `DJANGO_DB_HOST`, `DJANGO_DB_NAME` in `backend/.env`).
- If one instance accidentally uses SQLite (`DJANGO_DB_ENGINE=sqlite`), its data is isolated. Make sure both use `DJANGO_DB_ENGINE=mssql`.

### "Django parse error" on upload
- Check that Django is running and reachable at the `DJANGO_ORIGIN` URL.
- Test: `curl http://127.0.0.1:8550/file/api/health/` — should return `{"ok": true}`.

### WebSocket / HMR errors in production
- These only appear in `pnpm dev` mode. Use `pnpm build && pnpm start` for production.
- The `_next/webpack-hmr` 404 is harmless in dev mode behind nginx.

---

## Quick Start Cheat Sheet

```bash
# === Local Dev (Windows PowerShell) ===
cd Document-Manager

# Backend
cd backend; .\venv\Scripts\Activate.ps1
python manage.py runserver 0.0.0.0:8000

# Frontend (new terminal)
cd Document-Manager
pnpm dev
# Open http://localhost:3000/file

# === Production (Linux) ===
cd /home/youruser/Document-Manager

# Backend
cd backend && source venv/bin/activate
DJANGO_SESSION_COOKIE_SECURE=true python3 manage.py runserver 0.0.0.0:8550 &

# Frontend
cd /home/youruser/Document-Manager
DJANGO_ORIGIN=http://127.0.0.1:8550 PORT=3003 pnpm start
# Access via https://your-domain/file
```
