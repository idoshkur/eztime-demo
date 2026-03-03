import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isValidTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false;
  const [h, m] = t.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
}

// ─── POST /api/time-entries ───────────────────────────────────────────────────

router.post('/', (req: Request, res: Response) => {
  const { employee_id, work_date, site_name, role_name, start_time, end_time } = req.body as Record<string, string>;

  // Validate presence
  const missing = ['employee_id', 'work_date', 'site_name', 'role_name', 'start_time', 'end_time'].filter(
    (f) => !req.body[f],
  );
  if (missing.length > 0) {
    return res.status(400).json({
      error: {
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missing.join(', ')}`,
      },
    });
  }

  if (!isValidDate(work_date)) {
    return res.status(400).json({
      error: { code: 'INVALID_DATE', message: 'work_date must be YYYY-MM-DD' },
    });
  }

  if (!isValidTime(start_time)) {
    return res.status(400).json({
      error: { code: 'INVALID_TIME', message: 'start_time must be HH:MM (00:00–23:59)' },
    });
  }

  if (!isValidTime(end_time)) {
    return res.status(400).json({
      error: { code: 'INVALID_TIME', message: 'end_time must be HH:MM (00:00–23:59)' },
    });
  }

  // Duration validation
  let endMin = timeToMinutes(end_time);
  const startMin = timeToMinutes(start_time);
  if (endMin <= startMin) endMin += 24 * 60;
  const durationMinutes = endMin - startMin;

  if (durationMinutes <= 0) {
    return res.status(400).json({
      error: { code: 'INVALID_DURATION', message: 'Duration must be greater than 0 minutes' },
    });
  }
  if (durationMinutes > 16 * 60) {
    return res.status(400).json({
      error: { code: 'DURATION_TOO_LONG', message: 'Duration must not exceed 16 hours' },
    });
  }

  const db = getDb();

  // Employee must exist
  const employee = db
    .prepare('SELECT employee_id FROM employees WHERE employee_id = ?')
    .get(employee_id);
  if (!employee) {
    return res.status(400).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employee_id}" not found` },
    });
  }

  // Validate allowed sites (if list is configured)
  const allowedSites = db
    .prepare('SELECT site_name FROM employee_allowed_sites WHERE employee_id = ?')
    .all(employee_id) as { site_name: string }[];
  if (allowedSites.length > 0 && !allowedSites.some((s) => s.site_name === site_name)) {
    return res.status(400).json({
      error: {
        code: 'SITE_NOT_ALLOWED',
        message: `Site "${site_name}" is not allowed for this employee`,
        details: { allowed: allowedSites.map((s) => s.site_name) },
      },
    });
  }

  // Validate allowed roles (if list is configured)
  const allowedRoles = db
    .prepare('SELECT role_name FROM employee_allowed_roles WHERE employee_id = ?')
    .all(employee_id) as { role_name: string }[];
  if (allowedRoles.length > 0 && !allowedRoles.some((r) => r.role_name === role_name)) {
    return res.status(400).json({
      error: {
        code: 'ROLE_NOT_ALLOWED',
        message: `Role "${role_name}" is not allowed for this employee`,
        details: { allowed: allowedRoles.map((r) => r.role_name) },
      },
    });
  }

  // Rate must exist for (employee, site, role)
  const rate = db
    .prepare('SELECT hourly_rate FROM rates WHERE employee_id = ? AND site_name = ? AND role_name = ?')
    .get(employee_id, site_name, role_name) as { hourly_rate: number } | undefined;
  if (!rate) {
    return res.status(400).json({
      error: {
        code: 'RATE_NOT_FOUND',
        message: `No rate found for employee "${employee_id}" at site "${site_name}" with role "${role_name}"`,
      },
    });
  }

  // Insert
  const id = uuidv4();
  const created_at = new Date().toISOString();
  db.prepare(
    `INSERT INTO time_entries (id, work_date, employee_id, site_name, role_name, start_time, end_time, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, work_date, employee_id, site_name, role_name, start_time, end_time, created_at);

  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  return res.status(201).json(entry);
});

// ─── GET /api/time-entries?employee_id=...&work_date=... ─────────────────────

router.get('/', (req: Request, res: Response) => {
  const { employee_id, work_date } = req.query;

  if (!employee_id || !work_date) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PARAMS',
        message: 'Query params employee_id and work_date are required',
      },
    });
  }

  const db = getDb();
  const entries = db
    .prepare(
      'SELECT * FROM time_entries WHERE employee_id = ? AND work_date = ? ORDER BY start_time',
    )
    .all(employee_id as string, work_date as string);

  res.json(entries);
});

export default router;
