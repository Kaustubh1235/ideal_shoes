# BharatBoot

Unified business platform for an Indian defense & footwear manufacturer — D2C storefront, B2B wholesale portal, admin dashboard, GST-compliant invoicing, government tender tracker, AR product viewer.

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
Admin: http://localhost:3000/admin (login: `admin@bharatboot.local` / `changeme` + TOTP shown in console)  
Wholesale: http://localhost:3000/wholesale (login: `dealer1@bharatboot.local` / `changeme`)  
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
git clone <repo> bharatboot && cd bharatboot
cp .env.example .env
# Edit .env: AUTH_SECRET, RAZORPAY_*, SELLER_*, AUTH_URL=https://yourdomain.com, etc.
docker compose -f infra/docker/compose.prod.yml up -d
docker compose -f infra/docker/compose.prod.yml exec api alembic upgrade head
docker compose -f infra/docker/compose.prod.yml exec api python -m scripts.seed_admin
```

TLS: nginx is configured to read `infra/nginx/certs/fullchain.pem` + `privkey.pem`. Use `certbot` to populate.

## License

Proprietary. All rights reserved.
