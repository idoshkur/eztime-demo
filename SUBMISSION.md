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

# Part A: Architecture & Product Design (Theoretical)

## Background & Core Challenges

Managing a workforce within a complex multi-site organization introduces two primary challenges:

1. **Data Reliability:** Preventing fraudulent reporting (e.g., remote check-ins) and ensuring verified employee identity.
2. **Accurate Attribution:** Ensuring working hours are assigned to the correct site and role, especially when employees perform multiple roles or work at different sites on the same day.

The key business risk is not only inaccurate hour reporting, but incorrect attribution of hours to a higher-paying site or role, which may lead to payroll inaccuracies and financial exposure.

### Selected Product Concept: Passive Reporter Model

The employee is defined as a **passive reporter**:
- The employee does **not** select: the site, the role, or the pay rate
- All shift parameters are predefined in the scheduling system by the employer
- The employee only confirms physical presence (check-in / check-out)

This approach significantly reduces manipulation risk and strengthens operational control.

---

## 1. Technological Solutions for Data Collection & Reliability

### Solution A: Physical Attendance Terminal (Biometric / Smart Card)

**Description:** A physical attendance terminal is installed at each work site, allowing employees to check in and out using fingerprint authentication or a smart employee card.

**Operational Flow:**
1. The manager defines a daily schedule in advance.
2. The employee arrives at the site and performs a clock-in at the terminal.
3. The server performs validation checks: an active schedule exists, entry time is within acceptable deviation limits.
4. The event is automatically linked to the predefined schedule.
5. The employee cannot modify the site or role.

| Advantages | Disadvantages |
|------------|---------------|
| Highest fraud prevention (prevents buddy punching and remote reporting) | Hardware costs (purchase, installation, maintenance) |
| No smartphone/battery/data plan required | Physical setup and deployment time |
| Simple "touch and go" UX | Less suitable for temporary sites |
| Works in GPS-restricted areas (underground, warehouses) | |

**RICE Evaluation:**
- **Reach:** Very High (up to 100% of workforce)
- **Impact:** High (complete identity verification)
- **Confidence:** Very High (biometric/site-based validation)
- **Effort:** Medium (hardware logistics and installation)

**Business Fit:** Best for permanent, high-volume, or sensitive sites where maximum reliability is required.

### Solution B: Location-Based Mobile Application

**Description:** A mobile application that allows attendance reporting only when the employee is within a predefined geographic radius of the assigned work site.

**Operational Flow:**
1. The manager defines a daily schedule.
2. The employee arrives and opens the app.
3. "Check-In" becomes active only if the employee is within the defined radius and an active schedule exists.
4. The event is stored with timestamp and location metadata.

| Advantages | Disadvantages |
|------------|---------------|
| Immediate deployment across thousands of sites | Privacy concerns (location tracking) |
| Minimal cost (software-only) | Requires smartphone with sufficient battery |
| Real-time push notifications | Moderate reliability (GPS can be inaccurate indoors) |
| Easily supports temporary sites | |

**RICE Evaluation:**
- **Reach:** Medium–High (depends on workforce demographics)
- **Impact:** Medium–High (significant improvement over manual reporting)
- **Confidence:** Medium (GPS limitations)
- **Effort:** Low (software development only)

**Business Fit:** Best for temporary, distributed, or mobile workforce environments.

### Recommended Business Approach

Given the sensitivity of payroll accuracy and the financial risk associated with incorrect role attribution, the chosen solution is **Physical Attendance Terminals (Solution A)**.

This provides: the highest level of identity verification, elimination of personal device dependency, reliable on-site presence validation, and maximum payroll accuracy in role-based compensation environments.

---

## 2. Data Flow Architecture

### Architectural Principle

The system follows an **event-driven architecture** and separates:
- **Raw Data Layer:** Attendance events as recorded
- **Business Processing Layer:** Hour calculation, overtime classification, and payroll preparation

This separation ensures scalability and flexibility for future policy changes.

### Step 1: Event Capture (Client Layer)

The endpoint sends a raw event object (without hour calculations):

```json
{
  "event_id": "uuid-12345",
  "employee_id": "E1001",
  "timestamp": "2026-02-04T07:15:00Z",
  "event_type": "CHECK_IN",
  "source": {
    "type": "BIOMETRIC_TERMINAL",
    "device_id": "TERM-SOUTH-04"
  },
  "verification": {
    "method": "FINGERPRINT",
    "status": "SUCCESS"
  }
}
```

### Step 2: Validation & Alerting

The server validates: an active scheduled shift exists, time deviation is within tolerance, logical sequence (no check-out without check-in).

If validation fails, an alert is generated:

