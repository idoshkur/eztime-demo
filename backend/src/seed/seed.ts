/**
 * seed.ts – reads EZTIME_DATA.xlsx and populates the SQLite database.
 *
 * Sheets expected:
 *   EmployeeData – employees, allowed sites/roles, daily quota
 *   rates        – hourly rates per (employee, site, role)
 *   times        – initial time entries
 *
 * Column names are matched case-insensitively with common aliases.
 * Run via:  npm run db:seed
 */

import path from 'path';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { initSchema } from '../db/schema';
import { getDb } from '../db';

// ─── Column normalisation helpers ────────────────────────────────────────────

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]/g, '');
}

type Row = Record<string, unknown>;

function getField(row: Row, ...aliases: string[]): string {
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

// ─── Excel value parsers ─────────────────────────────────────────────────────

function parseDate(val: unknown): string {
  if (typeof val === 'number') {
    // Excel date serial
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

function parseTime(val: unknown): string {
  if (typeof val === 'number') {
    // Excel stores times as fractions of a day (0–1)
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

// Find the raw value of a column by any matching alias
function getRawField(row: Row, ...aliases: string[]): unknown {
  const normalised = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v]),
  );
  for (const alias of aliases) {
    const val = normalised[normalizeKey(alias)];
    if (val !== undefined && val !== null) return val;
  }
  return undefined;
}

// ─── Main seed ───────────────────────────────────────────────────────────────

async function seed() {
  // Support Excel file at project root (two levels up from backend/src/seed/)
  const EXCEL_PATH = path.join(__dirname, '../../../../EZTIME_DATA.xlsx');
  console.log(`Reading Excel: ${EXCEL_PATH}`);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(EXCEL_PATH);
  } catch {
    console.error(`\nERROR: Cannot read "${EXCEL_PATH}"`);
    console.error('Place EZTIME_DATA.xlsx in the project root and re-run npm run db:seed.\n');
    process.exit(1);
  }

  initSchema();
  const db = getDb();

  // Wipe existing data (order respects FK constraints)
  db.exec(`
    DELETE FROM time_entries;
    DELETE FROM rates;
    DELETE FROM employee_allowed_roles;
    DELETE FROM employee_allowed_sites;
    DELETE FROM employees;
  `);
  console.log('Cleared existing data.');

  // ── EmployeeData ──────────────────────────────────────────────────────────
  const empSheet = workbook.Sheets['EmployeeData'];
  if (!empSheet) {
    console.error('Sheet "EmployeeData" not found. Aborting.');
    process.exit(1);
  }
  const empRows = XLSX.utils.sheet_to_json(empSheet) as Row[];
  console.log(`EmployeeData: ${empRows.length} rows`);

  const insEmployee = db.prepare(
    'INSERT OR REPLACE INTO employees (employee_id, full_name, status, standard_daily_quota) VALUES (?, ?, ?, ?)',
  );
  const insSite = db.prepare(
    'INSERT OR IGNORE INTO employee_allowed_sites (employee_id, site_name) VALUES (?, ?)',
  );
  const insRole = db.prepare(
    'INSERT OR IGNORE INTO employee_allowed_roles (employee_id, role_name) VALUES (?, ?)',
  );

  let empCount = 0;
  db.transaction(() => {
    for (const row of empRows) {
      const empId   = getField(row, 'employee_id', 'employeeid', 'id', 'emp_id', 'empid');
      const name    = getField(row, 'full_name', 'fullname', 'name', 'employee_name', 'employeename');
      const status  = getField(row, 'status') || 'active';
      const quotaRaw = getField(row, 'standard_daily_quota', 'quota', 'dailyquota', 'daily_quota', 'hours', 'stdquota');
      const quota   = parseFloat(quotaRaw) || 9;

      if (!empId || !name) {
        console.warn('  Skipping employee row (missing id or name):', JSON.stringify(row));
        continue;
      }

      insEmployee.run(empId, name, status, quota);
      empCount++;

      // Allowed sites – may be comma-separated in one column
      const sitesRaw = getField(row, 'allowed_sites', 'allowedsites', 'sites', 'permitted_sites');
      if (sitesRaw) {
        for (const s of sitesRaw.split(',').map((x) => x.trim()).filter(Boolean)) {
          insSite.run(empId, s);
        }
      }

      // Allowed roles – may be comma-separated in one column
      const rolesRaw = getField(row, 'allowed_roles', 'allowedroles', 'roles', 'permitted_roles');
      if (rolesRaw) {
        for (const r of rolesRaw.split(',').map((x) => x.trim()).filter(Boolean)) {
          insRole.run(empId, r);
        }
      }
    }
  })();
  console.log(`  Inserted ${empCount} employees.`);

  // ── rates ─────────────────────────────────────────────────────────────────
  const ratesSheet = workbook.Sheets['rates'];
  if (!ratesSheet) {
    console.error('Sheet "rates" not found. Aborting.');
    process.exit(1);
  }
  const ratesRows = XLSX.utils.sheet_to_json(ratesSheet) as Row[];
  console.log(`rates: ${ratesRows.length} rows`);

  const insRate = db.prepare(
    'INSERT OR REPLACE INTO rates (employee_id, site_name, role_name, hourly_rate) VALUES (?, ?, ?, ?)',
  );

  let rateCount = 0;
  db.transaction(() => {
    for (const row of ratesRows) {
      const empId    = getField(row, 'employee_id', 'employeeid', 'id', 'emp_id', 'empid');
      const siteName = getField(row, 'site_name', 'sitename', 'site', 'location');
      const roleName = getField(row, 'role_name', 'rolename', 'role', 'position', 'job');
      const rateRaw  = getField(row, 'hourly_rate', 'hourlyrate', 'rate', 'pay_rate', 'payrate', 'salary');
      const rate     = parseFloat(rateRaw);

      if (!empId || !siteName || !roleName || isNaN(rate)) {
        console.warn('  Skipping rate row (invalid data):', JSON.stringify(row));
        continue;
      }
      insRate.run(empId, siteName, roleName, rate);
      rateCount++;
    }
  })();
  console.log(`  Inserted ${rateCount} rates.`);

  // ── times ─────────────────────────────────────────────────────────────────
  const timesSheet = workbook.Sheets['times'];
  if (!timesSheet) {
    console.error('Sheet "times" not found. Aborting.');
    process.exit(1);
  }
  // raw:true preserves Excel numeric types for dates/times
  const timesRows = XLSX.utils.sheet_to_json(timesSheet, { raw: true }) as Row[];
  console.log(`times: ${timesRows.length} rows`);

  const insEntry = db.prepare(
    `INSERT OR IGNORE INTO time_entries
       (id, work_date, employee_id, site_name, role_name, start_time, end_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const empExistsStmt = db.prepare('SELECT 1 FROM employees WHERE employee_id = ?');
  const rateExistsStmt = db.prepare(
    'SELECT 1 FROM rates WHERE employee_id = ? AND site_name = ? AND role_name = ?',
  );

  let entryCount = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const row of timesRows) {
      const empId    = getField(row, 'employee_id', 'employeeid', 'id', 'emp_id', 'empid');
      const siteName = getField(row, 'site_name', 'sitename', 'site', 'location');
      const roleName = getField(row, 'role_name', 'rolename', 'role', 'position', 'job');
      const rawDate  = getRawField(row, 'work_date', 'workdate', 'date', 'shift_date', 'shiftdate');
      const rawStart = getRawField(row, 'start_time', 'starttime', 'start', 'time_in', 'timein');
      const rawEnd   = getRawField(row, 'end_time', 'endtime', 'end', 'time_out', 'timeout');

      const workDate  = rawDate  !== undefined ? parseDate(rawDate)  : '';
      const startTime = rawStart !== undefined ? parseTime(rawStart) : '';
      const endTime   = rawEnd   !== undefined ? parseTime(rawEnd)   : '';

      if (!empId || !siteName || !roleName || !workDate || !startTime || !endTime) {
        console.warn('  Skipping time entry (missing data):', JSON.stringify(row));
        skipped++;
        continue;
      }

      if (!empExistsStmt.get(empId)) {
        console.warn(`  Skipping entry – employee "${empId}" not in DB`);
        skipped++;
        continue;
      }

      if (!rateExistsStmt.get(empId, siteName, roleName)) {
        console.warn(`  Skipping entry – no rate for (${empId}, ${siteName}, ${roleName})`);
        skipped++;
        continue;
      }

      insEntry.run(uuidv4(), workDate, empId, siteName, roleName, startTime, endTime, new Date().toISOString());
      entryCount++;
    }
  })();
  console.log(`  Inserted ${entryCount} time entries (${skipped} skipped).`);

  console.log('\nSeed complete!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
