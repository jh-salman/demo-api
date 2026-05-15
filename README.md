# demo-api

Express + TypeScript + Prisma demo API.

## Render deploy (monorepo `Salon-x`)

If the connected Git repo is **`Salon-x`** (parent of `salonx/`), use:

| Setting | Value |
|--------|--------|
| **Root Directory** | `salonx/demo-api` |
| **Build Command** | `npm ci && npm run build && npx prisma generate` |
| **Start Command** | `npm start` |

Do **not** use Root Directory `demo-api` alone — that path does not exist at repo root (`cd .../demo-api` fails).

After deploy, run migrations against production DB (not `migrate dev`):

```bash
cd salonx/demo-api
npx prisma migrate deploy
```

Optional: apply [`render.yaml`](../../render.yaml) at repo root via Render Blueprint.