```json
{
  "alert_type": "UNAUTHORIZED_REPORT",
  "severity": "CRITICAL",
  "message": "Employee E1001 is not scheduled for SITE_SOUTH today",
  "actions": ["NOTIFY_MANAGER", "NOTIFY_EMPLOYEE_PUSH"],
  "original_event_id": "uuid-12345"
}
```

All events, including rejected ones, are stored for audit purposes.

### Step 3: Work Session Builder

Matching check-in and check-out events create a session:

```json
{
  "session_id": "sess-9988",
  "employee_id": "E1001",
  "site_id": "SITE_402",
  "role_id": "WAREHOUSE_OP",
  "actual_start": "2026-02-04T07:15:00Z",
  "actual_end": "2026-02-04T16:45:00Z"
}
```

Multiple sessions per day are supported (split shifts).

### Step 4: Daily Hours Classification

**Step 4.1 — Aggregate Daily Work Time:** All sessions on the same day are summed. Split shifts are combined before overtime logic.

**Step 4.2 — Determine Overtime Threshold:**
- Default: overtime begins after **8 hours**
- Night rule: if night_hours >= 2 (between 22:00–06:00), threshold drops to **7 hours**

**Step 4.3 — Classify Hours into Payment Tiers:**
- **100% (Regular):** Up to the overtime threshold (7 or 8 hours)
- **125% (Overtime Level 1):** From the threshold up to 10 total hours
- **150% (Overtime Level 2):** Any hours beyond 10 total hours

*Example: Employee worked 10.5 hours, no night shift → threshold = 8 → Regular = 8h, 125% = 2h, 150% = 0.5h*

### Step 5: Rate Assignment & Salary Calculation

**Step 5.1 — Applied Rate:** If the employee worked at multiple sites/roles on the same day:
`applied_hourly_rate = MAX(hourly_rate)` across all entries that day.

**Step 5.2 — Gross Daily Salary:**
```
salary_100 = hours_100 × rate
salary_125 = hours_125 × rate × 1.25
salary_150 = hours_150 × rate × 1.5
gross_daily_salary = salary_100 + salary_125 + salary_150
```

*Example: rate = ₪87 → 8×87 + 2×87×1.25 + 0.5×87×1.5 = 696 + 217.5 + 65.25 = **₪978.75***

### Step 6: Audit & Transparency

All raw events are permanently stored, including rejected reports. This enables: recalculation if rules change, dispute resolution, full client transparency, and historical payroll reconstruction.

### Step 7: Payroll-Ready Output

The system generates a finalized payroll record including: employee_id, date, total_hours, hours per tier, applied rate, gross salary, daily quota, daily deficit, and breakdown by company and role.

**Daily Deficit Logic:** `daily_deficit = max(standard_daily_quota - total_hours_worked, 0)` — deficit is never negative.

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
- **Export Monthly Payroll to Excel** — downloads a .xlsx file with the full monthly payroll report for the selected employee

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
  - **Export All Employees** — exports a multi-sheet workbook with a summary sheet and per-employee daily breakdown for the selected month

### Data Validation & Integrity

The system enforces data accuracy at multiple levels:
- **Overlapping shift detection** — prevents creating time entries that overlap with existing entries for the same employee on the same day (e.g., "08:00–12:00 overlaps with 10:00–14:00")
- **Company/role authorization** — an employee can only clock into companies and roles they are assigned to
- **Rate verification** — a time entry can only be created if a rate exists for that employee+company+role combination
- **Time format validation** — enforces HH:MM format, valid ranges, duration > 0, max 16 hours
- **Duplicate prevention** — employee IDs must be unique; Excel upload skips duplicate time entries
- **Client-side warnings** — immediate feedback when start time equals end time
- **Consistent error handling** — all "not found" scenarios return HTTP 404 with a standard JSON error structure

---

# Bonus 1: API Design

## Standard Error Format

