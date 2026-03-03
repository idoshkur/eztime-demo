/**
 * Shared Excel parsing utilities.
 * Extracted from seed.ts so both the CLI seed and the admin upload API
 * can reuse the same column-normalisation and value-parsing logic.
 */

import * as XLSX from 'xlsx';

// ─── Column normalisation ────────────────────────────────────────────────────

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]/g, '');
}

export type Row = Record<string, unknown>;

export function getField(row: Row, ...aliases: string[]): string {
  const normalised = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v]),
  );
  for (const alias of aliases) {
    const val = normalised[normalizeKey(alias)];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

export function getRawField(row: Row, ...aliases: string[]): unknown {
  const normalised = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v]),
  );
  for (const alias of aliases) {
    const val = normalised[normalizeKey(alias)];
    if (val !== undefined && val !== null) return val;
  }
  return undefined;
}

// ─── Value parsers ───────────────────────────────────────────────────────────

export function parseDate(val: unknown): string {
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return String(val ?? '');
}

export function parseTime(val: unknown): string {
  if (typeof val === 'number') {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    const match = s.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return `${String(parseInt(match[1])).padStart(2, '0')}:${match[2]}`;
    }
  }
  return String(val ?? '');
}

// ─── Parsed data types ──────────────────────────────────────────────────────

export interface ParsedEmployee {
  employee_id: string;
  full_name: string;
  status: string;
  standard_daily_quota: number;
  allowed_companies: string[];
  allowed_roles: string[];
}

export interface ParsedRate {
  employee_id: string;
  company_name: string;
  role_name: string;
  hourly_rate: number;
}

export interface ParsedTimeEntry {
  work_date: string;
  employee_id: string;
  company_name: string;
  role_name: string;
  start_time: string;
  end_time: string;
}

export interface ParseResult {
  employees: ParsedEmployee[];
  rates: ParsedRate[];
  timeEntries: ParsedTimeEntry[];
  warnings: string[];
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseExcelBuffer(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const warnings: string[] = [];
  const employees: ParsedEmployee[] = [];
  const rates: ParsedRate[] = [];
  const timeEntries: ParsedTimeEntry[] = [];

  // ── EmployeeData ────────────────────────────────────────────────────────
  const empSheet = workbook.Sheets['EmployeeData'];
  if (!empSheet) throw new Error('Sheet "EmployeeData" not found in the uploaded file.');
  const empRows = XLSX.utils.sheet_to_json(empSheet) as Row[];

  for (const row of empRows) {
    const empId = getField(row, 'employee_id', 'employeeid', 'id', 'emp_id', 'empid');
    const name  = getField(row, 'full_name', 'fullname', 'name', 'employee_name', 'employeename');
    const status = getField(row, 'status') || 'active';
    const quotaRaw = getField(row,
      'daily_standard_hours', 'dailystandardhours',
      'standard_daily_quota', 'standarddailyquota',
      'quota', 'dailyquota', 'daily_quota', 'hours', 'stdquota',
    );
    const quota = parseFloat(quotaRaw) || 9;

    if (!empId || !name) {
      warnings.push(`Skipped employee row (missing id or name): ${JSON.stringify(row)}`);
      continue;
    }

    const companiesRaw = getField(row,
      'allowed_companies_csv', 'allowedcompaniescsv',
      'allowed_companies', 'allowedcompanies', 'companies',
      'allowed_sites', 'allowedsites', 'sites', 'permitted_sites',
    );
    const rolesRaw = getField(row,
      'allowed_roles_csv', 'allowedrolescsv',
      'allowed_roles', 'allowedroles', 'roles', 'permitted_roles',
    );

    employees.push({
      employee_id: empId,
      full_name: name,
      status,
      standard_daily_quota: quota,
      allowed_companies: companiesRaw ? companiesRaw.split(',').map((x) => x.trim()).filter(Boolean) : [],
      allowed_roles: rolesRaw ? rolesRaw.split(',').map((x) => x.trim()).filter(Boolean) : [],
    });
  }

  // ── rates ───────────────────────────────────────────────────────────────
  const ratesSheet = workbook.Sheets['rates'];
  if (!ratesSheet) throw new Error('Sheet "rates" not found in the uploaded file.');
  const ratesRows = XLSX.utils.sheet_to_json(ratesSheet) as Row[];

  for (const row of ratesRows) {
    const empId       = getField(row, 'employee_id', 'employeeid', 'id', 'emp_id', 'empid');
    const companyName = getField(row, 'company_name', 'companyname', 'company', 'site_name', 'sitename', 'site', 'location');
    const roleName    = getField(row, 'role_name', 'rolename', 'role', 'position', 'job');
    const rateRaw     = getField(row, 'hourly_rate', 'hourlyrate', 'rate', 'pay_rate', 'payrate', 'salary');
    const rate        = parseFloat(rateRaw);

    if (!empId || !companyName || !roleName || isNaN(rate)) {
      warnings.push(`Skipped rate row (invalid data): ${JSON.stringify(row)}`);
      continue;
    }
    rates.push({ employee_id: empId, company_name: companyName, role_name: roleName, hourly_rate: rate });
  }

  // ── times ───────────────────────────────────────────────────────────────
  const timesSheet = workbook.Sheets['times'];
  if (!timesSheet) throw new Error('Sheet "times" not found in the uploaded file.');
  const timesRows = XLSX.utils.sheet_to_json(timesSheet, { raw: true }) as Row[];

  for (const row of timesRows) {
    const empId       = getField(row, 'employee_id', 'employeeid', 'id', 'emp_id', 'empid');
    const companyName = getField(row, 'company_name', 'companyname', 'company', 'site_name', 'sitename', 'site', 'location');
    const roleName    = getField(row, 'role_name', 'rolename', 'role', 'position', 'job');
    const rawDate     = getRawField(row, 'work_date', 'workdate', 'date', 'shift_date', 'shiftdate');
    const rawStart    = getRawField(row, 'start_time', 'starttime', 'start', 'time_in', 'timein');
    const rawEnd      = getRawField(row, 'end_time', 'endtime', 'end', 'time_out', 'timeout');

    const workDate  = rawDate  !== undefined ? parseDate(rawDate)  : '';
    const startTime = rawStart !== undefined ? parseTime(rawStart) : '';
    const endTime   = rawEnd   !== undefined ? parseTime(rawEnd)   : '';

    if (!empId || !companyName || !roleName || !workDate || !startTime || !endTime) {
      warnings.push(`Skipped time entry (missing data): ${JSON.stringify(row)}`);
      continue;
    }
    timeEntries.push({
      employee_id: empId,
      company_name: companyName,
      role_name: roleName,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
    });
  }

  return { employees, rates, timeEntries, warnings };
}
