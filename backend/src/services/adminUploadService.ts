import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { ParseResult } from '../utils/excelParser';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/** Check if a new entry overlaps with existing entries in the DB (within a transaction). */
async function hasOverlap(
  tx: { execute(stmt: { sql: string; args: (string | number)[] }): Promise<{ rows: unknown[] }> },
  employee_id: string,
  work_date: string,
  start_time: string,
  end_time: string,
): Promise<boolean> {
  const newStart = timeToMinutes(start_time);
  let newEnd = timeToMinutes(end_time);
  if (newEnd <= newStart) newEnd += 24 * 60;

  // Same-day overlap
  const sameDayResult = await tx.execute({
    sql: 'SELECT start_time, end_time FROM time_entries WHERE employee_id = ? AND work_date = ?',
    args: [employee_id, work_date],
  });
  for (const row of sameDayResult.rows) {
    const ex = row as unknown as { start_time: string; end_time: string };
    const exStart = timeToMinutes(ex.start_time);
    let exEnd = timeToMinutes(ex.end_time);
    if (exEnd <= exStart) exEnd += 24 * 60;
    if (newStart < exEnd && exStart < newEnd) return true;
  }

  // Previous day's overnight entries spilling into today
  const prevDate = shiftDate(work_date, -1);
  const prevResult = await tx.execute({
    sql: 'SELECT start_time, end_time FROM time_entries WHERE employee_id = ? AND work_date = ?',
    args: [employee_id, prevDate],
  });
  for (const row of prevResult.rows) {
    const prev = row as unknown as { start_time: string; end_time: string };
    const pStart = timeToMinutes(prev.start_time);
    const pEnd = timeToMinutes(prev.end_time);
    if (pEnd >= pStart) continue;
    if (newStart < pEnd) return true;
  }

  // If new entry crosses midnight, check next day
  if (timeToMinutes(end_time) <= timeToMinutes(start_time)) {
    const nextDate = shiftDate(work_date, 1);
    const nextResult = await tx.execute({
      sql: 'SELECT start_time, end_time FROM time_entries WHERE employee_id = ? AND work_date = ?',
      args: [employee_id, nextDate],
    });
    const spillEnd = timeToMinutes(end_time);
    for (const row of nextResult.rows) {
      const next = row as unknown as { start_time: string; end_time: string };
      if (timeToMinutes(next.start_time) < spillEnd) return true;
    }
  }

  return false;
}

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

      // Overlap check (same-day + cross-day)
      if (await hasOverlap(tx as Parameters<typeof hasOverlap>[0], t.employee_id, t.work_date, t.start_time, t.end_time)) {
        warnings.push(`Entry skipped – overlap: ${t.employee_id} on ${t.work_date} (${t.start_time}–${t.end_time})`);
        entryResult.skipped++;
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
