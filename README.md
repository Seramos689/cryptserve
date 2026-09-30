# Full-Stack Dark Theme App

Backend (Node.js, zero dependencies) + Frontend + Admin panel.

## Quick start

```bash
cd app/backend
node server.js
```

Open:
- **Store:** http://localhost:3000/
- **Admin:** http://localhost:3000/admin.html

## Default accounts

| Role  | Credentials |
|-------|-------------|
| Admin | username: `admin` / password: `admin123` |
| User  | email: `alex.rivera@example.com` / password: `user123` |

## Features

### User site
- Contact form + Telegram / WhatsApp links (from settings)
- Products with image, price, stock → checkout with quantity
- Login / Register
- Profile: balance badge, deposit, withdraw, edit email/password, logout
- Transaction history
- Purchases deduct balance and stock via API

### Admin panel
- Login / logout
- Dashboard (stats + recent transactions)
- Products: add, edit, delete (pick image from your computer or paste a URL)
- Members: view all, deposit/withdraw funds, delete
- Contact messages: view & delete
- Settings: Telegram, WhatsApp, contact email
- Change admin password

## API overview

All under `/api`. Admin routes need `Authorization: Bearer <token>`.

- `POST /api/admin/login` `{username, password}`
- `POST /api/auth/login` `{email, password}`
- `POST /api/auth/register` `{name, email, password}`
- `GET  /api/auth/me`
- `GET/PUT /api/settings`
- `POST /api/contact`
- `GET  /api/contacts` (admin)
- `POST /api/upload` (admin) `{ dataUrl: "data:image/...;base64,..." }` → `{ url: "/uploads/..." }`
- `GET/POST /api/products`
- `GET/PUT/DELETE /api/products/:id`
- `GET /api/users` (admin)
- `GET/PUT/DELETE /api/users/:id`
- `POST /api/users/:id/deposit` `{amount, note}`
- `POST /api/users/:id/withdraw` `{amount, note}`
- `POST /api/users/:id/purchase` `{productId, quantity}`
- `GET  /api/users/:id/transactions`
- `GET  /api/transactions` (admin)

Data is stored in `backend/data/db.json` (no external database required).