All API errors follow this consistent JSON structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of what went wrong",
    "details": {}
  }
}
```

The `details` field is optional and only included when additional context is available (e.g., a list of allowed values).

---

## Endpoint: Get Daily Payroll Analysis

| Field | Value |
|-------|-------|
| **URL** | `/api/payroll/daily` |
| **Method** | `GET` |
| **Purpose** | Calculate and return a complete daily payroll analysis for a specific employee on a specific date. Includes overtime tiers, night shift detection, applied rate, gross salary, and breakdown by company+role. |

### Parameters

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | Yes | string | The employee identifier (e.g., `"EMP-001"`) |
| `work_date` | Query | Yes | string | The date to analyze, format `YYYY-MM-DD` (e.g., `"2025-01-15"`) |

### Example Request

```
GET /api/payroll/daily?employee_id=EMP-001&work_date=2025-01-15
```

### Success Response (200 OK)

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
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "work_date": "2025-01-15",
      "employee_id": "EMP-001",
      "company_name": "Logistics Co",
      "role_name": "Warehouse Worker",
      "start_time": "07:00",
      "end_time": "15:30",
      "created_at": "2025-01-15T07:00:12.000Z"
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "work_date": "2025-01-15",
      "employee_id": "EMP-001",
      "company_name": "Security Ltd",
      "role_name": "Guard",
      "start_time": "17:00",
      "end_time": "19:00",
      "created_at": "2025-01-15T17:00:05.000Z"
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

### Error Response — Missing Parameters (400)

```json
{
  "error": {
    "code": "MISSING_PARAMS",
    "message": "Query params employee_id and work_date are required"
  }
}
```

### Error Response — Employee Not Found (404)

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
| `EMPLOYEE_NOT_FOUND` | 404 | Employee ID does not exist in the system |

---

# Bonus 2: API Implementation

The API is fully implemented and live at:

**Base URL:** `https://eztime-demo.onrender.com/api`

---

## Employee Endpoints

### 1. List All Employees

| Field | Value |
|-------|-------|
| **URL** | `/api/employees` |
| **Method** | `GET` |
| **Purpose** | Retrieve a list of all employees, sorted by name. |

**Parameters:** None

**Success Response (200 OK):**

```json
[
  {
    "employee_id": "EMP-001",
    "full_name": "Alice Johnson",
    "status": "active",
    "standard_daily_quota": 8
  },
  {
    "employee_id": "EMP-002",
    "full_name": "Bob Smith",
    "status": "active",
    "standard_daily_quota": 8
  }
]
```

---

### 2. Create Employee

| Field | Value |
|-------|-------|
| **URL** | `/api/employees` |
| **Method** | `POST` |
| **Purpose** | Create a new employee with optional allowed companies and roles. |

**Request Body:**

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `employee_id` | Yes | string | Unique employee identifier |
| `full_name` | Yes | string | Employee's full name |
| `status` | No | string | `"active"` or `"inactive"` (default: `"active"`) |
| `standard_daily_quota` | No | number | Daily work hour quota (default: `8`) |
| `allowed_companies` | No | string[] | List of allowed company names |
| `allowed_roles` | No | string[] | List of allowed role names |

**Example Request:**

```json
POST /api/employees
{
  "employee_id": "EMP-003",
  "full_name": "Charlie Davis",
  "status": "active",
  "standard_daily_quota": 8,
  "allowed_companies": ["Logistics Co", "Security Ltd"],
  "allowed_roles": ["Guard", "Driver"]
}
```

**Success Response (201 Created):**

```json
{
  "employee_id": "EMP-003",
  "full_name": "Charlie Davis",
  "status": "active",
  "standard_daily_quota": 8
}
```

**Error Response — Missing Fields (400):**

```json
{
  "error": {
    "code": "MISSING_FIELDS",
    "message": "employee_id and full_name are required"
  }
}
```

**Error Response — Employee Already Exists (409):**

```json
{
  "error": {
    "code": "EMPLOYEE_EXISTS",
    "message": "Employee \"EMP-003\" already exists"
  }
}
```

---

### 3. Get Employee Options

| Field | Value |
|-------|-------|
| **URL** | `/api/employees/:employeeId/options` |
| **Method** | `GET` |
| **Purpose** | Retrieve the list of allowed companies and roles for a specific employee. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employeeId` | URL Path | Yes | string | The employee identifier |

**Example Request:**

```
GET /api/employees/EMP-001/options
```

**Success Response (200 OK):**

```json
{
  "allowed_companies": ["Logistics Co", "Security Ltd"],
  "allowed_roles": ["Guard", "Warehouse Worker"]
}
```

**Error Response — Employee Not Found (404):**

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

---

### 4. Update Employee

| Field | Value |
|-------|-------|
| **URL** | `/api/employees/:employeeId` |
| **Method** | `PUT` |
| **Purpose** | Update employee details (name, status, or quota). |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employeeId` | URL Path | Yes | string | The employee identifier |
| `full_name` | Body | No | string | Updated name |
| `status` | Body | No | string | `"active"` or `"inactive"` |
| `standard_daily_quota` | Body | No | number | Updated daily quota |

At least one body field must be provided.

**Example Request:**

```json
PUT /api/employees/EMP-001
{
  "full_name": "Alice Johnson-Smith",
  "standard_daily_quota": 7
}
```

**Success Response (200 OK):**

