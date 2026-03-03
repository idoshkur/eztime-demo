# EZTime – Attendance & Daily Payroll Demo

A full-stack demo system for recording employee attendance and computing daily payroll analytics — overtime tiers, night-rule threshold, applied rates, and company/role breakdowns.

## Tech Stack

| Layer    | Technology                               |
|----------|------------------------------------------|
| Backend  | Node.js · TypeScript · Express           |
| Database | SQLite (`better-sqlite3`)                |
| Frontend | React · TypeScript · Vite                |
| Styling  | Plain CSS (no UI library dependency)     |
| Excel I/O| `xlsx` npm package                       |

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- **EZTIME_DATA.xlsx** placed in the **project root** (`eztime-demo/`)

---

## Project Structure

```
eztime-demo/
├── EZTIME_DATA.xlsx              ← put the Excel file here
├── README.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── data/                     ← SQLite DB file (auto-created)
│   └── src/
│       ├── index.ts              ← Express entry point
│       ├── types/index.ts        ← Shared TypeScript types
│       ├── db/
│       │   ├── index.ts          ← DB connection singleton
│       │   └── schema.ts         ← DDL + schema init
│       ├── services/
│       │   └── payrollService.ts ← All calculation logic
│       ├── routes/
│       │   ├── employees.ts      ← GET /api/employees
│       │   ├── timeEntries.ts    ← POST/GET /api/time-entries
│       │   └── payroll.ts        ← GET /api/payroll/daily
│       └── seed/
│           └── seed.ts           ← Excel → SQLite seeder
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts            ← Dev proxy → backend :3001
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/client.ts         ← Typed fetch wrapper
        └── components/
            ├── AttendanceForm.tsx
            ├── DayEntriesTable.tsx
            └── PayrollSummary.tsx
```

---

## Running Locally

### Step 1 – Backend

```bash
cd backend
npm install
npm run db:init    # creates SQLite schema
npm run db:seed    # loads EZTIME_DATA.xlsx into DB
npm run dev        # starts Express on http://localhost:3001
```

### Step 2 – Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev        # starts Vite on http://localhost:3000
```

Open **http://localhost:3000** in your browser.

---

## Seeding Notes

The seed script reads three sheets from `EZTIME_DATA.xlsx`.
Column names are matched **case-insensitively** with common aliases.

### `EmployeeData` sheet

| Field                  | Accepted column names                                              |
|------------------------|--------------------------------------------------------------------|
| Employee ID            | `employee_id`, `id`, `emp_id`, `empid`                             |
| Full Name              | `full_name`, `name`, `fullname`, `employee_name`                   |
| Status                 | `status`                                                           |
| Daily quota (hours)    | `daily_standard_hours`, `standard_daily_quota`, `quota`, `hours`   |
| Allowed companies      | `allowed_companies_csv`, `allowed_companies`, `companies`, `sites` |
| Allowed roles          | `allowed_roles_csv`, `allowed_roles`, `roles`                      |

### `rates` sheet

| Field         | Accepted column names                                        |
|---------------|--------------------------------------------------------------|
| Employee ID   | `employee_id`, `id`, `emp_id`                                |
| Company name  | `company_name`, `companyname`, `company`, `site_name`, `site`|
| Role name     | `role_name`, `role`, `rolename`, `position`                  |
| Hourly rate   | `hourly_rate`, `rate`, `hourlyrate`, `payrate`               |

### `times` sheet

| Field         | Accepted column names                                        |
|---------------|--------------------------------------------------------------|
| Employee ID   | `employee_id`, `id`, `emp_id`                                |
| Work date     | `work_date`, `date`, `workdate`, `shift_date`                |
| Company name  | `company_name`, `companyname`, `company`, `site_name`, `site`|
| Role name     | `role_name`, `role`, `rolename`                              |
| Start time    | `start_time`, `start`, `starttime`, `time_in`                |
| End time      | `end_time`, `end`, `endtime`, `time_out`                     |

Excel date serials and time fractions (the native Excel format) are handled automatically.

---

## API Reference

### `GET /api/employees`
```json
[
  { "employee_id": "E1001", "full_name": "דנה אלון", "status": "active", "standard_daily_quota": 9 }
]
```

### `GET /api/employees/:id/options`
```json
{ "allowed_companies": ["חברת בת ב", "חברת בת ד"], "allowed_roles": ["מחסנאי", "קופאי"] }
```

### `POST /api/time-entries`
**Body:**
```json
{
  "employee_id":  "E1001",
  "work_date":    "2026-01-19",
  "company_name": "חברת בת ב",
  "role_name":    "מחסנאי",
  "start_time":   "08:00",
  "end_time":     "18:30"
}
```
**Returns 201** with the created entry, or **400** with a structured error.

### `GET /api/time-entries?employee_id=E1001&work_date=2026-01-19`
Returns ordered list of entries for that employee/day.

### `GET /api/payroll/daily?employee_id=E1001&work_date=2026-01-19`
```json
{
  "employee_id":          "E1001",
  "work_date":            "2026-01-19",
  "standard_daily_quota": 9,
  "total_worked_minutes": 630,
  "total_hours":          10.50,
  "night_minutes":        0,
  "overtime_threshold":   8,
  "hours_100":            8.00,
  "hours_125":            2.00,
  "hours_150":            0.50,
  "applied_hourly_rate":  87.00,
  "gross_daily_salary":   978.75,
  "daily_deficit_hours":  0.00,
  "entries":              [...],
  "breakdown_by_site_role": [
    { "company_name": "חברת בת ב", "role_name": "מחסנאי", "minutes": 630, "hours": 10.50, "entry_count": 1 }
  ]
}
```

### Error shape
```json
{ "error": { "code": "RATE_NOT_FOUND", "message": "No rate found for ...", "details": {} } }
```

---

## Calculation Rules

| Step | Rule |
|------|------|
| **6.1 Duration** | Sum entry durations; midnight-crossing entries: add 24 h to end. |
| **6.2 Night rule** | Night window = 22:00 – 06:00. If ≥ 120 min → threshold = **7 h**; else **8 h**. |
| **6.3 Tiers** | 100% = first `threshold` h · 125% = `threshold`→10 h · 150% = above 10 h |
| **6.4 Rate** | `applied_rate = MAX(hourly_rate)` across all entries of the day. |
| **6.5 Gross** | `h100×rate + h125×rate×1.25 + h150×rate×1.5` |
| **6.6 Deficit** | `max(quota − total_hours, 0)` |
| **6.7 Breakdown** | Group entries by `(company_name, role_name)`, sum minutes. |

---

## Input Validation (POST /api/time-entries)

| Check | Error code |
|-------|------------|
| All fields present | `MISSING_FIELDS` |
| Date is YYYY-MM-DD | `INVALID_DATE` |
| Times are HH:MM | `INVALID_TIME` |
| Duration 0 < d ≤ 16 h | `INVALID_DURATION` / `DURATION_TOO_LONG` |
| Employee exists | `EMPLOYEE_NOT_FOUND` |
| Company in allowed list | `COMPANY_NOT_ALLOWED` |
| Role in allowed list | `ROLE_NOT_ALLOWED` |
| Rate exists | `RATE_NOT_FOUND` |
| No overlap (same day) | `OVERLAP` |
| No overlap (cross-day overnight) | `OVERLAP` |
