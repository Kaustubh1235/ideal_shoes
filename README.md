# IDEALX — Ideal Shoes, Agra

Online platform for IDEALX, the handcrafted full-grain leather brand of Ideal Shoes, Agra — D2C storefront, B2B wholesale portal, admin dashboard, GST-compliant invoicing, GeM/tender tracker, AR product viewer.

Brand positioning: Ideal Shoes makes service and army boots, formal (Oxford) shoes and jackets in its own factory in Agra; leather bags are a small outsourced line. IDEALX sells that range direct ("the factory that makes boots for service makes your formal shoes") and supplies institutions and government buyers through GeM and direct purchase orders. BIS certification for leather footwear under the 2024 Quality Control Order (deadline 31 July 2027) is the gating compliance item for boots.

Stock is tracked in a separate, self-hosted inventory app (QR labels, scan to count). This site's only link to it is the inventory API: a Celery task pulls stock levels every 15 minutes and paid web orders post stock-out movements back. See `docs/GO-LIVE.md`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + shadcn/ui |
| API | FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic |
| Worker | Celery + Redis (beat schedule for tender polling, GSTR export, etc.) |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Object storage | S3 (MinIO in dev) |
| Auth | Auth.js v5 — shared JWT verified by FastAPI |
| Payments | Razorpay Standard Checkout |
| Invoice PDF | WeasyPrint |
| AR | `<model-viewer>` web component (ARCore / Quick Look) |
| Deploy | Docker Compose, host-agnostic |

## Quick start

```bash
# 1. Copy env
cp .env.example .env

# 2. Bring up infra-only (postgres, redis, minio, mailhog)
pnpm db:up

# 3. Install deps
pnpm install
cd apps/api && pip install -e . && cd ../..

# 4. Run migrations
pnpm db:migrate

# 5. Mirror Postgres schema into Prisma
pnpm prisma:pull

# 6. Seed demo data
pnpm db:seed

# 7. Bring up full stack
pnpm stack:up
```

Storefront: http://localhost:3000  
Admin: http://localhost:3000/admin (login: `admin@bharatboot.local` / `ChangeMe123!` + TOTP shown in console)  
Wholesale: http://localhost:3000/wholesale (login: `dealer1@bharatboot.local` / `Dealer123!`)  
API docs: http://localhost:8000/docs  
MinIO console: http://localhost:9001  
MailHog: http://localhost:8025  

## What's coded vs. what you need to do

See **[NEXT-STEPS.md](./NEXT-STEPS.md)** — every external dependency (Razorpay account, GST identity, product photos, 3D `.glb` models, etc.) has an adapter already wired; you just paste keys / upload assets.

## Repo layout

See the [implementation plan](../.claude/plans/claude-code-prompt-cosmic-hippo.md) for the full architecture rationale.

```
apps/web/           # Next.js — storefront + admin + wholesale (one app, route groups)
apps/api/           # FastAPI — invoicing, payments webhook, integrations, jobs
apps/worker/        # Celery worker + beat
packages/db/        # Prisma client (mirror of Alembic-owned schema)
packages/ui/        # shadcn/ui primitives
packages/types/     # Zod + OpenAPI-generated TS client for FastAPI
packages/gst/       # GSTIN validation, HSN helpers
packages/config/    # shared tsconfig, eslint, tailwind presets
infra/docker/       # Dockerfiles + compose.yml + compose.prod.yml
infra/nginx/        # Reverse proxy for prod
scripts/            # seed.ts, prisma-pull.sh, openapi-codegen.sh
```

## Schema flow

DDL ownership: **Alembic** (Python side) is the single source of truth. Prisma mirrors it.

```bash
# Edit SQLAlchemy models in apps/api/app/db/models.py
pnpm db:revision "add_widgets_table"
pnpm db:migrate
pnpm prisma:pull           # regenerates packages/db/schema.prisma + TS client
```

Never edit `packages/db/schema.prisma` by hand.

## Testing

```bash
pnpm test                  # turbo runs all
pnpm --filter @bharatboot/web test
cd apps/api && pytest
```

## Production deploy (any Linux VPS)

```bash
# On the host
git clone <repo> idealx && cd idealx
cp .env.example .env
# Edit .env: AUTH_SECRET, RAZORPAY_*, SELLER_* (GSTIN, Agra address, state code 09), AUTH_URL=https://yourdomain.com, etc.
docker compose -f infra/docker/compose.prod.yml up -d
docker compose -f infra/docker/compose.prod.yml exec api alembic upgrade head
docker compose -f infra/docker/compose.prod.yml exec api python -m scripts.seed_admin
```

TLS: nginx is configured to read `infra/nginx/certs/fullchain.pem` + `privkey.pem`. Use `certbot` to populate.

## Workspace package names

Internal packages are still scoped `@bharatboot/*` (the scaffold's original name). Renaming them is a mechanical find-and-replace across `package.json` files and imports; it changes nothing user-facing, so it is left for a quiet moment.

## License

Proprietary. Ideal Shoes, Agra. All rights reserved.