```json
{
  "employee_id": "EMP-001",
  "full_name": "Alice Johnson-Smith",
  "status": "active",
  "standard_daily_quota": 7
}
```

**Error Response — Employee Not Found (404):**

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

**Error Response — No Fields Provided (400):**

```json
{
  "error": {
    "code": "NO_FIELDS",
    "message": "Provide at least one field to update"
  }
}
```

---

### 5. Delete Employee

| Field | Value |
|-------|-------|
| **URL** | `/api/employees/:employeeId` |
| **Method** | `DELETE` |
| **Purpose** | Delete an employee and cascade-delete all related data (time entries, rates, allowed companies/roles). |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employeeId` | URL Path | Yes | string | The employee identifier |

**Example Request:**

```
DELETE /api/employees/EMP-003
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "deleted": {
    "time_entries": 15,
    "rates": 3,
    "allowed_companies": 2,
    "allowed_roles": 2
  }
}
```

**Error Response — Employee Not Found (404):**

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

---

## Time Entry Endpoints

### 6. Create Time Entry

| Field | Value |
|-------|-------|
| **URL** | `/api/time-entries` |
| **Method** | `POST` |
| **Purpose** | Create a new time entry with full validation: employee exists, company/role authorized, rate exists, no overlapping shifts, valid time format. |

**Request Body:**

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `employee_id` | Yes | string | Employee identifier |
| `work_date` | Yes | string | Date in `YYYY-MM-DD` format |
| `company_name` | Yes | string | Company the employee worked for |
| `role_name` | Yes | string | Role the employee filled |
| `start_time` | Yes | string | Start time in `HH:MM` format (24-hour) |
| `end_time` | Yes | string | End time in `HH:MM` format (24-hour) |

**Example Request:**

```json
POST /api/time-entries
{
  "employee_id": "EMP-001",
  "work_date": "2025-01-15",
  "company_name": "Logistics Co",
  "role_name": "Warehouse Worker",
  "start_time": "08:00",
  "end_time": "16:00"
}
```

**Success Response (201 Created):**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "work_date": "2025-01-15",
  "employee_id": "EMP-001",
  "company_name": "Logistics Co",
  "role_name": "Warehouse Worker",
  "start_time": "08:00",
  "end_time": "16:00",
  "created_at": "2025-01-15T08:00:00.000Z"
}
```

**Error Response — Missing Fields (400):**

```json
{
  "error": {
    "code": "MISSING_FIELDS",
    "message": "Missing required fields: employee_id, work_date"
  }
}
```

**Error Response — Employee Not Found (404):**

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

**Error Response — Rate Not Found (404):**

```json
{
  "error": {
    "code": "RATE_NOT_FOUND",
    "message": "No rate found for employee \"EMP-001\" at company \"Unknown Co\" with role \"Guard\""
  }
}
```

**Error Response — Overlap Detected (400):**

```json
{
  "error": {
    "code": "OVERLAP",
    "message": "This entry (08:00–16:00) overlaps with an existing entry (07:00–12:00) on 2025-01-15"
  }
}
```

**Error Response — Company Not Allowed (400):**

```json
{
  "error": {
    "code": "COMPANY_NOT_ALLOWED",
    "message": "Company \"Unknown Co\" is not allowed for this employee",
    "details": {
      "allowed": ["Logistics Co", "Security Ltd"]
    }
  }
}
```

### Possible Error Codes for Time Entry Creation

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `MISSING_FIELDS` | 400 | One or more required fields missing |
| `INVALID_DATE` | 400 | `work_date` not in YYYY-MM-DD format |
| `INVALID_TIME` | 400 | `start_time` or `end_time` not in HH:MM format |
| `INVALID_DURATION` | 400 | Duration is 0 minutes |
| `DURATION_TOO_LONG` | 400 | Duration exceeds 16 hours |
| `EMPLOYEE_NOT_FOUND` | 404 | Employee ID does not exist |
| `COMPANY_NOT_ALLOWED` | 400 | Employee not authorized for this company |
| `ROLE_NOT_ALLOWED` | 400 | Employee not authorized for this role |
| `RATE_NOT_FOUND` | 404 | No hourly rate defined for this employee+company+role |
| `OVERLAP` | 400 | New entry overlaps with an existing time entry |

---

### 7. Get Time Entries for a Day

| Field | Value |
|-------|-------|
| **URL** | `/api/time-entries` |
| **Method** | `GET` |
| **Purpose** | Retrieve all time entries for a specific employee on a specific date. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | Yes | string | Employee identifier |
| `work_date` | Query | Yes | string | Date in `YYYY-MM-DD` format |

**Example Request:**

```
GET /api/time-entries?employee_id=EMP-001&work_date=2025-01-15
```

