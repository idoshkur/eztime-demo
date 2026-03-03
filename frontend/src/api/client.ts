const BASE = '/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Employee {
  employee_id: string;
  full_name: string;
  status: string;
  standard_daily_quota: number;
}

export interface EmployeeOptions {
  allowed_companies: string[];
  allowed_roles: string[];
}

export interface TimeEntry {
  id: string;
  work_date: string;
  employee_id: string;
  company_name: string;
  role_name: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface BreakdownItem {
  company_name: string;
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

// ─── Admin types ──────────────────────────────────────────────────────────────

export interface EntityResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface TimeEntryResult {
  inserted: number;
  duplicates: number;
  skipped: number;
}

export interface UploadSummary {
  employees: EntityResult;
  rates: EntityResult;
  timeEntries: TimeEntryResult;
  warnings: string[];
}

export interface DashboardData {
  employeeCount: number;
  totalEntries: number;
  totalHoursWorked: number;
  uniqueDays: number;
  entriesPerDay: { work_date: string; entry_count: number; employee_count: number }[];
  hoursPerEmployee: { employee_id: string; full_name: string; entry_count: number; days_worked: number; total_hours: number }[];
  entriesByCompany: { company_name: string; entry_count: number; employee_count: number }[];
}

export interface AdminEmployee extends Employee {
  entry_count: number;
}

export interface AdminTimeEntry extends TimeEntry {
  employee_name: string;
}

export interface PaginatedTimeEntries {
  entries: AdminTimeEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface DeleteEmployeeResult {
  success: true;
  deleted: { time_entries: number; rates: number; allowed_companies: number; allowed_roles: number };
}

// ─── Rate & Create types ─────────────────────────────────────────────────────

export interface Rate {
  employee_id: string;
  company_name: string;
  role_name: string;
  hourly_rate: number;
}

export interface CreateEmployeeBody {
  employee_id: string;
  full_name: string;
  status: string;
  standard_daily_quota: number;
  allowed_companies: string[];
  allowed_roles: string[];
}

// ─── Insights types ──────────────────────────────────────────────────────────

export interface InsightsFilters {
  employee_id?: string;
  company_name?: string;
  role_name?: string;
  date_from?: string;
  date_to?: string;
}

export interface InsightsSummary {
  totalEntries: number;
  totalHours: number;
  uniqueDays: number;
  uniqueEmployees: number;
  uniqueCompanies: number;
  avgHoursPerDay: number;
}

export interface InsightsByEmployee {
  employee_id: string;
  full_name: string;
  total_hours: number;
  entry_count: number;
  days_worked: number;
}

export interface InsightsByCompany {
  company_name: string;
  total_hours: number;
  entry_count: number;
  employee_count: number;
}

export interface InsightsByRole {
  role_name: string;
  total_hours: number;
  entry_count: number;
}

export interface InsightsByDate {
  work_date: string;
  total_hours: number;
  entry_count: number;
}

export interface InsightsByCompanyRole {
  company_name: string;
  role_name: string;
  total_hours: number;
  entry_count: number;
}

export interface InsightsData {
  filters: InsightsFilters;
  availableCompanies: string[];
  availableRoles: string[];
  summary: InsightsSummary;
  byEmployee: InsightsByEmployee[];
  byCompany: InsightsByCompany[];
  byRole: InsightsByRole[];
  byDate: InsightsByDate[];
  byCompanyRole: InsightsByCompanyRole[];
}

// ─── Payroll report types ────────────────────────────────────────────────────

export interface PayrollDay {
  work_date: string;
  total_hours: number;
  standard_daily_quota: number;
  daily_deficit_hours: number;
  hours_100: number;
  hours_125: number;
  hours_150: number;
  applied_hourly_rate: number;
  gross_daily_salary: number;
  night_minutes: number;
}

export interface PayrollMonthly {
  total_hours: number;
  total_deficit: number;
  total_salary: number;
  total_hours_100: number;
  total_hours_125: number;
  total_hours_150: number;
  work_days: number;
}

export interface PayrollReport {
  employee: { employee_id: string; full_name: string; status: string; standard_daily_quota: number };
  month: string;
  days: PayrollDay[];
  monthly: PayrollMonthly;
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

  createEmployee: (body: CreateEmployeeBody) =>
    request<Employee>('/employees', { method: 'POST', body: JSON.stringify(body) }),

  getEmployeeOptions: (employeeId: string) =>
    request<EmployeeOptions>(`/employees/${employeeId}/options`),

  createTimeEntry: (body: {
    employee_id: string;
    work_date: string;
    company_name: string;
    role_name: string;
    start_time: string;
    end_time: string;
  }) =>
    request<TimeEntry>('/time-entries', { method: 'POST', body: JSON.stringify(body) }),

  getTimeEntries: (employeeId: string, workDate: string) =>
    request<TimeEntry[]>(`/time-entries?employee_id=${employeeId}&work_date=${workDate}`),

  getDailyPayroll: (employeeId: string, workDate: string) =>
    request<DailyPayroll>(`/payroll/daily?employee_id=${employeeId}&work_date=${workDate}`),

  // Admin endpoints
  uploadExcel: async (file: File): Promise<{ success: boolean; summary: UploadSummary }> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${BASE}/admin/upload`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw data as ApiError;
    return data;
  },

  getDashboard: () =>
    request<DashboardData>('/admin/dashboard'),

  // Admin management
  getAdminEmployees: () =>
    request<AdminEmployee[]>('/admin/employees'),

  getAdminTimeEntries: (params?: { employee_id?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.employee_id) qs.set('employee_id', params.employee_id);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request<PaginatedTimeEntries>(`/admin/time-entries${query ? '?' + query : ''}`);
  },

  updateTimeEntry: (id: string, body: Partial<Pick<TimeEntry, 'work_date' | 'company_name' | 'role_name' | 'start_time' | 'end_time'>>) =>
    request<TimeEntry>(`/time-entries/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteTimeEntry: (id: string) =>
    request<{ success: true }>(`/time-entries/${id}`, { method: 'DELETE' }),

  updateEmployee: (id: string, body: Partial<Pick<Employee, 'full_name' | 'status' | 'standard_daily_quota'>>) =>
    request<Employee>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  deleteEmployee: (id: string) =>
    request<DeleteEmployeeResult>(`/employees/${id}`, { method: 'DELETE' }),

  // Rates
  getRates: (employeeId?: string) => {
    const qs = employeeId ? `?employee_id=${employeeId}` : '';
    return request<Rate[]>(`/admin/rates${qs}`);
  },

  createRate: (body: Rate) =>
    request<Rate>('/admin/rates', { method: 'POST', body: JSON.stringify(body) }),

  updateRate: (body: Rate) =>
    request<Rate>('/admin/rates', { method: 'PUT', body: JSON.stringify(body) }),

  deleteRate: (body: { employee_id: string; company_name: string; role_name: string }) =>
    request<{ success: true }>('/admin/rates', { method: 'DELETE', body: JSON.stringify(body) }),

  // Insights
  getInsights: (filters?: InsightsFilters) => {
    const qs = new URLSearchParams();
    if (filters?.employee_id) qs.set('employee_id', filters.employee_id);
    if (filters?.company_name) qs.set('company_name', filters.company_name);
    if (filters?.role_name) qs.set('role_name', filters.role_name);
    if (filters?.date_from) qs.set('date_from', filters.date_from);
    if (filters?.date_to) qs.set('date_to', filters.date_to);
    const query = qs.toString();
    return request<InsightsData>(`/admin/insights${query ? '?' + query : ''}`);
  },

  // Payroll report
  getPayrollReport: (employeeId: string, month: string) =>
    request<PayrollReport>(`/admin/payroll-report?employee_id=${employeeId}&month=${month}`),

  downloadPayrollExcel: async (employeeId: string, month: string) => {
    const res = await fetch(`${BASE}/admin/payroll-report/export?employee_id=${employeeId}&month=${month}`);
    if (!res.ok) {
      const data = await res.json();
      throw data as ApiError;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_${employeeId}_${month}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
