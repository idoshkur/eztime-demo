import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getDb } from '../db';
import { parseExcelBuffer } from '../utils/excelParser';
import { upsertExcelData } from '../services/adminUploadService';

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

  res.json({
    employeeCount,
    totalEntries,
    totalHoursWorked: Math.round((totalHoursWorked as number) * 100) / 100,
    uniqueDays,
    entriesPerDay: entriesPerDayResult.rows,
    hoursPerEmployee: hoursPerEmployeeResult.rows,
    entriesByCompany: entriesByCompanyResult.rows,
  });
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

  res.json({
    filters: { employee_id, company_name, role_name, date_from, date_to },
    availableCompanies: companiesResult.rows.map((r) => (r as unknown as { company_name: string }).company_name),
    availableRoles: rolesResult.rows.map((r) => (r as unknown as { role_name: string }).role_name),
    summary: {
      totalEntries: summary.totalEntries,
      totalHours: Math.round(summary.totalHours * 100) / 100,
      uniqueDays: summary.uniqueDays,
      uniqueEmployees: summary.uniqueEmployees,
      uniqueCompanies: summary.uniqueCompanies,
      avgHoursPerDay,
    },
    byEmployee: byEmployeeResult.rows,
    byCompany: byCompanyResult.rows,
    byRole: byRoleResult.rows,
    byDate: byDateResult.rows,
    byCompanyRole: byCompanyRoleResult.rows,
  });
});

export default router;
