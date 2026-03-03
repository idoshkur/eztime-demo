import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { getDb } from '../db';
import { parseExcelBuffer } from '../utils/excelParser';
import { upsertExcelData } from '../services/adminUploadService';
import { calculateDailyPayroll } from '../services/payrollService';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.endsWith('.xlsx')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx files are accepted'));
    }
  },
});

// ─── POST /api/admin/upload ──────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({
      error: { code: 'NO_FILE', message: 'No file uploaded. Send a .xlsx file as "file" field.' },
    });
  }

  try {
    const parsed = parseExcelBuffer(req.file.buffer);
    const result = await upsertExcelData(parsed);
    res.json({ success: true, summary: result });
  } catch (err) {
    res.status(400).json({
      error: { code: 'PARSE_ERROR', message: (err as Error).message },
    });
  }
});

// ─── GET /api/admin/employees ─────────────────────────────────────────────────

router.get('/employees', async (_req: Request, res: Response) => {
  const db = getDb();
  const result = await db.execute(`
    SELECT e.employee_id, e.full_name, e.status, e.standard_daily_quota,
           COUNT(t.id) as entry_count
    FROM employees e
    LEFT JOIN time_entries t ON e.employee_id = t.employee_id
    GROUP BY e.employee_id
    ORDER BY e.full_name
  `);
  res.json(result.rows);
});

// ─── GET /api/admin/time-entries ──────────────────────────────────────────────

router.get('/time-entries', async (req: Request, res: Response) => {
  const db = getDb();
  const employee_id = req.query.employee_id as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  let whereClause = '';
  const params: unknown[] = [];

  if (employee_id) {
    whereClause = 'WHERE t.employee_id = ?';
    params.push(employee_id);
  }

  const countResult = await db.execute({
    sql: `SELECT COUNT(*) as count FROM time_entries t ${whereClause}`,
    args: params as Array<string | number>,
  });
  const total = (countResult.rows[0] as unknown as { count: number }).count;

  const entriesResult = await db.execute({
    sql: `
      SELECT t.*, e.full_name as employee_name
      FROM time_entries t
      LEFT JOIN employees e ON t.employee_id = e.employee_id
      ${whereClause}
      ORDER BY t.work_date DESC, t.start_time DESC
      LIMIT ? OFFSET ?
    `,
    args: [...(params as Array<string | number>), limit, offset],
  });

  res.json({ entries: entriesResult.rows, total, page, limit });
});

// ─── GET /api/admin/dashboard ────────────────────────────────────────────────

