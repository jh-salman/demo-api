# demo-api

Express + TypeScript + Prisma demo API.

## Render — standalone repo (`jh-salman/demo-api`)

Repo root **is** this project. In Render → Settings:

| Setting | Value |
|--------|--------|
| **Root Directory** | *(leave empty / blank)* |
| **Build Command** | `npm ci && npm run build && npx prisma generate` |
| **Start Command** | `npm start` |

Do **not** set Root Directory to `demo-api` — that folder does not exist inside this repo.

Production migrations:

```bash
npx prisma migrate deploy
```

## Render — monorepo (`Salon-x` with `salonx/demo-api`)

| Setting | Value |
|--------|--------|
| **Root Directory** | `salonx/demo-api` |
| **Build Command** | `npm ci && npm run build && npx prisma generate` |
| **Start Command** | `npm start` |

See [`render.yaml`](../../render.yaml) at the monorepo git root.
