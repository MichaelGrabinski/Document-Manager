# Django backend (Document-Manager)

This folder contains a Django + DRF backend intended to be reverse-proxied under:

- API: `/file/api/`
- Media: `/file/media/`

## Environment

This backend auto-loads `backend/.env` (via `python-dotenv`).
Use `backend/.env.example` as a starting point.

### Database

By default, Django uses SQLite (`backend/db.sqlite3`).

To use Microsoft SQL Server, set:

- `DJANGO_DB_ENGINE=mssql`
- `DJANGO_DB_HOST=...`
- `DJANGO_DB_PORT=1433`
- `DJANGO_DB_NAME=...`
- `DJANGO_DB_USER=...`
- `DJANGO_DB_PASSWORD=...`
- `DJANGO_DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server`

Example for your environment:

- `DJANGO_DB_HOST=TOEHSQL1`
- `DJANGO_DB_NAME=FileManager`
- `DJANGO_DB_USER=Michael`
- `DJANGO_DB_PASSWORD=...` (keep local; don’t commit)

### Media

- `DJANGO_MEDIA_ROOT` (defaults to `backend/media`)

## Run (dev)

- Migrate: `python manage.py migrate`
- Start: `python manage.py runserver 127.0.0.1:8000`

Health check:
- `GET /file/api/health/`
