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

# Part A: Architecture & Product Management (Theoretical)

## Question 1: Data Collection & Reliability

How would we ensure a field employee actually was on-site when reporting hours? Two proposed solutions:

### Solution 1: GPS Geofencing via Mobile App

**How it works:** Each work site is defined as a geofence (a virtual boundary on the map with a center coordinate and radius, e.g., 100m). The employee's mobile app checks their GPS location at clock-in and clock-out. If the employee is outside the geofence, the system blocks or flags the report.

| Dimension | Analysis |
|-----------|----------|
| **Cost** | Low-Medium. Uses built-in phone GPS — no additional hardware needed. Requires a mobile app (one-time development cost). Ongoing cost is minimal. |
| **Dev Complexity** | Medium. Requires a mobile app (iOS + Android or cross-platform), geofence management backend, and a GPS permission handling flow. Needs to handle edge cases: GPS drift, indoor inaccuracy, employees working across large sites. |
| **UX** | Good. Employee just opens the app and taps "Clock In" — location check happens automatically. However, GPS permission prompts can cause friction, and indoor locations (warehouses, malls) may have poor GPS accuracy. Battery drain from continuous location tracking can be a concern. |

**Pros:** No extra hardware, works everywhere with cellular coverage, can retroactively verify location data, scalable to hundreds of sites.
**Cons:** GPS accuracy is ±5-20m (worse indoors), employees can spoof GPS with apps (mitigatable with anti-spoofing), requires smartphone with location permissions enabled.

### Solution 2: NFC/QR Code Tags at Physical Sites

**How it works:** A physical NFC tag or printed QR code is placed at each work site entrance. The employee must physically scan the tag with their phone to clock in/out. Each tag has a unique encrypted ID tied to a specific site. The system validates that the scanned tag matches the expected site for the employee's shift.

| Dimension | Analysis |
|-----------|----------|
| **Cost** | Low. NFC tags cost ~$1-3 each. QR codes can be printed for free. No recurring hardware cost. Still requires a mobile app to scan. |
| **Dev Complexity** | Low-Medium. NFC/QR scanning is a well-supported feature in modern phones. Backend just needs to validate the tag ID against the site database. Simpler than GPS — no geofence calculations or location permissions needed. |
| **UX** | Excellent. Clear physical action — "tap your phone on the tag." No ambiguity about whether you're on-site. Fast (NFC scan takes <1 second). QR code scanning is universally understood. No battery drain issues. |

**Pros:** Very hard to fake (NFC tags require physical proximity of ~4cm), works perfectly indoors, no GPS permissions needed, simple and intuitive UX, extremely low cost per site.
**Cons:** Requires physical installation at each site (someone must place the tag), tags can be damaged/removed/stolen (mitigatable with alerts), doesn't continuously verify presence (only clock-in/out moments), requires NFC-capable phone (most modern smartphones have it).

**Recommendation:** A hybrid approach — NFC/QR for primary clock-in/out verification (highest reliability) combined with periodic GPS checks during the shift for continuous presence verification. This gives the best of both worlds: strong entry/exit validation with ongoing monitoring.

---

## Question 2: Data Flow

The complete data flow from clock-in to payroll-ready output:

```
[Employee on-site]
        │
        ▼
┌─────────────────────┐
│  1. CLOCK IN EVENT  │  Employee scans NFC tag / opens app
│                     │  → Captures: employee_id, timestamp, site_id,
│                     │    GPS coordinates, device_id
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  2. VALIDATION      │  Real-time checks:
│     LAYER           │  • Is employee registered for this site?
│                     │  • Is this a valid work day for them?
│                     │  • Anti-fraud: GPS matches site? Device recognized?
│                     │  • No duplicate clock-in already open?
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  3. RAW EVENT       │  Stored as immutable record:
│     STORAGE         │  { employee_id, work_date, company_name,
│                     │    role_name, clock_in_time, clock_out_time,
│                     │    site_id, verification_method }
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  4. HOURS ENGINE    │  Daily aggregation & business rules:
│     (Calculation)   │  • Sum total hours across all entries for the day
│                     │  • Detect split shifts (multiple entries same day)
│                     │  • Calculate night shift minutes (22:00–06:00)
│                     │  • Apply overtime tiers: 100% / 125% / 150%
│                     │  • Adjust overtime threshold (8h or 7h for night)
│                     │  • Calculate daily deficit vs. quota
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  5. RATE ENGINE     │  Salary calculation:
│                     │  • Look up rate for [employee + company + role]
│                     │  • If multiple rates in same day → use MAX rate
│                     │  • Apply rate to each overtime tier:
│                     │    salary = (hrs@100% × rate) +
│                     │             (hrs@125% × rate × 1.25) +
│                     │             (hrs@150% × rate × 1.5)
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  6. PAYROLL OUTPUT  │  Final structured data ready for export:
│                     │  • Per-day breakdown: hours, tiers, salary, deficit
│                     │  • Per-company breakdown: hours by company+role
│                     │  • Monthly aggregation: total pay, total deficit
│                     │  • Export formats: JSON API, Excel download
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  7. EXTERNAL        │  Integration with payroll systems:
│     PAYROLL SYSTEM  │  • REST API endpoint provides structured data
│                     │  • Excel export for manual import
│                     │  • Ready for integration with payroll software
└─────────────────────┘
```

**Key design principles in this flow:**
- **Immutability:** Raw clock events are never modified — all calculations are derived
- **Separation of concerns:** Collection, validation, calculation, and export are independent layers
- **Auditability:** Every step produces traceable data
- **Flexibility:** Rate changes, rule changes, and new companies can be added without affecting historical data

---

