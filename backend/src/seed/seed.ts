/**
 * seed.ts – reads EZTIME_DATA.xlsx and populates the Turso cloud database.
 * Uses the shared excelParser for column normalisation and value parsing.
 * Run via:  npm run db:seed
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { initSchema } from '../db/schema';
import { getDb } from '../db';
import { parseExcelBuffer } from '../utils/excelParser';

async function seed() {
  const EXCEL_PATH = path.join(__dirname, '../../../../EZTIME_DATA.xlsx');
  console.log(`Reading Excel: ${EXCEL_PATH}`);

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(EXCEL_PATH);
  } catch {
    console.error(`\nERROR: Cannot read "${EXCEL_PATH}"`);
    console.error('Place EZTIME_DATA.xlsx in the project root and re-run npm run db:seed.\n');
    process.exit(1);
  }

  const parsed = parseExcelBuffer(buffer);
  if (parsed.warnings.length > 0) {
    for (const w of parsed.warnings) console.warn(`  ${w}`);
  }

  await initSchema();
  const db = getDb();

  // Wipe existing data (order respects FK constraints)
  await db.batch([
    'DELETE FROM time_entries',
    'DELETE FROM rates',
    'DELETE FROM employee_allowed_roles',
    'DELETE FROM employee_allowed_companies',
    'DELETE FROM employees',
  ]);
  console.log('Cleared existing data.');

  // ── Employees ───────────────────────────────────────────────────────────
  console.log(`EmployeeData: ${parsed.employees.length} rows`);

  const empTx = await db.transaction('write');
  try {
    for (const emp of parsed.employees) {
      await empTx.execute({
        sql: 'INSERT OR REPLACE INTO employees (employee_id, full_name, status, standard_daily_quota) VALUES (?, ?, ?, ?)',
        args: [emp.employee_id, emp.full_name, emp.status, emp.standard_daily_quota],
      });
      for (const c of emp.allowed_companies) {
        await empTx.execute({
          sql: 'INSERT OR IGNORE INTO employee_allowed_companies (employee_id, company_name) VALUES (?, ?)',
          args: [emp.employee_id, c],
        });
      }
      for (const r of emp.allowed_roles) {
        await empTx.execute({
          sql: 'INSERT OR IGNORE INTO employee_allowed_roles (employee_id, role_name) VALUES (?, ?)',
          args: [emp.employee_id, r],
        });
      }
    }
    await empTx.commit();
  } catch (err) {
    await empTx.rollback();
    throw err;
  }
  console.log(`  Inserted ${parsed.employees.length} employees.`);

  // ── Rates ───────────────────────────────────────────────────────────────
  console.log(`rates: ${parsed.rates.length} rows`);

  const rateTx = await db.transaction('write');
  try {
    for (const r of parsed.rates) {
      await rateTx.execute({
        sql: 'INSERT OR REPLACE INTO rates (employee_id, company_name, role_name, hourly_rate) VALUES (?, ?, ?, ?)',
        args: [r.employee_id, r.company_name, r.role_name, r.hourly_rate],
      });
    }
    await rateTx.commit();
  } catch (err) {
    await rateTx.rollback();
    throw err;
  }
  console.log(`  Inserted ${parsed.rates.length} rates.`);

  // ── Time Entries ────────────────────────────────────────────────────────
  console.log(`times: ${parsed.timeEntries.length} rows`);

  let entryCount = 0;
  let skipped = 0;

  const entryTx = await db.transaction('write');
  try {
    for (const t of parsed.timeEntries) {
      const empExistsResult = await entryTx.execute({
        sql: 'SELECT 1 FROM employees WHERE employee_id = ?',
        args: [t.employee_id],
      });
      if (empExistsResult.rows.length === 0) { skipped++; continue; }

      const rateExistsResult = await entryTx.execute({
        sql: 'SELECT 1 FROM rates WHERE employee_id = ? AND company_name = ? AND role_name = ?',
        args: [t.employee_id, t.company_name, t.role_name],
      });
      if (rateExistsResult.rows.length === 0) { skipped++; continue; }

      await entryTx.execute({
        sql: `INSERT OR IGNORE INTO time_entries
                (id, work_date, employee_id, company_name, role_name, start_time, end_time, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [uuidv4(), t.work_date, t.employee_id, t.company_name, t.role_name, t.start_time, t.end_time, new Date().toISOString()],
      });
      entryCount++;
    }
    await entryTx.commit();
  } catch (err) {
    await entryTx.rollback();
    throw err;
  }
  console.log(`  Inserted ${entryCount} time entries (${skipped} skipped).`);

  console.log('\nSeed complete!');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