router.get('/dashboard', async (_req: Request, res: Response) => {
  const db = getDb();

  const empCountResult = await db.execute("SELECT COUNT(*) as count FROM employees WHERE status = 'active'");
  const employeeCount = (empCountResult.rows[0] as unknown as { count: number }).count;

  const totalEntriesResult = await db.execute('SELECT COUNT(*) as count FROM time_entries');
  const totalEntries = (totalEntriesResult.rows[0] as unknown as { count: number }).count;

  const totalHoursResult = await db.execute(`
    SELECT COALESCE(SUM(
      CASE
        WHEN (CAST(substr(end_time,1,2) AS INT)*60 + CAST(substr(end_time,4,2) AS INT))
           > (CAST(substr(start_time,1,2) AS INT)*60 + CAST(substr(start_time,4,2) AS INT))
        THEN (CAST(substr(end_time,1,2) AS INT)*60 + CAST(substr(end_time,4,2) AS INT))
           - (CAST(substr(start_time,1,2) AS INT)*60 + CAST(substr(start_time,4,2) AS INT))
        ELSE (CAST(substr(end_time,1,2) AS INT)*60 + CAST(substr(end_time,4,2) AS INT))
           - (CAST(substr(start_time,1,2) AS INT)*60 + CAST(substr(start_time,4,2) AS INT))
           + 1440
      END
    ), 0) / 60.0 as total_hours FROM time_entries
  `);
  const totalHoursWorked = (totalHoursResult.rows[0] as unknown as { total_hours: number }).total_hours;

  const uniqueDaysResult = await db.execute('SELECT COUNT(DISTINCT work_date) as count FROM time_entries');
  const uniqueDays = (uniqueDaysResult.rows[0] as unknown as { count: number }).count;

  const entriesPerDayResult = await db.execute(`
    SELECT work_date, COUNT(*) as entry_count, COUNT(DISTINCT employee_id) as employee_count
    FROM time_entries
    GROUP BY work_date
    ORDER BY work_date DESC
    LIMIT 30
  `);

  const hoursPerEmployeeResult = await db.execute(`
    SELECT
      t.employee_id,
      e.full_name,
      COUNT(*) as entry_count,
      COUNT(DISTINCT t.work_date) as days_worked,
      COALESCE(SUM(
        CASE
          WHEN (CAST(substr(t.end_time,1,2) AS INT)*60 + CAST(substr(t.end_time,4,2) AS INT))
             > (CAST(substr(t.start_time,1,2) AS INT)*60 + CAST(substr(t.start_time,4,2) AS INT))
          THEN (CAST(substr(t.end_time,1,2) AS INT)*60 + CAST(substr(t.end_time,4,2) AS INT))
             - (CAST(substr(t.start_time,1,2) AS INT)*60 + CAST(substr(t.start_time,4,2) AS INT))
          ELSE (CAST(substr(t.end_time,1,2) AS INT)*60 + CAST(substr(t.end_time,4,2) AS INT))
             - (CAST(substr(t.start_time,1,2) AS INT)*60 + CAST(substr(t.start_time,4,2) AS INT))
             + 1440
        END
      ), 0) / 60.0 as total_hours
    FROM time_entries t
    JOIN employees e ON t.employee_id = e.employee_id
    GROUP BY t.employee_id
    ORDER BY total_hours DESC
  `);

  const entriesByCompanyResult = await db.execute(`
    SELECT company_name, COUNT(*) as entry_count, COUNT(DISTINCT employee_id) as employee_count
    FROM time_entries
    GROUP BY company_name
    ORDER BY entry_count DESC
  `);

  const totalDeficitResult = await db.execute(`
    SELECT COALESCE(SUM(
      CASE
        WHEN e.standard_daily_quota > daily.daily_hours THEN e.standard_daily_quota - daily.daily_hours
        ELSE 0
      END
    ), 0) as total_deficit
    FROM (
      SELECT
        t.employee_id,
        t.work_date,
        SUM(
          CASE
            WHEN (CAST(substr(t.end_time,1,2) AS INT)*60 + CAST(substr(t.end_time,4,2) AS INT))
               > (CAST(substr(t.start_time,1,2) AS INT)*60 + CAST(substr(t.start_time,4,2) AS INT))
            THEN (CAST(substr(t.end_time,1,2) AS INT)*60 + CAST(substr(t.end_time,4,2) AS INT))
               - (CAST(substr(t.start_time,1,2) AS INT)*60 + CAST(substr(t.start_time,4,2) AS INT))
            ELSE (CAST(substr(t.end_time,1,2) AS INT)*60 + CAST(substr(t.end_time,4,2) AS INT))
               - (CAST(substr(t.start_time,1,2) AS INT)*60 + CAST(substr(t.start_time,4,2) AS INT))
               + 1440
          END
        ) / 60.0 as daily_hours
      FROM time_entries t
      GROUP BY t.employee_id, t.work_date
    ) daily
    JOIN employees e ON daily.employee_id = e.employee_id
  `);
  const totalDeficitHours = (totalDeficitResult.rows[0] as unknown as { total_deficit: number }).total_deficit;

  // Per-employee deficit for the hours-by-employee table
  const empDeficitResult = await db.execute(`
    SELECT
      daily.employee_id,
      COALESCE(SUM(
        CASE WHEN e.standard_daily_quota > daily.daily_hours
        THEN e.standard_daily_quota - daily.daily_hours ELSE 0 END
      ), 0) as deficit
    FROM (
      SELECT employee_id, work_date, SUM(${HOURS_SQL}) / 60.0 as daily_hours
      FROM time_entries
      GROUP BY employee_id, work_date
    ) daily
    JOIN employees e ON daily.employee_id = e.employee_id
    GROUP BY daily.employee_id
  `);
  const deficitMap = new Map<string, number>();
  for (const row of empDeficitResult.rows) {
    const r = row as unknown as { employee_id: string; deficit: number };
    deficitMap.set(r.employee_id, Math.round(Number(r.deficit) * 100) / 100);
  }
  const hoursPerEmployee = hoursPerEmployeeResult.rows.map((row) => {
    const r = row as unknown as { employee_id: string };
    return { ...row, deficit: deficitMap.get(r.employee_id) || 0 };
  });

  res.json({
    employeeCount,
    totalEntries,
    totalHoursWorked: Math.round((totalHoursWorked as number) * 100) / 100,
    totalDeficitHours: Math.round((totalDeficitHours as number) * 100) / 100,
    uniqueDays,
    entriesPerDay: entriesPerDayResult.rows,
    hoursPerEmployee,
    entriesByCompany: entriesByCompanyResult.rows,
  });
});

