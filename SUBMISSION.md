# EZTime - Attendance & Payroll POC
## Submission Document | Ido Shkuri

**Live System:** https://eztime-demo.onrender.com
**Source Code:** https://github.com/idoshkur/eztime-demo

---

## AI Tools Disclosure

This project was built with extensive use of AI tools:
- **Claude Code (Anthropic)** — Used for the entire codebase implementation: backend, frontend, database, deployment, and debugging. All code was generated, reviewed, and iterated through Claude Code.
- **ChatGPT (OpenAI)** — Used for initial PRD (Product Requirements Document) creation and product specification drafts.
- **Gemini (Google)** — Used for additional spec refinement and architectural brainstorming.

---

# Part B: Demo Implementation

## Live System

**URL:** https://eztime-demo.onrender.com

*(Note: The system is hosted on Render's free tier. The first load may take ~30 seconds if the server has been idle.)*

The system is a fully functional POC for the holding-company attendance & payroll challenge. An employee can work for different subsidiary companies in different roles on different days, with a unique hourly rate per [employee + company + role] combination. The system calculates hours, overtime tiers, salary, and daily deficit — all persisted in a cloud database.

### Employee View

The employee-facing interface allows:
- **Select an employee** from the existing list
- **Choose a work date**, a company (from the employee's allowed companies), and a role (from the employee's allowed roles)
- **Enter start/end times** using a custom 24-hour time input (HH:MM)
- **View daily payroll summary** — the system calculates and displays:
  - Total daily hours worked
  - Overtime tier breakdown: hours at 100%, 125%, and 150%
  - Night shift detection (minutes worked between 22:00–06:00)
  - Applied hourly rate (the MAX rate across all entries for that day)
  - Gross daily salary simulation with the tier formula
  - Daily deficit from the employee's quota (standard - worked, min 0)
  - Breakdown of hours by company and role

### Admin Panel

The admin panel provides full management capabilities:

- **Dashboard** — KPI overview: active employees, total entries, total hours, unique work days. Charts for entries per day, hours per employee, and entries by company.
- **Upload Excel** — Bulk import of employees, rates, and time entries from .xlsx files. The parser matches the structure of the provided Excel file (employees sheet, rates sheet, time entries sheet). Handles upsert logic — existing records are updated, new ones are inserted, duplicates are skipped.
- **Manage Employees** — Full CRUD operations:
  - Create new employees with ID, name, status, daily quota, allowed companies, and allowed roles
  - Inline edit of employee details
  - Rate management per employee — add, edit, delete hourly rates per company+role
  - Delete employees (cascades to all related entries, rates, and permissions)
- **Manage Time Entries** — Full CRUD with validation:
  - Create new time entries with employee dropdown, date picker, company/role selectors (populated from the employee's allowed list), and time inputs
  - Inline edit of existing entries
  - Delete entries with confirmation
  - Pagination (25 per page) and filter by employee
- **Data Insights** — Analytics dashboard with flexible filtering:
  - Filter by employee, company, role, date range
  - KPI cards: total hours, entries, work days, average hours/day
  - Breakdown tables: by employee, by company, by role, by company+role, by date
- **Payroll Report** — Monthly payroll breakdown per employee:
  - Select an employee and a month (YYYY-MM)
  - Daily table showing: date, hours worked, quota, deficit, 100%/125%/150% tiers, hourly rate, daily pay
  - Monthly summary row with totals
  - KPI cards: total hours, total deficit, monthly paycheck, work days
  - **Download as Excel** — exports the full monthly payroll report as a .xlsx file

### Data Validation & Integrity

The system enforces data accuracy at multiple levels:
- **Overlapping shift detection** — prevents creating time entries that overlap with existing entries for the same employee on the same day (e.g., "08:00–12:00 overlaps with 10:00–14:00")
- **Company/role authorization** — an employee can only clock into companies and roles they are assigned to
- **Rate verification** — a time entry can only be created if a rate exists for that employee+company+role combination
- **Time format validation** — enforces HH:MM format, valid ranges, duration > 0, max 16 hours
- **Duplicate prevention** — employee IDs must be unique; Excel upload skips duplicate time entries
- **Client-side warnings** — immediate feedback when start time equals end time

---

# Bonus 1: API Design

## Endpoint: Get Daily Payroll Analysis

| Field | Value |
|-------|-------|
| **URL** | `/api/payroll/daily` |
| **Method** | `GET` |
| **Required Params** | `employee_id` (string) — the employee identifier |
| | `work_date` (string, YYYY-MM-DD) — the work date to analyze |

### Example Request

```
GET /api/payroll/daily?employee_id=EMP-001&work_date=2025-01-15
```

### Example Success Response (200 OK)

```json
{
  "employee_id": "EMP-001",
  "work_date": "2025-01-15",
  "standard_daily_quota": 8,
  "total_worked_minutes": 630,
  "total_hours": 10.5,
  "night_minutes": 0,
  "overtime_threshold": 8,
  "hours_100": 8,
  "hours_125": 2,
  "hours_150": 0.5,
  "applied_hourly_rate": 80,
  "gross_daily_salary": 900,
  "daily_deficit_hours": 0,
  "entries": [
    {
      "id": "a1b2c3d4-...",
      "work_date": "2025-01-15",
      "employee_id": "EMP-001",
      "company_name": "Logistics Co",
      "role_name": "Warehouse Worker",
      "start_time": "07:00",
      "end_time": "15:30",
      "created_at": "2025-01-15T07:00:12Z"
    },
    {
      "id": "e5f6g7h8-...",
      "work_date": "2025-01-15",
      "employee_id": "EMP-001",
      "company_name": "Security Ltd",
      "role_name": "Guard",
      "start_time": "17:00",
      "end_time": "19:00",
      "created_at": "2025-01-15T17:00:05Z"
    }
  ],
  "breakdown_by_site_role": [
    {
      "company_name": "Logistics Co",
      "role_name": "Warehouse Worker",
      "minutes": 510,
      "hours": 8.5,
      "entry_count": 1
    },
    {
      "company_name": "Security Ltd",
      "role_name": "Guard",
      "minutes": 120,
      "hours": 2,
      "entry_count": 1
    }
  ]
}
```

### Response Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `employee_id` | string | The employee identifier |
| `work_date` | string | The work date (YYYY-MM-DD) |
| `standard_daily_quota` | number | Expected daily work hours (e.g., 8) |
| `total_worked_minutes` | number | Total minutes worked across all entries |
| `total_hours` | number | Total hours worked (total_worked_minutes / 60) |
| `night_minutes` | number | Minutes worked between 22:00–06:00 |
| `overtime_threshold` | number | 8 normally, or 7 if night_minutes >= 120 |
| `hours_100` | number | Hours paid at 100% (up to threshold) |
| `hours_125` | number | Hours paid at 125% (threshold to 10h) |
| `hours_150` | number | Hours paid at 150% (above 10h) |
| `applied_hourly_rate` | number | MAX hourly rate across all entries that day |
| `gross_daily_salary` | number | Calculated: `(h100 * rate) + (h125 * rate * 1.25) + (h150 * rate * 1.5)` |
| `daily_deficit_hours` | number | `max(quota - total_hours, 0)` |
| `entries` | array | All raw time entries for that day |
| `breakdown_by_site_role` | array | Hours grouped by company + role combination |

### Example Error Response (400 Bad Request)

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

### Possible Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_PARAMS` | 400 | `employee_id` or `work_date` query param not provided |
| `EMPLOYEE_NOT_FOUND` | 400 | Employee ID does not exist in the system |

---

# Bonus 2: API Implementation

The API is fully implemented and live at:

**Base URL:** `https://eztime-demo.onrender.com/api`

### All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/employees` | List all employees |
| `POST` | `/employees` | Create a new employee |
| `GET` | `/employees/:id/options` | Get allowed companies/roles for an employee |
| `PUT` | `/employees/:id` | Update employee details |
| `DELETE` | `/employees/:id` | Delete employee and all related data |
| `POST` | `/time-entries` | Create a time entry (with full validation) |
| `GET` | `/time-entries?employee_id=...&work_date=...` | Get time entries for a specific day |
| `PUT` | `/time-entries/:id` | Update a time entry |
| `DELETE` | `/time-entries/:id` | Delete a time entry |
| `GET` | `/payroll/daily?employee_id=...&work_date=...` | **Daily payroll analysis** |
| `POST` | `/admin/upload` | Upload Excel file (multipart/form-data) |
| `GET` | `/admin/dashboard` | Dashboard KPIs |
| `GET` | `/admin/employees` | List employees with entry counts |
| `GET` | `/admin/time-entries?page=...&limit=...` | Paginated time entries |
| `GET` | `/admin/rates?employee_id=...` | List rates |
| `POST` | `/admin/rates` | Create a rate |
| `PUT` | `/admin/rates` | Update a rate |
| `DELETE` | `/admin/rates` | Delete a rate |
| `GET` | `/admin/insights?employee_id=...&company_name=...` | Filterable data insights |
| `GET` | `/admin/payroll-report?employee_id=...&month=YYYY-MM` | Monthly payroll report (JSON) |
| `GET` | `/admin/payroll-report/export?employee_id=...&month=YYYY-MM` | Monthly payroll report (Excel download) |

*Postman screenshots demonstrating success and error responses should be attached separately.*

---

# System Implementation Overview

## Technology Stack

| Layer | Technology | Reasoning |
|-------|-----------|-----------|
| **Backend** | Node.js + Express + TypeScript | Fast development cycle, strong typing for business logic correctness, large ecosystem for middleware (multer, xlsx) |
| **Frontend** | React + Vite + TypeScript | Component-based UI with type safety, Vite provides fast builds and HMR during development |
| **Database** | Turso (libSQL) | Cloud-hosted SQLite-compatible database — zero configuration, free tier, persistent data across deployments, no separate DB server needed |
| **Deployment** | Render.com | Free-tier web service with auto-deploy from GitHub. Every `git push` triggers a new build and deployment |
| **Excel I/O** | xlsx (SheetJS) | Industry-standard library used for both reading uploaded .xlsx files and generating downloadable payroll reports |

## Architecture

The system is deployed as a **single monolithic service** on Render.com:

```
┌──────────────────────────────────────────┐
│              Render.com                   │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │         Express Server             │   │
│  │                                     │   │
│  │  /api/*  →  REST API (20+ routes)   │   │
│  │  /*      →  React SPA (static)      │   │
│  └──────────┬────────────────────────┘   │
│             │                             │
│             ▼                             │
│  ┌───────────────────────────────────┐   │
│  │    Turso Cloud Database            │   │
│  │    (libSQL — SQLite-compatible)    │   │
│  └───────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

The Express server serves both the API routes and the compiled React frontend as static files. A single URL handles everything — no CORS, no separate frontend deployment.

## Database Schema

Five tables model the holding-company structure:

- **`employees`** — Master data: employee_id (PK), full_name, status, standard_daily_quota
- **`employee_allowed_companies`** — Many-to-many: which subsidiary companies an employee can work for
- **`employee_allowed_roles`** — Many-to-many: which roles an employee can fill
- **`rates`** — Composite key (employee_id + company_name + role_name) → hourly_rate. This is the core of the multi-company model.
- **`time_entries`** — Clock records: id (UUID PK), work_date, employee_id, company_name, role_name, start_time, end_time, created_at

This schema directly maps to the business requirement: each combination of [employee + company + role] has its own rate, and the system tracks exactly which company and role each work entry belongs to.

## Payroll Calculation Engine

The core business logic lives in `payrollService.ts` and implements all required rules:

1. **Aggregate daily hours** — Sums durations across all entries for the day, correctly handling midnight-crossing shifts (e.g., 22:00–06:00 = 8 hours, not -16)
2. **Night shift detection** — Counts minutes in the 22:00–06:00 window, split into an evening half (22:00–00:00) and morning half (00:00–06:00)
3. **Overtime threshold** — Standard threshold is 8 hours. If night_minutes >= 120 (2 hours), threshold drops to 7 hours
4. **Tier calculation:**
   - `hours_100` = min(total_hours, threshold)
   - `hours_125` = min(max(total_hours - threshold, 0), 10 - threshold)
   - `hours_150` = max(total_hours - 10, 0)
5. **Rate selection** — When an employee works multiple companies/roles in one day, the MAX hourly rate is used for the entire day's calculation (as specified in the requirements)
6. **Gross salary** = `(hours_100 × rate) + (hours_125 × rate × 1.25) + (hours_150 × rate × 1.5)`
7. **Daily deficit** = `max(standard_daily_quota - total_hours, 0)` — negative deficit is clamped to 0

## Project Structure

```
eztime-demo/
├── backend/
│   ├── src/
│   │   ├── index.ts              — Express app setup, serves frontend in prod
│   │   ├── db/index.ts           — Turso database connection singleton
│   │   ├── db/schema.ts          — Table creation (DDL)
│   │   ├── routes/
│   │   │   ├── employees.ts      — Employee CRUD + allowed companies/roles
│   │   │   ├── timeEntries.ts    — Time entry CRUD + validation + overlap detection
│   │   │   ├── payroll.ts        — Daily payroll calculation endpoint
│   │   │   └── admin.ts          — Upload, dashboard, insights, rates, payroll report
│   │   ├── services/
│   │   │   ├── payrollService.ts  — Core payroll calculation engine
│   │   │   └── adminUploadService.ts — Excel import with upsert logic
│   │   └── utils/
│   │       └── excelParser.ts     — Excel file parsing (employees, rates, entries)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                — Main app with Employee/Admin tabs
│   │   ├── api/client.ts          — Typed API client (all endpoints + types)
│   │   └── components/
│   │       ├── AttendanceForm.tsx  — Employee clock-in form
│   │       ├── DailySummary.tsx    — Daily payroll display
│   │       ├── TimeInput.tsx       — Custom 24h time input
│   │       ├── AdminDashboard.tsx  — Dashboard KPIs
│   │       ├── AdminUpload.tsx     — Excel upload form
│   │       ├── AdminEmployeeManager.tsx — Employee + rate CRUD
│   │       ├── AdminTimeEntryManager.tsx — Time entry CRUD
│   │       └── AdminInsights.tsx   — Data insights + payroll report
│   └── package.json
├── package.json                    — Root package for unified build/deploy
└── render.yaml                     — Render deployment config
```

## Key Design Decisions

1. **Single deployment** — Backend serves the frontend as static files, simplifying deployment to a single Render service with one URL.
2. **Cloud database (Turso)** — Avoids the need for SQLite file storage on an ephemeral free-tier server. Data persists independently of deployments.
3. **Validation at the API layer** — All business rules (overlap detection, authorization, rate checks) are enforced server-side. The frontend provides UX hints but the backend is the source of truth.
4. **Reusable payroll engine** — `calculateDailyPayroll()` is called by both the employee-facing daily view and the admin monthly payroll report, ensuring consistent calculations everywhere.
5. **Excel round-trip** — The same `xlsx` library handles both import (upload) and export (payroll report download), keeping the data format consistent.
