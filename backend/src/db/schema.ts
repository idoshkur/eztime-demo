import { getDb } from './index';

export async function initSchema(): Promise<void> {
  const db = getDb();

  await db.batch([
    'PRAGMA foreign_keys = ON',
    `CREATE TABLE IF NOT EXISTS employees (
      employee_id            TEXT PRIMARY KEY,
      full_name              TEXT NOT NULL,
      status                 TEXT NOT NULL,
      standard_daily_quota   REAL NOT NULL DEFAULT 9
    )`,
    `CREATE TABLE IF NOT EXISTS employee_allowed_companies (
      employee_id   TEXT NOT NULL,
      company_name  TEXT NOT NULL,
      PRIMARY KEY (employee_id, company_name),
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS employee_allowed_roles (
      employee_id  TEXT NOT NULL,
      role_name    TEXT NOT NULL,
      PRIMARY KEY (employee_id, role_name),
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS rates (
      employee_id   TEXT NOT NULL,
      company_name  TEXT NOT NULL,
      role_name     TEXT NOT NULL,
      hourly_rate   REAL NOT NULL,
      PRIMARY KEY (employee_id, company_name, role_name),
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    )`,
    `CREATE TABLE IF NOT EXISTS time_entries (
      id            TEXT PRIMARY KEY,
      work_date     TEXT NOT NULL,
      employee_id   TEXT NOT NULL,
      company_name  TEXT NOT NULL,
      role_name     TEXT NOT NULL,
      start_time    TEXT NOT NULL,
      end_time      TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_time_entries_emp_date
      ON time_entries (employee_id, work_date)`,
  ]);

  console.log('Database schema initialized.');
}

// Allow running directly: npm run db:init
if (require.main === module) {
  initSchema().catch((err) => {
    console.error('Schema init failed:', err);
    process.exit(1);
  });
}