// ─── Rate Management ─────────────────────────────────────────────────────────

router.get('/rates', async (req: Request, res: Response) => {
  const db = getDb();
  const employee_id = req.query.employee_id as string | undefined;

  if (employee_id) {
    const result = await db.execute({
      sql: 'SELECT * FROM rates WHERE employee_id = ? ORDER BY company_name, role_name',
      args: [employee_id],
    });
    return res.json(result.rows);
  }

  const result = await db.execute('SELECT * FROM rates ORDER BY employee_id, company_name, role_name');
  res.json(result.rows);
});

router.post('/rates', async (req: Request, res: Response) => {
  const { employee_id, company_name, role_name, hourly_rate } = req.body as Record<string, unknown>;

  if (!employee_id || !company_name || !role_name || hourly_rate === undefined) {
    return res.status(400).json({
      error: { code: 'MISSING_FIELDS', message: 'employee_id, company_name, role_name, and hourly_rate are required' },
    });
  }
  if (typeof hourly_rate !== 'number' || hourly_rate <= 0) {
    return res.status(400).json({
      error: { code: 'INVALID_RATE', message: 'hourly_rate must be a positive number' },
    });
  }

  const db = getDb();
  const existingResult = await db.execute({
    sql: 'SELECT 1 FROM rates WHERE employee_id = ? AND company_name = ? AND role_name = ?',
    args: [employee_id as string, company_name as string, role_name as string],
  });
  if (existingResult.rows.length > 0) {
    return res.status(409).json({
      error: { code: 'RATE_EXISTS', message: 'Rate already exists for this employee/company/role combination' },
    });
  }

  await db.execute({
    sql: 'INSERT INTO rates (employee_id, company_name, role_name, hourly_rate) VALUES (?, ?, ?, ?)',
    args: [employee_id as string, company_name as string, role_name as string, hourly_rate],
  });

  res.status(201).json({ employee_id, company_name, role_name, hourly_rate });
});