**Success Response (200 OK):**

```json
[
  {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "work_date": "2025-01-15",
    "employee_id": "EMP-001",
    "company_name": "Logistics Co",
    "role_name": "Warehouse Worker",
    "start_time": "08:00",
    "end_time": "16:00",
    "created_at": "2025-01-15T08:00:00.000Z"
  }
]
```

**Error Response — Missing Parameters (400):**

```json
{
  "error": {
    "code": "MISSING_PARAMS",
    "message": "Query params employee_id and work_date are required"
  }
}
```

---

### 8. Update Time Entry

| Field | Value |
|-------|-------|
| **URL** | `/api/time-entries/:id` |
| **Method** | `PUT` |
| **Purpose** | Update an existing time entry. Re-validates all business rules (overlap, authorization, rate). |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `id` | URL Path | Yes | string (UUID) | The time entry ID |
| `work_date` | Body | No | string | Updated date |
| `company_name` | Body | No | string | Updated company |
| `role_name` | Body | No | string | Updated role |
| `start_time` | Body | No | string | Updated start time |
| `end_time` | Body | No | string | Updated end time |

At least one body field must be provided.

**Example Request:**

```json
PUT /api/time-entries/f47ac10b-58cc-4372-a567-0e02b2c3d479
{
  "end_time": "17:00"
}
```

**Success Response (200 OK):**

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "work_date": "2025-01-15",
  "employee_id": "EMP-001",
  "company_name": "Logistics Co",
  "role_name": "Warehouse Worker",
  "start_time": "08:00",
  "end_time": "17:00",
  "created_at": "2025-01-15T08:00:00.000Z"
}
```

**Error Response — Entry Not Found (404):**

```json
{
  "error": {
    "code": "ENTRY_NOT_FOUND",
    "message": "Time entry \"invalid-uuid\" not found"
  }
}
```

---

### 9. Delete Time Entry

| Field | Value |
|-------|-------|
| **URL** | `/api/time-entries/:id` |
| **Method** | `DELETE` |
| **Purpose** | Delete a specific time entry. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `id` | URL Path | Yes | string (UUID) | The time entry ID |

**Example Request:**

```
DELETE /api/time-entries/f47ac10b-58cc-4372-a567-0e02b2c3d479
```

**Success Response (200 OK):**

```json
{
  "success": true
}
```

**Error Response — Entry Not Found (404):**

```json
{
  "error": {
    "code": "ENTRY_NOT_FOUND",
    "message": "Time entry \"invalid-uuid\" not found"
  }
}
```

---

## Payroll Endpoint

### 10. Get Daily Payroll Analysis

*(Detailed above in Bonus 1)*

| Field | Value |
|-------|-------|
| **URL** | `/api/payroll/daily` |
| **Method** | `GET` |
| **Purpose** | Calculate complete daily payroll for an employee. |

---

## Admin Endpoints

### 11. Upload Excel File

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/upload` |
| **Method** | `POST` |
| **Content-Type** | `multipart/form-data` |
| **Purpose** | Bulk import employees, rates, and time entries from an .xlsx file. Uses upsert logic. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `file` | Form Data | Yes | .xlsx file | Excel file with sheets: employees, rates, time_entries |

**Example Request (curl):**

```bash
curl -X POST https://eztime-demo.onrender.com/api/admin/upload \
  -F "file=@data.xlsx"
```

**Success Response (200 OK):**

```json
{
  "success": true,
  "summary": {
    "employees": { "inserted": 3, "updated": 1, "skipped": 0 },
    "rates": { "inserted": 5, "updated": 2, "skipped": 0 },
    "timeEntries": { "inserted": 20, "duplicates": 3, "skipped": 1 },
    "warnings": ["Row 5 in time_entries: employee EMP-999 not found, skipping"]
  }
}
```

**Error Response — No File (400):**

```json
{
  "error": {
    "code": "NO_FILE",
    "message": "No file uploaded. Send a .xlsx file as \"file\" field."
  }
}
```

---

### 12. Dashboard KPIs

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/dashboard` |
| **Method** | `GET` |
| **Purpose** | Retrieve aggregate KPIs: employee count, total entries, total hours, hours per employee, and entries by company. |

**Parameters:** None

**Success Response (200 OK):**

```json
{
  "employeeCount": 5,
  "totalEntries": 120,
  "totalHoursWorked": 854.5,
  "uniqueDays": 22,
  "entriesPerDay": [
    { "work_date": "2025-01-15", "entry_count": 8, "employee_count": 4 }
  ],
  "hoursPerEmployee": [
    {
      "employee_id": "EMP-001",
      "full_name": "Alice Johnson",
      "entry_count": 30,
      "days_worked": 20,
      "total_hours": 175.5
    }
  ],
  "entriesByCompany": [
    { "company_name": "Logistics Co", "entry_count": 60, "employee_count": 3 }
  ]
}
```

---

### 13. List Employees (Admin)

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/employees` |
| **Method** | `GET` |
| **Purpose** | List all employees with their time entry counts. |

