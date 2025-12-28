# Deployment Guide for hub.krasnevune.cz

## Local Development

1. **Install dependencies**
   ```bash
   cd frontend
   npm install
   cd ../backend
   composer install
   ```
2. **Run development environment**
   ```bash
   docker compose up -d postgres redis backend queue queue_customers scheduler nginx frontend
   ```
   - Frontend runs via Vite dev server inside `frontend` container (`http://localhost:5173`).
   - API is served by PHP-FPM + Nginx on `http://localhost:8080`.
3. **Code changes**
   - UI is in `frontend/src`, Mantine with custom theme.
   - Backend is Laravel modules under `backend/modules/*`.
   - Use `npm run build` to ensure TypeScript passes before committing.
4. **Formatting/testing**
   - Frontend: `npm run lint` (ESLint).
   - Backend: `php artisan test`.

## Git Workflow

1. Create feature branch from `main`.
2. Commit changes with descriptive message (`feat:`, `fix:` etc.).
3. Push branch and open PR for review.
4. After approval, merge into `main`.

## Deployment to hub.krasnevune.cz

> Server access: `ssh deploy@168.119.157.199`

1. **Sync repository**
   ```bash
   rsync -az --delete \
     --exclude '.git/' \
     --exclude 'node_modules/' \
     --exclude 'frontend/node_modules/' \
     --exclude 'storefront/node_modules/' \
     --exclude 'storefront/.next/' \
     --exclude 'frontend/dist/' \
     --exclude 'backend/public/storage' \
     --exclude '.env' \
     ./ deploy@168.119.157.199:admin-kv/
   ```
2. **Install dependencies (if needed)**
   ```bash
   ssh deploy@168.119.157.199 "cd admin-kv/frontend && npm install"
   ssh deploy@168.119.157.199 "cd admin-kv/backend && composer install --no-dev"
   ```
3. **Run migrations**
   ```bash
   ssh deploy@168.119.157.199 "cd admin-kv && docker compose exec -T backend php artisan migrate --force"
   ```
4. **Restart services**
   ```bash
   ssh deploy@168.119.157.199 "cd admin-kv && docker compose restart backend queue queue_customers scheduler frontend"
   ssh deploy@168.119.157.199 "cd admin-kv && docker compose restart nginx"
   ```
5. **Verify**
   - Health check: `curl https://hub.krasnevune.cz/api/health`
   - Spot-check UI changes in browser.

## Notes

- Nginx caches backend IP after container restarts; always restart Nginx if PHP-FPM container was recreated.
- Production `frontend` container runs Vite dev server; for static build consider `npm run build` and serving via Nginx.
- Keep `.env` files on server; rsync excludes them.
- `backend/public/storage` is a symlink created by `php artisan storage:link`. The rsync exclude keeps it intact; if it ever disappears, re-run the command inside the backend container.