router.put('/rates', async (req: Request, res: Response) => {
  const { employee_id, company_name, role_name, hourly_rate } = req.body as Record<string, unknown>;

  if (!employee_id || !company_name || !role_name || hourly_rate === undefined) {
    return res.status(400).json({
      error: { code: 'MISSING_FIELDS', message: 'employee_id, company_name, role_name, and hourly_rate are required' },
    });
  }
  if (typeof hourly_rate !== 'number' || hourly_rate <= 0) {
    return res.status(400).json({
      error: { code: 'INVALID_RATE', message: 'hourly_rate must be a positive number' },
    });
  }

  const db = getDb();
  const result = await db.execute({
    sql: 'UPDATE rates SET hourly_rate = ? WHERE employee_id = ? AND company_name = ? AND role_name = ?',
    args: [hourly_rate, employee_id as string, company_name as string, role_name as string],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({
      error: { code: 'RATE_NOT_FOUND', message: 'Rate not found' },
    });
  }

  res.json({ employee_id, company_name, role_name, hourly_rate });
});

router.delete('/rates', async (req: Request, res: Response) => {
  const { employee_id, company_name, role_name } = req.body as Record<string, string>;

  if (!employee_id || !company_name || !role_name) {
    return res.status(400).json({
      error: { code: 'MISSING_FIELDS', message: 'employee_id, company_name, and role_name are required' },
    });
  }

  const db = getDb();
  const result = await db.execute({
    sql: 'DELETE FROM rates WHERE employee_id = ? AND company_name = ? AND role_name = ?',
    args: [employee_id, company_name, role_name],
  });
  if (result.rowsAffected === 0) {
    return res.status(404).json({
      error: { code: 'RATE_NOT_FOUND', message: 'Rate not found' },
    });
  }

  res.json({ success: true });
});

// ─── GET /api/admin/insights ─────────────────────────────────────────────────

const HOURS_SQL = `
  CASE
    WHEN (CAST(substr(end_time,1,2) AS INT)*60 + CAST(substr(end_time,4,2) AS INT))
       > (CAST(substr(start_time,1,2) AS INT)*60 + CAST(substr(start_time,4,2) AS INT))
    THEN (CAST(substr(end_time,1,2) AS INT)*60 + CAST(substr(end_time,4,2) AS INT))
       - (CAST(substr(start_time,1,2) AS INT)*60 + CAST(substr(start_time,4,2) AS INT))
    ELSE (CAST(substr(end_time,1,2) AS INT)*60 + CAST(substr(end_time,4,2) AS INT))
       - (CAST(substr(start_time,1,2) AS INT)*60 + CAST(substr(start_time,4,2) AS INT))
       + 1440
  END`;

router.get('/insights', async (req: Request, res: Response) => {
  const db = getDb();
  const employee_id = req.query.employee_id as string | undefined;
  const company_name = req.query.company_name as string | undefined;
  const role_name = req.query.role_name as string | undefined;
  const date_from = req.query.date_from as string | undefined;
  const date_to = req.query.date_to as string | undefined;

  // Build dynamic WHERE clause
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (employee_id) { conditions.push('t.employee_id = ?'); params.push(employee_id); }
  if (company_name) { conditions.push('t.company_name = ?'); params.push(company_name); }
  if (role_name) { conditions.push('t.role_name = ?'); params.push(role_name); }
  if (date_from) { conditions.push('t.work_date >= ?'); params.push(date_from); }
  if (date_to) { conditions.push('t.work_date <= ?'); params.push(date_to); }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // Summary
  const summaryResult = await db.execute({
    sql: `SELECT
            COUNT(*) as totalEntries,
            COALESCE(SUM(${HOURS_SQL}), 0) / 60.0 as totalHours,
            COUNT(DISTINCT t.work_date) as uniqueDays,
            COUNT(DISTINCT t.employee_id) as uniqueEmployees,
            COUNT(DISTINCT t.company_name) as uniqueCompanies
          FROM time_entries t ${where}`,
    args: params,
  });
  const summary = summaryResult.rows[0] as unknown as {
    totalEntries: number; totalHours: number; uniqueDays: number; uniqueEmployees: number; uniqueCompanies: number;
  };
  const avgHoursPerDay = summary.uniqueDays > 0
    ? Math.round((summary.totalHours / summary.uniqueDays) * 100) / 100
    : 0;

  // By Employee
  const byEmployeeResult = await db.execute({
    sql: `SELECT t.employee_id, e.full_name,
            COALESCE(SUM(${HOURS_SQL}), 0) / 60.0 as total_hours,
            COUNT(*) as entry_count,
            COUNT(DISTINCT t.work_date) as days_worked
          FROM time_entries t
          JOIN employees e ON t.employee_id = e.employee_id
          ${where}
          GROUP BY t.employee_id
          ORDER BY total_hours DESC`,
    args: params,
  });

  // By Company
  const byCompanyResult = await db.execute({
    sql: `SELECT t.company_name,
            COALESCE(SUM(${HOURS_SQL}), 0) / 60.0 as total_hours,
            COUNT(*) as entry_count,
            COUNT(DISTINCT t.employee_id) as employee_count
          FROM time_entries t ${where}
          GROUP BY t.company_name
          ORDER BY total_hours DESC`,
    args: params,
  });

  // By Role
  const byRoleResult = await db.execute({
    sql: `SELECT t.role_name,
            COALESCE(SUM(${HOURS_SQL}), 0) / 60.0 as total_hours,
            COUNT(*) as entry_count
          FROM time_entries t ${where}
          GROUP BY t.role_name
          ORDER BY total_hours DESC`,
    args: params,
  });

  // By Date
  const byDateResult = await db.execute({
    sql: `SELECT t.work_date,
            COALESCE(SUM(${HOURS_SQL}), 0) / 60.0 as total_hours,
            COUNT(*) as entry_count
          FROM time_entries t ${where}
          GROUP BY t.work_date
          ORDER BY t.work_date DESC`,
    args: params,
  });

  // By Company+Role
  const byCompanyRoleResult = await db.execute({
    sql: `SELECT t.company_name, t.role_name,
            COALESCE(SUM(${HOURS_SQL}), 0) / 60.0 as total_hours,
            COUNT(*) as entry_count
          FROM time_entries t ${where}
          GROUP BY t.company_name, t.role_name
          ORDER BY total_hours DESC`,
    args: params,
  });

  // Unique companies + roles for filter dropdowns
  const companiesResult = await db.execute('SELECT DISTINCT company_name FROM time_entries ORDER BY company_name');
  const rolesResult = await db.execute('SELECT DISTINCT role_name FROM time_entries ORDER BY role_name');

  // Proportional deficit per entry (attributes employee-day deficit to entries by hours ratio)
  const deficitResult = await db.execute({
    sql: `
      SELECT
        t.employee_id,
        t.work_date,
        t.company_name,
        t.role_name,
        CASE
          WHEN e.standard_daily_quota > daily.daily_hours
          THEN (e.standard_daily_quota - daily.daily_hours) * ((${HOURS_SQL}) / 60.0)
               / CASE WHEN daily.daily_hours > 0 THEN daily.daily_hours ELSE 1 END
          ELSE 0
        END as entry_deficit
      FROM time_entries t
      JOIN employees e ON t.employee_id = e.employee_id
      JOIN (
        SELECT employee_id, work_date, SUM(${HOURS_SQL}) / 60.0 as daily_hours
        FROM time_entries
        GROUP BY employee_id, work_date
      ) daily ON t.employee_id = daily.employee_id AND t.work_date = daily.work_date
      ${where}
    `,
    args: params,
  });

  // Aggregate deficit by dimensions
  let totalDeficit = 0;
  const deficitByEmployee: Record<string, number> = {};
  const deficitByDate: Record<string, number> = {};
  const deficitByCompany: Record<string, number> = {};
  const deficitByRole: Record<string, number> = {};
  const deficitByCompanyRole: Record<string, number> = {};

  for (const row of deficitResult.rows) {
    const r = row as unknown as { employee_id: string; work_date: string; company_name: string; role_name: string; entry_deficit: number };
    const d = Number(r.entry_deficit) || 0;
    totalDeficit += d;
    deficitByEmployee[r.employee_id] = (deficitByEmployee[r.employee_id] || 0) + d;
    deficitByDate[r.work_date] = (deficitByDate[r.work_date] || 0) + d;
    deficitByCompany[r.company_name] = (deficitByCompany[r.company_name] || 0) + d;
    deficitByRole[r.role_name] = (deficitByRole[r.role_name] || 0) + d;
    const crKey = `${r.company_name}|||${r.role_name}`;
    deficitByCompanyRole[crKey] = (deficitByCompanyRole[crKey] || 0) + d;
  }

  const rd = (n: number) => Math.round(n * 100) / 100;

  res.json({
    filters: { employee_id, company_name, role_name, date_from, date_to },
    availableCompanies: companiesResult.rows.map((r) => (r as unknown as { company_name: string }).company_name),
    availableRoles: rolesResult.rows.map((r) => (r as unknown as { role_name: string }).role_name),
    summary: {
      totalEntries: summary.totalEntries,
      totalHours: Math.round(summary.totalHours * 100) / 100,
      totalDeficit: rd(totalDeficit),
      uniqueDays: summary.uniqueDays,
      uniqueEmployees: summary.uniqueEmployees,
      uniqueCompanies: summary.uniqueCompanies,
      avgHoursPerDay,
    },
    byEmployee: byEmployeeResult.rows.map((row) => {
      const r = row as unknown as { employee_id: string };
      return { ...row, deficit: rd(deficitByEmployee[r.employee_id] || 0) };
    }),
    byCompany: byCompanyResult.rows.map((row) => {
      const r = row as unknown as { company_name: string };
      return { ...row, deficit: rd(deficitByCompany[r.company_name] || 0) };
    }),
    byRole: byRoleResult.rows.map((row) => {
      const r = row as unknown as { role_name: string };
      return { ...row, deficit: rd(deficitByRole[r.role_name] || 0) };
    }),
    byDate: byDateResult.rows.map((row) => {
      const r = row as unknown as { work_date: string };
      return { ...row, deficit: rd(deficitByDate[r.work_date] || 0) };
    }),
    byCompanyRole: byCompanyRoleResult.rows.map((row) => {
      const r = row as unknown as { company_name: string; role_name: string };
      const crKey = `${r.company_name}|||${r.role_name}`;
      return { ...row, deficit: rd(deficitByCompanyRole[crKey] || 0) };
    }),
  });
});

// ─── Payroll Report helpers ──────────────────────────────────────────────────

interface PayrollReportDay {
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

interface PayrollReportMonthly {
  total_hours: number;
  total_deficit: number;
  total_salary: number;
  total_hours_100: number;
  total_hours_125: number;
  total_hours_150: number;
  work_days: number;
}

async function buildPayrollReport(employeeId: string, month: string) {
  const db = getDb();

  // Validate employee
  const empResult = await db.execute({
    sql: 'SELECT employee_id, full_name, status, standard_daily_quota FROM employees WHERE employee_id = ?',
    args: [employeeId],
  });
  if (empResult.rows.length === 0) return null;

  const employee = empResult.rows[0] as unknown as {
    employee_id: string; full_name: string; status: string; standard_daily_quota: number;
  };

  // Get all work dates in the month
  const dateFrom = `${month}-01`;
  const lastDay = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const dateTo = `${month}-${String(lastDay).padStart(2, '0')}`;

  const datesResult = await db.execute({
    sql: 'SELECT DISTINCT work_date FROM time_entries WHERE employee_id = ? AND work_date >= ? AND work_date <= ? ORDER BY work_date',
    args: [employeeId, dateFrom, dateTo],
  });

  const days: PayrollReportDay[] = [];
  const monthly: PayrollReportMonthly = {
    total_hours: 0, total_deficit: 0, total_salary: 0,
    total_hours_100: 0, total_hours_125: 0, total_hours_150: 0, work_days: 0,
  };

  for (const row of datesResult.rows) {
    const workDate = (row as unknown as { work_date: string }).work_date;
    const payroll = await calculateDailyPayroll(employeeId, workDate);
    if (!payroll) continue;

    const day: PayrollReportDay = {
      work_date: workDate,
      total_hours: Math.round(payroll.total_hours * 100) / 100,
      standard_daily_quota: payroll.standard_daily_quota,
      daily_deficit_hours: Math.round(payroll.daily_deficit_hours * 100) / 100,
      hours_100: Math.round(payroll.hours_100 * 100) / 100,
      hours_125: Math.round(payroll.hours_125 * 100) / 100,
      hours_150: Math.round(payroll.hours_150 * 100) / 100,
      applied_hourly_rate: payroll.applied_hourly_rate,
      gross_daily_salary: Math.round(payroll.gross_daily_salary * 100) / 100,
      night_minutes: payroll.night_minutes,
    };
    days.push(day);

    monthly.total_hours += day.total_hours;
    monthly.total_deficit += day.daily_deficit_hours;
    monthly.total_salary += day.gross_daily_salary;
    monthly.total_hours_100 += day.hours_100;
    monthly.total_hours_125 += day.hours_125;
    monthly.total_hours_150 += day.hours_150;
    monthly.work_days += 1;
  }

  // Round monthly totals
  monthly.total_hours = Math.round(monthly.total_hours * 100) / 100;
  monthly.total_deficit = Math.round(monthly.total_deficit * 100) / 100;
  monthly.total_salary = Math.round(monthly.total_salary * 100) / 100;
  monthly.total_hours_100 = Math.round(monthly.total_hours_100 * 100) / 100;
  monthly.total_hours_125 = Math.round(monthly.total_hours_125 * 100) / 100;
  monthly.total_hours_150 = Math.round(monthly.total_hours_150 * 100) / 100;

  return { employee, month, days, monthly };
}

// ─── GET /api/admin/payroll-report ──────────────────────────────────────────

router.get('/payroll-report', async (req: Request, res: Response) => {
  const employee_id = req.query.employee_id as string | undefined;
  const month = req.query.month as string | undefined;

  if (!employee_id || !month) {
    return res.status(400).json({
      error: { code: 'MISSING_PARAMS', message: 'employee_id and month (YYYY-MM) are required' },
    });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      error: { code: 'INVALID_MONTH', message: 'month must be YYYY-MM format' },
    });
  }

  const report = await buildPayrollReport(employee_id, month);
  if (!report) {
    return res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employee_id}" not found` },
    });
  }

  res.json(report);
});