**Parameters:** None

**Success Response (200 OK):**

```json
[
  {
    "employee_id": "EMP-001",
    "full_name": "Alice Johnson",
    "status": "active",
    "standard_daily_quota": 8,
    "entry_count": 30
  }
]
```

---

### 14. List Time Entries (Admin, Paginated)

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/time-entries` |
| **Method** | `GET` |
| **Purpose** | Retrieve paginated time entries with employee names. Optionally filter by employee. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | No | string | Filter by employee |
| `page` | Query | No | number | Page number (default: 1) |
| `limit` | Query | No | number | Entries per page (default: 50, max: 100) |

**Example Request:**

```
GET /api/admin/time-entries?employee_id=EMP-001&page=1&limit=25
```

**Success Response (200 OK):**

```json
{
  "entries": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "work_date": "2025-01-15",
      "employee_id": "EMP-001",
      "company_name": "Logistics Co",
      "role_name": "Warehouse Worker",
      "start_time": "08:00",
      "end_time": "16:00",
      "created_at": "2025-01-15T08:00:00.000Z",
      "employee_name": "Alice Johnson"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 25
}
```

---

### 15. List Rates

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/rates` |
| **Method** | `GET` |
| **Purpose** | List all hourly rates. Optionally filter by employee. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | No | string | Filter rates for a specific employee |

**Example Request:**

```
GET /api/admin/rates?employee_id=EMP-001
```

**Success Response (200 OK):**

```json
[
  {
    "employee_id": "EMP-001",
    "company_name": "Logistics Co",
    "role_name": "Warehouse Worker",
    "hourly_rate": 50
  },
  {
    "employee_id": "EMP-001",
    "company_name": "Security Ltd",
    "role_name": "Guard",
    "hourly_rate": 80
  }
]
```

---

### 16. Create Rate

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/rates` |
| **Method** | `POST` |
| **Purpose** | Create a new hourly rate for an employee+company+role combination. |

**Request Body:**

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `employee_id` | Yes | string | Employee identifier |
| `company_name` | Yes | string | Company name |
| `role_name` | Yes | string | Role name |
| `hourly_rate` | Yes | number | Hourly rate (must be > 0) |

**Example Request:**

```json
POST /api/admin/rates
{
  "employee_id": "EMP-001",
  "company_name": "Tech Corp",
  "role_name": "Developer",
  "hourly_rate": 120
}
```

**Success Response (201 Created):**

```json
{
  "employee_id": "EMP-001",
  "company_name": "Tech Corp",
  "role_name": "Developer",
  "hourly_rate": 120
}
```

**Error Response — Rate Already Exists (409):**

```json
{
  "error": {
    "code": "RATE_EXISTS",
    "message": "Rate already exists for this employee/company/role combination"
  }
}
```

**Error Response — Invalid Rate (400):**

```json
{
  "error": {
    "code": "INVALID_RATE",
    "message": "hourly_rate must be a positive number"
  }
}
```

---

### 17. Update Rate

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/rates` |
| **Method** | `PUT` |
| **Purpose** | Update the hourly rate for an existing employee+company+role combination. |

**Request Body:**

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `employee_id` | Yes | string | Employee identifier |
| `company_name` | Yes | string | Company name |
| `role_name` | Yes | string | Role name |
| `hourly_rate` | Yes | number | New hourly rate (must be > 0) |

**Example Request:**

```json
PUT /api/admin/rates
{
  "employee_id": "EMP-001",
  "company_name": "Tech Corp",
  "role_name": "Developer",
  "hourly_rate": 130
}
```

**Success Response (200 OK):**

```json
{
  "employee_id": "EMP-001",
  "company_name": "Tech Corp",
  "role_name": "Developer",
  "hourly_rate": 130
}
```

**Error Response — Rate Not Found (404):**

```json
{
  "error": {
    "code": "RATE_NOT_FOUND",
    "message": "Rate not found"
  }
}
```

---

