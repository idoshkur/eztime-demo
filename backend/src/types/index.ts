export interface Employee {
  employee_id: string;
  full_name: string;
  status: string;
  standard_daily_quota: number;
}

export interface Rate {
  employee_id: string;
  company_name: string;
  role_name: string;
  hourly_rate: number;
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
  warnings?: string[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
