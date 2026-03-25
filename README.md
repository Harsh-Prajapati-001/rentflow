# 🏢 RentFlow — Multi-Building Property Management System

A full-stack property management PWA built entirely on **free-tier services**.

## 🏗️ Architecture

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | React PWA → Vercel | FREE |
| Database | Supabase PostgreSQL | FREE |
| Auth | Supabase Auth | FREE |
| Backend Logic | Supabase RLS + Edge Functions | FREE |
| File Storage | Supabase Storage | FREE (1GB) |
| Scheduler | GitHub Actions (cron) | FREE |
| WhatsApp | Twilio API | Paid(usage based) |

---

## 📁 Project Structure

```
rentflow/
├── frontend/                    # React PWA (deploy to Vercel)
│   ├── src/
│   │   ├── App.jsx              # Router + auth gate
│   │   ├── main.jsx             # Entry point
│   │   ├── lib/
│   │   │   └── supabase.js      # All DB operations
│   │   ├── hooks/
│   │   │   ├── useAuth.jsx      # Auth context
│   │   │   └── useBuilding.jsx  # Building context
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx     # Login / Register
│   │   │   ├── OwnerDashboard.jsx
│   │   │   └── TenantDashboard.jsx
│   │   ├── components/
│   │   │   ├── buildings/       # BuildingSelector, BuildingManager
│   │   │   ├── rooms/           # RoomManager
│   │   │   ├── tenants/         # TenantManager
│   │   │   ├── rent/            # RentManager
│   │   │   ├── electricity/     # ElectricityManager
│   │   │   ├── documents/       # DocumentManager
│   │   │   └── notifications/   # NotificationPanel
│   │   └── styles/
│   │       └── global.css
│   ├── index.html
│   ├── vite.config.js           # PWA config
│   ├── vercel.json
│   └── package.json
│
├── backend/
│   └── supabase/
│       ├── migrations/
│       │   ├── 001_initial_schema.sql   # Full DB schema + RLS
│       │   └── 002_storage_policies.sql # Storage RLS
│       └── functions/
│           └── generate-monthly-rents/  # Edge Function
│               └── index.ts
│
├── scheduler/
│   ├── whatsapp-notifier.js     # Main scheduler script
│   ├── setup-whatsapp-session.js # One-time QR scan setup
│   └── package.json
│
└── .github/
    └── workflows/
        ├── whatsapp-notifier.yml      # Daily WhatsApp notifications
        ├── mark-overdue.yml           # Daily overdue status updater
        └── generate-monthly-rents.yml # Monthly rent record generator
```

---

## 🚀 Setup Guide (Step by Step)

### Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → Create new project
2. Go to **SQL Editor** → Run `backend/supabase/migrations/001_initial_schema.sql`
3. Go to **Storage** → Create bucket named `tenant-documents` (Public: OFF)
4. Go to **SQL Editor** → Run `backend/supabase/migrations/002_storage_policies.sql`
5. Note down:
   - **Project URL**: `https://xxxx.supabase.co`
   - **Anon Key**: from Settings → API
   - **Service Role Key**: from Settings → API (keep secret!)

### Step 2 — Deploy Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
supabase functions deploy generate-monthly-rents
```

Set function secret in Supabase Dashboard → Edge Functions → Secrets:
```
FUNCTION_SECRET = any-random-secret-string
```

### Step 3 — Frontend Deployment (Vercel)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import project → Select `frontend/` folder
3. Add Environment Variables:
   ```
   VITE_SUPABASE_URL = https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = your-anon-key
   ```
4. Deploy!

### Step 4 — WhatsApp Setup (One-Time)

Run locally on your machine:

```bash
cd scheduler
npm install
npm run setup
```

This opens a browser with a QR code. Scan it with the WhatsApp account you want to send messages from (ideally a dedicated number). After scanning, copy the base64 session string printed to the terminal.

### Step 5 — GitHub Secrets

In your GitHub repo → Settings → Secrets → Actions, add:

| Secret Name | Value |
|------------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `WA_SESSION_DATA` | Base64 session from Step 4 |
| `FUNCTION_SECRET` | Same secret you set in Supabase Edge Functions |

### Step 6 — First Use

1. Open your Vercel URL
2. Sign up as **Owner**
3. Create buildings (e.g., Building A, PG-1)
4. Add rooms with rent amount and due date
5. Add tenants and assign to rooms
6. Generate this month's rent records
7. WhatsApp notifications will run automatically every day at 8 AM IST

---

## 👤 Role Permissions

### Owner
- ✅ Create/manage multiple buildings
- ✅ Add/edit rooms with individual rent & due dates
- ✅ Add/edit/deactivate tenants
- ✅ Generate & manage rent records
- ✅ Add electricity readings (auto-calculates bill)
- ✅ Upload rent agreements for tenants
- ✅ View & download all tenant documents
- ✅ Full notification history

### Tenant
- ✅ View own room, rent, electricity info
- ✅ View rent payment history
- ✅ Upload own ID proof
- ✅ Download their rent agreement (uploaded by owner)
- ✅ View personal notifications
- ❌ Cannot edit any data
- ❌ Cannot see other tenants

---

## 🔔 WhatsApp Notification Schedule

| When | Message |
|------|---------|
| 2 days before due date | "2 days left to pay rent" |
| On due date | "Today is the last day" |
| 1 day after due date | "1 day overdue" |
| 2+ days after due date | "X days overdue" (daily) |

Notifications stop automatically once rent is marked as paid.

---

## ⚡ Electricity Bill Formula

```
Units Consumed = Current Reading − Previous Reading
Total Bill = Units Consumed × Rate per Unit
```

Calculated automatically in the database as a generated column.

---

## 🔧 Maintenance

### Re-authenticate WhatsApp (if session expires)
```bash
cd scheduler
npm run setup
# Re-scan QR code, update WA_SESSION_DATA secret
```

### Manual notification run
Go to GitHub → Actions → WhatsApp Rent Notifier → Run workflow

### Manual overdue update
Go to GitHub → Actions → Mark Overdue Rents → Run workflow

---

## 🛡️ Security Notes

- All database access is protected by Supabase Row Level Security (RLS)
- Tenants can only see their own data — enforced at the database level
- Service role key is only used in GitHub Actions (never in frontend)
- Document storage uses signed URLs (expire after 1 hour)
- WhatsApp session is stored as an encrypted GitHub Secret
