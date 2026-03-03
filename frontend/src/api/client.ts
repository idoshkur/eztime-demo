const BASE = '/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Employee {
  employee_id: string;
  full_name: string;
  status: string;
  standard_daily_quota: number;
}

export interface EmployeeOptions {
  allowed_sites: string[];
  allowed_roles: string[];
}

export interface TimeEntry {
  id: string;
  work_date: string;
  employee_id: string;
  site_name: string;
  role_name: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface BreakdownItem {
  site_name: string;
  role_name: string;
  minutes: number;
  hours: number;
  entry_count: number;
}

export interface DailyPayroll {
  employee_id: string;
  work_date: string;
  standard_daily_quota: number;
  total_worked_minutes: number;
  total_hours: number;
  night_minutes: number;
  overtime_threshold: number;
  hours_100: number;
  hours_125: number;
  hours_150: number;
  applied_hourly_rate: number;
  gross_daily_salary: number;
  daily_deficit_hours: number;
  entries: TimeEntry[];
  breakdown_by_site_role: BreakdownItem[];
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// ─── Fetch wrapper ────────────────────────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw data as ApiError;
  return data as T;
}

// ─── API client ───────────────────────────────────────────────────────────────

export const api = {
  getEmployees: () =>
    request<Employee[]>('/employees'),

  getEmployeeOptions: (employeeId: string) =>
    request<EmployeeOptions>(`/employees/${employeeId}/options`),

  createTimeEntry: (body: {
    employee_id: string;
    work_date: string;
    site_name: string;
    role_name: string;
    start_time: string;
    end_time: string;
  }) =>
    request<TimeEntry>('/time-entries', { method: 'POST', body: JSON.stringify(body) }),

  getTimeEntries: (employeeId: string, workDate: string) =>
    request<TimeEntry[]>(`/time-entries?employee_id=${employeeId}&work_date=${workDate}`),

  getDailyPayroll: (employeeId: string, workDate: string) =>
    request<DailyPayroll>(`/payroll/daily?employee_id=${employeeId}&work_date=${workDate}`),
};