### 18. Delete Rate

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/rates` |
| **Method** | `DELETE` |
| **Purpose** | Delete an hourly rate for an employee+company+role combination. |

**Request Body:**

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `employee_id` | Yes | string | Employee identifier |
| `company_name` | Yes | string | Company name |
| `role_name` | Yes | string | Role name |

**Example Request:**

```json
DELETE /api/admin/rates
{
  "employee_id": "EMP-001",
  "company_name": "Tech Corp",
  "role_name": "Developer"
}
```

**Success Response (200 OK):**

```json
{
  "success": true
}
```

**Error Response — Rate Not Found (404):**

```json
{
  "error": {
    "code": "RATE_NOT_FOUND",
    "message": "Rate not found"
  }
}
```

---

### 19. Data Insights

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/insights` |
| **Method** | `GET` |
| **Purpose** | Retrieve analytics with flexible filtering: summary KPIs, breakdowns by employee, company, role, date, and company+role. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | No | string | Filter by employee |
| `company_name` | Query | No | string | Filter by company |
| `role_name` | Query | No | string | Filter by role |
| `date_from` | Query | No | string | Start date (YYYY-MM-DD) |
| `date_to` | Query | No | string | End date (YYYY-MM-DD) |

**Example Request:**

```
GET /api/admin/insights?company_name=Logistics%20Co&date_from=2025-01-01&date_to=2025-01-31
```

**Success Response (200 OK):**

```json
{
  "filters": {
    "company_name": "Logistics Co",
    "date_from": "2025-01-01",
    "date_to": "2025-01-31"
  },
  "availableCompanies": ["Logistics Co", "Security Ltd", "Tech Corp"],
  "availableRoles": ["Guard", "Warehouse Worker", "Driver"],
  "summary": {
    "totalEntries": 45,
    "totalHours": 340.5,
    "uniqueDays": 20,
    "uniqueEmployees": 3,
    "uniqueCompanies": 1,
    "avgHoursPerDay": 17.03
  },
  "byEmployee": [
    {
      "employee_id": "EMP-001",
      "full_name": "Alice Johnson",
      "total_hours": 160.5,
      "entry_count": 20,
      "days_worked": 20
    }
  ],
  "byCompany": [
    {
      "company_name": "Logistics Co",
      "total_hours": 340.5,
      "entry_count": 45,
      "employee_count": 3
    }
  ],
  "byRole": [
    {
      "role_name": "Warehouse Worker",
      "total_hours": 200,
      "entry_count": 25
    }
  ],
  "byDate": [
    {
      "work_date": "2025-01-15",
      "total_hours": 24.5,
      "entry_count": 3
    }
  ],
  "byCompanyRole": [
    {
      "company_name": "Logistics Co",
      "role_name": "Warehouse Worker",
      "total_hours": 200,
      "entry_count": 25
    }
  ]
}
```

---

### 20. Monthly Payroll Report (JSON)

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/payroll-report` |
| **Method** | `GET` |
| **Purpose** | Generate a monthly payroll report for a specific employee. Returns daily breakdown with overtime tiers and monthly totals. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | Yes | string | Employee identifier |
| `month` | Query | Yes | string | Month in `YYYY-MM` format |

**Example Request:**

```
GET /api/admin/payroll-report?employee_id=EMP-001&month=2025-01
```

**Success Response (200 OK):**

```json
{
  "employee": {
    "employee_id": "EMP-001",
    "full_name": "Alice Johnson",
    "status": "active",
    "standard_daily_quota": 8
  },
  "month": "2025-01",
  "days": [
    {
      "work_date": "2025-01-15",
      "total_hours": 10.5,
      "standard_daily_quota": 8,
      "daily_deficit_hours": 0,
      "hours_100": 8,
      "hours_125": 2,
      "hours_150": 0.5,
      "applied_hourly_rate": 80,
      "gross_daily_salary": 900,
      "night_minutes": 0
    }
  ],
  "monthly": {
    "total_hours": 175.5,
    "total_deficit": 4.5,
    "total_salary": 15200,
    "total_hours_100": 160,
    "total_hours_125": 12,
    "total_hours_150": 3.5,
    "work_days": 22
  }
}
```

**Error Response — Missing Parameters (400):**

```json
{
  "error": {
    "code": "MISSING_PARAMS",
    "message": "employee_id and month (YYYY-MM) are required"
  }
}
```

**Error Response — Invalid Month Format (400):**

```json
{
  "error": {
    "code": "INVALID_MONTH",
    "message": "month must be YYYY-MM format"
  }
}
```

**Error Response — Employee Not Found (404):**

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

---

### 21. Monthly Payroll Report (Excel Download)

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/payroll-report/export` |
| **Method** | `GET` |
| **Purpose** | Download the monthly payroll report as a formatted .xlsx file. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `employee_id` | Query | Yes | string | Employee identifier |
| `month` | Query | Yes | string | Month in `YYYY-MM` format |

**Example Request:**

```
GET /api/admin/payroll-report/export?employee_id=EMP-001&month=2025-01
```