// ─── GET /api/admin/payroll-report/export ───────────────────────────────────

router.get('/payroll-report/export', async (req: Request, res: Response) => {
  const employee_id = req.query.employee_id as string | undefined;
  const month = req.query.month as string | undefined;

  if (!employee_id || !month) {
    return res.status(400).json({
      error: { code: 'MISSING_PARAMS', message: 'employee_id and month (YYYY-MM) are required' },
    });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      error: { code: 'INVALID_MONTH', message: 'month must be YYYY-MM format' },
    });
  }

  const report = await buildPayrollReport(employee_id, month);
  if (!report) {
    return res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employee_id}" not found` },
    });
  }

  // Build worksheet data
  const headers = ['Date', 'Hours Worked', 'Quota', 'Deficit', '100% Hours', '125% Hours', '150% Hours', 'Hourly Rate', 'Daily Pay', 'Night Min'];
  const rows = report.days.map((d) => [
    d.work_date, d.total_hours, d.standard_daily_quota, d.daily_deficit_hours,
    d.hours_100, d.hours_125, d.hours_150, d.applied_hourly_rate, d.gross_daily_salary, d.night_minutes,
  ]);
  // Totals row
  rows.push([
    'TOTAL', report.monthly.total_hours, '', report.monthly.total_deficit,
    report.monthly.total_hours_100, report.monthly.total_hours_125, report.monthly.total_hours_150,
    '', report.monthly.total_salary, '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    [`Payroll Report: ${report.employee.full_name} (${report.employee.employee_id}) — ${month}`],
    [],
    headers,
    ...rows,
  ]);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Payroll');

  let buffer: Buffer;
  try {
    buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  } catch {
    return res.status(500).json({
      error: { code: 'EXPORT_FAILED', message: 'Failed to generate Excel file' },
    });
  }

  const filename = `payroll_${employee_id}_${month}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

// ─── GET /api/admin/payroll-report/export-all ─────────────────────────────

router.get('/payroll-report/export-all', async (req: Request, res: Response) => {
  const month = req.query.month as string | undefined;
  const filterEmployeeId = req.query.employee_id as string | undefined;

  if (!month) {
    return res.status(400).json({
      error: { code: 'MISSING_PARAMS', message: 'month (YYYY-MM) is required' },
    });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({
      error: { code: 'INVALID_MONTH', message: 'month must be YYYY-MM format' },
    });
  }

  const db = getDb();
  let employeeIds: string[];

  if (filterEmployeeId) {
    // Export only the filtered employee
    const empCheck = await db.execute({
      sql: 'SELECT employee_id FROM employees WHERE employee_id = ?',
      args: [filterEmployeeId],
    });
    if (empCheck.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${filterEmployeeId}" not found` },
      });
    }
    employeeIds = [filterEmployeeId];
  } else {
    const empResult = await db.execute("SELECT employee_id FROM employees WHERE status = 'active' ORDER BY full_name");
    employeeIds = empResult.rows.map((r) => (r as unknown as { employee_id: string }).employee_id);
  }

  if (employeeIds.length === 0) {
    return res.status(404).json({
      error: { code: 'NO_EMPLOYEES', message: 'No active employees found' },
    });
  }

  const wb = XLSX.utils.book_new();

  // Summary sheet data
  const summaryHeaders = ['Employee ID', 'Name', 'Work Days', 'Total Hours', 'Total Deficit', 'Hours 100%', 'Hours 125%', 'Hours 150%', 'Monthly Salary'];
  const summaryRows: (string | number)[][] = [];

  for (const empId of employeeIds) {
    const report = await buildPayrollReport(empId, month);
    if (!report) continue;

    // Add to summary
    summaryRows.push([
      report.employee.employee_id,
      report.employee.full_name,
      report.monthly.work_days,
      report.monthly.total_hours,
      report.monthly.total_deficit,
      report.monthly.total_hours_100,
      report.monthly.total_hours_125,
      report.monthly.total_hours_150,
      report.monthly.total_salary,
    ]);

    // Create per-employee sheet
    if (report.days.length > 0) {
      const dayHeaders = ['Date', 'Hours Worked', 'Quota', 'Deficit', '100% Hours', '125% Hours', '150% Hours', 'Hourly Rate', 'Daily Pay', 'Night Min'];
      const dayRows = report.days.map((d) => [
        d.work_date, d.total_hours, d.standard_daily_quota, d.daily_deficit_hours,
        d.hours_100, d.hours_125, d.hours_150, d.applied_hourly_rate, d.gross_daily_salary, d.night_minutes,
      ]);
      dayRows.push([
        'TOTAL', report.monthly.total_hours, '', report.monthly.total_deficit,
        report.monthly.total_hours_100, report.monthly.total_hours_125, report.monthly.total_hours_150,
        '', report.monthly.total_salary, '',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([
        [`Payroll: ${report.employee.full_name} (${report.employee.employee_id}) — ${month}`],
        [],
        dayHeaders,
        ...dayRows,
      ]);
      ws['!cols'] = [
        { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      ];

      // Sheet name max 31 chars, deduplicate if needed
      let sheetName = report.employee.full_name.slice(0, 28);
      if (wb.SheetNames.includes(sheetName)) {
        sheetName = `${sheetName.slice(0, 25)} (${empId.slice(-3)})`;
      }
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  // Add summary sheet first
  const summaryWs = XLSX.utils.aoa_to_sheet([
    [`All Employees Payroll Summary — ${month}`],
    [],
    summaryHeaders,
    ...summaryRows,
  ]);
  summaryWs['!cols'] = [
    { wch: 14 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
  ];

  // Insert summary as the first sheet
  wb.SheetNames.unshift('Summary');
  wb.Sheets['Summary'] = summaryWs;

  let buffer: Buffer;
  try {
    buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  } catch {
    return res.status(500).json({
      error: { code: 'EXPORT_FAILED', message: 'Failed to generate Excel file' },
    });
  }

  const filename = `payroll_all_employees_${month}.xlsx`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});

export default router;
