import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { ParseResult } from '../utils/excelParser';

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

export interface UploadResult {
  employees: EntityResult;
  rates: EntityResult;
  timeEntries: TimeEntryResult;
  warnings: string[];
}

export async function upsertExcelData(parsed: ParseResult): Promise<UploadResult> {
  const db = getDb();
  const warnings = [...parsed.warnings];

  const empResult: EntityResult = { inserted: 0, updated: 0, skipped: 0 };
  const rateResult: EntityResult = { inserted: 0, updated: 0, skipped: 0 };
  const entryResult: TimeEntryResult = { inserted: 0, duplicates: 0, skipped: 0 };

  const tx = await db.transaction('write');
  try {
    // ── Employees (upsert) ──────────────────────────────────────────────
    for (const emp of parsed.employees) {
      const existsResult = await tx.execute({
        sql: 'SELECT 1 FROM employees WHERE employee_id = ?',
        args: [emp.employee_id],
      });
      const existed = existsResult.rows.length > 0;

      await tx.execute({
        sql: 'INSERT OR REPLACE INTO employees (employee_id, full_name, status, standard_daily_quota) VALUES (?, ?, ?, ?)',
        args: [emp.employee_id, emp.full_name, emp.status, emp.standard_daily_quota],
      });
      if (existed) empResult.updated++;
      else empResult.inserted++;

      for (const c of emp.allowed_companies) {
        await tx.execute({
          sql: 'INSERT OR IGNORE INTO employee_allowed_companies (employee_id, company_name) VALUES (?, ?)',
          args: [emp.employee_id, c],
        });
      }
      for (const r of emp.allowed_roles) {
        await tx.execute({
          sql: 'INSERT OR IGNORE INTO employee_allowed_roles (employee_id, role_name) VALUES (?, ?)',
          args: [emp.employee_id, r],
        });
      }
    }

    // ── Rates (upsert) ──────────────────────────────────────────────────
    for (const r of parsed.rates) {
      const empExistsResult = await tx.execute({
        sql: 'SELECT 1 FROM employees WHERE employee_id = ?',
        args: [r.employee_id],
      });
      if (empExistsResult.rows.length === 0) {
        warnings.push(`Rate skipped – employee "${r.employee_id}" not found`);
        rateResult.skipped++;
        continue;
      }

      const rateExistsResult = await tx.execute({
        sql: 'SELECT 1 FROM rates WHERE employee_id = ? AND company_name = ? AND role_name = ?',
        args: [r.employee_id, r.company_name, r.role_name],
      });
      const existed = rateExistsResult.rows.length > 0;

      await tx.execute({
        sql: 'INSERT OR REPLACE INTO rates (employee_id, company_name, role_name, hourly_rate) VALUES (?, ?, ?, ?)',
        args: [r.employee_id, r.company_name, r.role_name, r.hourly_rate],
      });
      if (existed) rateResult.updated++;
      else rateResult.inserted++;
    }

    // ── Time Entries (insert with dedup) ─────────────────────────────────
    for (const t of parsed.timeEntries) {
      const empExistsResult = await tx.execute({
        sql: 'SELECT 1 FROM employees WHERE employee_id = ?',
        args: [t.employee_id],
      });
      if (empExistsResult.rows.length === 0) {
        warnings.push(`Entry skipped – employee "${t.employee_id}" not found`);
        entryResult.skipped++;
        continue;
      }

      const rateExistsResult = await tx.execute({
        sql: 'SELECT 1 FROM rates WHERE employee_id = ? AND company_name = ? AND role_name = ?',
        args: [t.employee_id, t.company_name, t.role_name],
      });
      if (rateExistsResult.rows.length === 0) {
        warnings.push(`Entry skipped – no rate for (${t.employee_id}, ${t.company_name}, ${t.role_name})`);
        entryResult.skipped++;
        continue;
      }

      const dupResult = await tx.execute({
        sql: `SELECT 1 FROM time_entries
              WHERE employee_id = ? AND work_date = ? AND company_name = ? AND role_name = ? AND start_time = ? AND end_time = ?`,
        args: [t.employee_id, t.work_date, t.company_name, t.role_name, t.start_time, t.end_time],
      });
      if (dupResult.rows.length > 0) {
        entryResult.duplicates++;
        continue;
      }

      await tx.execute({
        sql: `INSERT INTO time_entries (id, work_date, employee_id, company_name, role_name, start_time, end_time, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [uuidv4(), t.work_date, t.employee_id, t.company_name, t.role_name, t.start_time, t.end_time, new Date().toISOString()],
      });
      entryResult.inserted++;
    }

    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return {
    employees: empResult,
    rates: rateResult,
    timeEntries: entryResult,
    warnings,
  };
}