**Success Response (200 OK):**

Returns a binary `.xlsx` file download with headers:
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="payroll_EMP-001_2025-01.xlsx"`

The worksheet contains:
- Title row with employee name and month
- Daily breakdown table (Date, Hours, Quota, Deficit, 100%/125%/150%, Rate, Pay, Night Min)
- Totals row with monthly aggregates

**Error Response — Employee Not Found (404):**

```json
{
  "error": {
    "code": "EMPLOYEE_NOT_FOUND",
    "message": "Employee \"EMP-999\" not found"
  }
}
```

---

### 22. Export All Employees Payroll (Excel Download)

| Field | Value |
|-------|-------|
| **URL** | `/api/admin/payroll-report/export-all` |
| **Method** | `GET` |
| **Purpose** | Download a multi-sheet Excel workbook containing payroll reports for all active employees in a given month. |

**Parameters:**

| Parameter | Location | Required | Type | Description |
|-----------|----------|----------|------|-------------|
| `month` | Query | Yes | string | Month in `YYYY-MM` format |

**Example Request:**

```
GET /api/admin/payroll-report/export-all?month=2025-01
```

**Success Response (200 OK):**

Returns a binary `.xlsx` file download with headers:
- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Disposition: attachment; filename="payroll_all_employees_2025-01.xlsx"`

The workbook contains:
- **Summary sheet** — All employees' monthly totals (ID, Name, Work Days, Total Hours, Deficit, Tier Hours, Salary)
- **Per-employee sheets** — One sheet per employee with their daily breakdown

**Error Response — Missing Parameters (400):**

```json
{
  "error": {
    "code": "MISSING_PARAMS",
    "message": "month (YYYY-MM) is required"
  }
}
```

**Error Response — No Active Employees (404):**

```json
{
  "error": {
    "code": "NO_EMPLOYEES",
    "message": "No active employees found"
  }
}
```

---

## All Endpoints Summary

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | `GET` | `/api/employees` | List all employees |
| 2 | `POST` | `/api/employees` | Create a new employee |
| 3 | `GET` | `/api/employees/:id/options` | Get allowed companies/roles |
| 4 | `PUT` | `/api/employees/:id` | Update employee details |
| 5 | `DELETE` | `/api/employees/:id` | Delete employee (cascade) |
| 6 | `POST` | `/api/time-entries` | Create time entry (validated) |
| 7 | `GET` | `/api/time-entries?employee_id=...&work_date=...` | Get day's time entries |
| 8 | `PUT` | `/api/time-entries/:id` | Update time entry |
| 9 | `DELETE` | `/api/time-entries/:id` | Delete time entry |
| 10 | `GET` | `/api/payroll/daily?employee_id=...&work_date=...` | Daily payroll analysis |
| 11 | `POST` | `/api/admin/upload` | Upload Excel (multipart) |
| 12 | `GET` | `/api/admin/dashboard` | Dashboard KPIs |
| 13 | `GET` | `/api/admin/employees` | Employees with entry counts |
| 14 | `GET` | `/api/admin/time-entries?page=...&limit=...` | Paginated time entries |
| 15 | `GET` | `/api/admin/rates?employee_id=...` | List rates |
| 16 | `POST` | `/api/admin/rates` | Create rate |
| 17 | `PUT` | `/api/admin/rates` | Update rate |
| 18 | `DELETE` | `/api/admin/rates` | Delete rate |
| 19 | `GET` | `/api/admin/insights?...` | Filterable data insights |
| 20 | `GET` | `/api/admin/payroll-report?employee_id=...&month=...` | Monthly payroll (JSON) |
| 21 | `GET` | `/api/admin/payroll-report/export?employee_id=...&month=...` | Monthly payroll (Excel) |
| 22 | `GET` | `/api/admin/payroll-report/export-all?month=...` | All employees payroll (Excel) |

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
│  │  /api/*  →  REST API (22 routes)    │   │
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
│   │       ├── PayrollSummary.tsx  — Daily payroll display
│   │       ├── DayEntriesTable.tsx — Day entries table
│   │       ├── TimeInput.tsx       — Custom 24h time input
│   │       ├── AdminDashboard.tsx  — Dashboard KPIs
│   │       ├── AdminUpload.tsx     — Excel upload form
│   │       ├── AdminEmployeeManager.tsx — Employee + rate CRUD
│   │       ├── AdminTimeEntryManager.tsx — Time entry CRUD
│   │       └── AdminInsights.tsx   — Data insights + payroll report + export
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
6. **Consistent error handling** — All API errors use the same `{ error: { code, message } }` structure. Resource-not-found scenarios consistently return HTTP 404.
