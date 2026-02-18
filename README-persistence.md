# Persistence Layer (Temporary)

This app now stores documents and groups in simple JSON files under the `data/` directory:

- `data/documents.json`
- `data/groups.json`

They are updated via the `/api/documents` and `/api/groups` routes. This is **not** production-grade durability (no locking, no concurrency control). It's only to keep state across dev server restarts & page refreshes.

Future upgrade suggestions:
1. Replace with a real database (SQLite via Prisma, Postgres, etc.).
2. Add schema validation (zod) in API routes.
3. Add per-user authorization checks server-side.
4. Implement batch endpoints for fewer network round trips.
5. Add optimistic UI with rollback on failure.