# Part B: Demo Implementation

## Live System

**URL:** https://eztime-demo.onrender.com

The system is deployed and fully functional. It includes:

### Employee Tab
- Select an employee from the list
- Choose a work date, company (from allowed list), and role (from allowed list)
- Enter start/end times using a 24-hour time input
- System calculates and displays:
  - Total daily hours
  - Hours at 100%, 125%, and 150% tiers
  - Night shift minutes
  - Applied hourly rate (MAX across all entries)
  - Gross daily salary calculation
  - Daily deficit from quota
  - Breakdown by company and role

### Admin Panel
- **Dashboard:** KPIs with total employees, entries, hours, and visual breakdowns
- **Upload Excel:** Import employee data, rates, and time entries from .xlsx files (matching the provided Excel structure)
- **Manage Employees:** Full CRUD — create (with allowed companies/roles), edit, delete employees, and manage their rates
- **Manage Time Entries:** Create, edit, delete time entries with overlap detection and validation
- **Data Insights:** Filterable analytics by employee, company, role, and date range
- **Payroll Report:** Monthly payroll breakdown per employee with daily pay, deficit tracking, and Excel export

### Data Validation
- Overlapping shift detection (prevents double-reporting)
- Company/role authorization checks
- Rate existence verification
- Time format and duration validation
- Duplicate employee prevention

---

# Bonus 1: API Design

## Endpoint: Get Daily Payroll Analysis

| Field | Value |
|-------|-------|
| **URL** | `/api/payroll/daily` |
| **Method** | `GET` |
| **Required Params** | `employee_id` (string), `work_date` (string, YYYY-MM-DD) |

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
| `gross_daily_salary` | number | Calculated salary: (h100 × rate) + (h125 × rate × 1.25) + (h150 × rate × 1.5) |
| `daily_deficit_hours` | number | max(quota - total_hours, 0) |
| `entries` | array | All time entries for that day |
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
| `MISSING_PARAMS` | 400 | `employee_id` or `work_date` not provided |
| `EMPLOYEE_NOT_FOUND` | 400 | Employee ID does not exist in the system |

---

# Bonus 2: API Implementation

The API is fully implemented and live. All endpoints are accessible at:

**Base URL:** `https://eztime-demo.onrender.com/api`

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/payroll/daily?employee_id=...&work_date=...` | Daily payroll analysis |
| `GET` | `/employees` | List all employees |
| `GET` | `/employees/:id/options` | Get allowed companies/roles for an employee |
| `POST` | `/time-entries` | Create a time entry (with validation) |
| `GET` | `/time-entries?employee_id=...&work_date=...` | Get entries for a day |
| `GET` | `/admin/payroll-report?employee_id=...&month=YYYY-MM` | Monthly payroll report |
| `GET` | `/admin/payroll-report/export?employee_id=...&month=YYYY-MM` | Download Excel payroll |
| `GET` | `/admin/insights?employee_id=...&company_name=...` | Filterable data insights |

*Note: Postman screenshots demonstrating success and error responses are attached separately.*

---

# System Implementation Overview

## Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | Node.js + Express + TypeScript | Fast development, type safety, rich ecosystem |
| **Frontend** | React + Vite + TypeScript | Modern SPA framework, fast build tooling |
| **Database** | Turso (libSQL) | SQLite-compatible cloud database — free tier, persistent storage, no server management |
| **Deployment** | Render.com | Free tier hosting, auto-deploys from GitHub on every push |
| **Excel Parsing** | xlsx (SheetJS) | Industry-standard library for reading/writing Excel files |

## Architecture

The system is a **monolithic full-stack application** deployed as a single service:

```
┌─────────────────────────────────────────┐
│              Render.com                  │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │         Express Server            │   │
│  │                                    │   │
│  │  /api/*  →  Backend Routes         │   │
│  │  /*      →  React SPA (static)     │   │
│  └──────────┬───────────────────────┘   │
│             │                            │
│             ▼                            │
│  ┌──────────────────────────────────┐   │
│  │    Turso Cloud Database           │   │
│  │    (libSQL / SQLite-compatible)   │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

Express serves both the API routes and the compiled React frontend as static files. This means a single deployment URL serves everything.

## Database Schema

Five tables handle the complete data model:

- **`employees`** — Employee master data (ID, name, status, daily quota)
- **`employee_allowed_companies`** — Which companies an employee can work for
- **`employee_allowed_roles`** — Which roles an employee can fill
- **`rates`** — Hourly rate per [employee + company + role] combination
- **`time_entries`** — Clock-in/out records (date, company, role, start/end time)

## Payroll Calculation Engine

The core business logic (`payrollService.ts`) implements all the required rules:

1. **Aggregate daily hours** — Sum all entry durations (handles midnight-crossing shifts)
2. **Night shift detection** — Count minutes in the 22:00–06:00 window
3. **Overtime threshold** — 8 hours normally, 7 hours if night_minutes >= 120
4. **Tier calculation** — 100% (up to threshold), 125% (threshold to 10h), 150% (above 10h)
5. **Rate selection** — MAX hourly rate across all entries that day
6. **Salary** — `(hours_100 × rate) + (hours_125 × rate × 1.25) + (hours_150 × rate × 1.5)`
7. **Deficit** — `max(quota - total_hours, 0)`

## Key Features Beyond Requirements

- **Overlap detection** — Prevents employees from having conflicting time entries
- **Admin panel** — Full CRUD for employees, rates, and time entries
- **Excel upload** — Bulk import matching the provided Excel structure
- **Data insights** — Filterable analytics dashboard
- **Monthly payroll report** — Aggregated view with Excel download
- **Responsive design** — Works on desktop and mobile
