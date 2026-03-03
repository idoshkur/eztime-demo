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

/** Shift a YYYY-MM-DD date by ±N days. */
function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z'); // noon avoids DST edge cases
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ─── Shared validation ──────────────────────────────────────────────────────

async function validateEntry(
  db: ReturnType<typeof getDb>,
  res: Response,
  employee_id: string,
  work_date: string,
  company_name: string,
  role_name: string,
  start_time: string,
  end_time: string,
  excludeId?: string,
): Promise<boolean> {
  if (!isValidDate(work_date)) {
    res.status(400).json({ error: { code: 'INVALID_DATE', message: 'work_date must be YYYY-MM-DD' } });
    return false;
  }
  if (!isValidTime(start_time)) {
    res.status(400).json({ error: { code: 'INVALID_TIME', message: 'start_time must be HH:MM (00:00–23:59)' } });
    return false;
  }
  if (!isValidTime(end_time)) {
    res.status(400).json({ error: { code: 'INVALID_TIME', message: 'end_time must be HH:MM (00:00–23:59)' } });
    return false;
  }

  let endMin = timeToMinutes(end_time);
  const startMin = timeToMinutes(start_time);
  if (endMin <= startMin) endMin += 24 * 60;
  const durationMinutes = endMin - startMin;

  if (durationMinutes <= 0) {
    res.status(400).json({ error: { code: 'INVALID_DURATION', message: 'Duration must be greater than 0 minutes' } });
    return false;
  }
  if (durationMinutes > 16 * 60) {
    res.status(400).json({ error: { code: 'DURATION_TOO_LONG', message: 'Duration must not exceed 16 hours' } });
    return false;
  }

  const empResult = await db.execute({ sql: 'SELECT employee_id FROM employees WHERE employee_id = ?', args: [employee_id] });
  if (empResult.rows.length === 0) {
    res.status(404).json({ error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employee_id}" not found` } });
    return false;
  }

  const companiesResult = await db.execute({
    sql: 'SELECT company_name FROM employee_allowed_companies WHERE employee_id = ?',
    args: [employee_id],
  });
  if (companiesResult.rows.length > 0 && !companiesResult.rows.some((c) => c.company_name === company_name)) {
    res.status(400).json({
      error: {
        code: 'COMPANY_NOT_ALLOWED',
        message: `Company "${company_name}" is not allowed for this employee`,
        details: { allowed: companiesResult.rows.map((c) => c.company_name) },
      },
    });
    return false;
  }

  const rolesResult = await db.execute({
    sql: 'SELECT role_name FROM employee_allowed_roles WHERE employee_id = ?',
    args: [employee_id],
  });
  if (rolesResult.rows.length > 0 && !rolesResult.rows.some((r) => r.role_name === role_name)) {
    res.status(400).json({
      error: {
        code: 'ROLE_NOT_ALLOWED',
        message: `Role "${role_name}" is not allowed for this employee`,
        details: { allowed: rolesResult.rows.map((r) => r.role_name) },
      },
    });
    return false;
  }

  const rateResult = await db.execute({
    sql: 'SELECT hourly_rate FROM rates WHERE employee_id = ? AND company_name = ? AND role_name = ?',
    args: [employee_id, company_name, role_name],
  });
  if (rateResult.rows.length === 0) {
    res.status(404).json({
      error: {
        code: 'RATE_NOT_FOUND',
        message: `No rate found for employee "${employee_id}" at company "${company_name}" with role "${role_name}"`,
      },
    });
    return false;
  }

  // ── Overlap detection (same day) ────────────────────────────────────────────
  const existingResult = await db.execute({
    sql: 'SELECT id, start_time, end_time FROM time_entries WHERE employee_id = ? AND work_date = ?',
    args: [employee_id, work_date],
  });

  const newStart = timeToMinutes(start_time);
  let newEnd = timeToMinutes(end_time);
  if (newEnd <= newStart) newEnd += 24 * 60;

  for (const row of existingResult.rows) {
    const existing = row as unknown as { id: string; start_time: string; end_time: string };
    if (excludeId && existing.id === excludeId) continue;

    const exStart = timeToMinutes(existing.start_time);
    let exEnd = timeToMinutes(existing.end_time);
    if (exEnd <= exStart) exEnd += 24 * 60;

    // Two intervals [a,b) and [c,d) overlap when a < d AND c < b
    if (newStart < exEnd && exStart < newEnd) {
      res.status(400).json({
        error: {
          code: 'OVERLAP',
          message: `This entry (${start_time}–${end_time}) overlaps with an existing entry (${existing.start_time}–${existing.end_time}) on ${work_date}`,
        },
      });
      return false;
    }
  }

  // ── Cross-day overlap: previous day's overnight entries spilling into today ─
  const prevDate = shiftDate(work_date, -1);
  const prevDayResult = await db.execute({
    sql: 'SELECT id, start_time, end_time FROM time_entries WHERE employee_id = ? AND work_date = ?',
    args: [employee_id, prevDate],
  });

  for (const row of prevDayResult.rows) {
    const prev = row as unknown as { id: string; start_time: string; end_time: string };
    if (excludeId && prev.id === excludeId) continue;

    const pStart = timeToMinutes(prev.start_time);
    const pEnd = timeToMinutes(prev.end_time);
    if (pEnd >= pStart) continue; // Doesn't cross midnight — no spill into today

    // The overnight entry spills into today as [00:00, pEnd).
    // Overlap exists if the new entry starts before the spill ends.
    if (newStart < pEnd) {
      res.status(400).json({
        error: {
          code: 'OVERLAP',
          message: `This entry (${start_time}–${end_time}) overlaps with an overnight entry (${prev.start_time}–${prev.end_time}) from ${prevDate}`,
        },
      });
      return false;
    }
  }

  // ── Cross-day overlap: if new entry crosses midnight, check next day's entries
  const newCrossesMidnight = timeToMinutes(end_time) <= timeToMinutes(start_time);
  if (newCrossesMidnight) {
    const nextDate = shiftDate(work_date, 1);
    const nextDayResult = await db.execute({
      sql: 'SELECT id, start_time, end_time FROM time_entries WHERE employee_id = ? AND work_date = ?',
      args: [employee_id, nextDate],
    });

    const spillEnd = timeToMinutes(end_time); // New entry spills [00:00, spillEnd) into next day

    for (const row of nextDayResult.rows) {
      const next = row as unknown as { id: string; start_time: string; end_time: string };
      if (excludeId && next.id === excludeId) continue;

      const nxStart = timeToMinutes(next.start_time);

      // Overlap exists if the next day's entry starts before the spill ends.
      if (nxStart < spillEnd) {
        res.status(400).json({
          error: {
            code: 'OVERLAP',
            message: `This overnight entry (${start_time}–${end_time}) overlaps with an entry (${next.start_time}–${next.end_time}) on ${nextDate}`,
          },
        });
        return false;
      }
    }
  }

  return true;
}

// ─── POST /api/time-entries ───────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { employee_id, work_date, company_name, role_name, start_time, end_time } = req.body as Record<string, string>;

  const missing = ['employee_id', 'work_date', 'company_name', 'role_name', 'start_time', 'end_time'].filter(
    (f) => !req.body[f],
  );
  if (missing.length > 0) {
    return res.status(400).json({
      error: { code: 'MISSING_FIELDS', message: `Missing required fields: ${missing.join(', ')}` },
    });
  }

  const db = getDb();
  const tx = await db.transaction('write');
  try {
    const valid = await validateEntry(
      tx as unknown as ReturnType<typeof getDb>,
      res, employee_id, work_date, company_name, role_name, start_time, end_time,
    );
    if (!valid) { await tx.rollback(); return; }

    const id = uuidv4();
    const created_at = new Date().toISOString();
    await tx.execute({
      sql: `INSERT INTO time_entries (id, work_date, employee_id, company_name, role_name, start_time, end_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, work_date, employee_id, company_name, role_name, start_time, end_time, created_at],
    });
    await tx.commit();

    const entryResult = await db.execute({ sql: 'SELECT * FROM time_entries WHERE id = ?', args: [id] });
    return res.status(201).json(entryResult.rows[0]);
  } catch (err) {
    try { await tx.rollback(); } catch { /* already rolled back */ }
    throw err;
  }
});

// ─── GET /api/time-entries?employee_id=...&work_date=... ─────────────────────

router.get('/', async (req: Request, res: Response) => {
  const { employee_id, work_date } = req.query;

  if (!employee_id || !work_date) {
    return res.status(400).json({
      error: { code: 'MISSING_PARAMS', message: 'Query params employee_id and work_date are required' },
    });
  }

  const db = getDb();
  const result = await db.execute({
    sql: 'SELECT * FROM time_entries WHERE employee_id = ? AND work_date = ? ORDER BY start_time',
    args: [employee_id as string, work_date as string],
  });
  res.json(result.rows);
});

// ─── PUT /api/time-entries/:id ────────────────────────────────────────────────

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();

  const existingResult = await db.execute({ sql: 'SELECT * FROM time_entries WHERE id = ?', args: [id] });
  const existing = existingResult.rows[0];
  if (!existing) {
    return res.status(404).json({
      error: { code: 'ENTRY_NOT_FOUND', message: `Time entry "${id}" not found` },
    });
  }

  const body = req.body as Record<string, string>;
  const fields = ['work_date', 'company_name', 'role_name', 'start_time', 'end_time'];
  const hasUpdate = fields.some((f) => body[f] !== undefined);
  if (!hasUpdate) {
    return res.status(400).json({
      error: { code: 'NO_FIELDS', message: 'Provide at least one field to update' },
    });
  }

  const work_date    = body.work_date    ?? (existing.work_date as string);
  const company_name = body.company_name ?? (existing.company_name as string);
  const role_name    = body.role_name    ?? (existing.role_name as string);
  const start_time   = body.start_time   ?? (existing.start_time as string);
  const end_time     = body.end_time     ?? (existing.end_time as string);
  const employee_id  = existing.employee_id as string;

  const tx = await db.transaction('write');
  try {
    const valid = await validateEntry(
      tx as unknown as ReturnType<typeof getDb>,
      res, employee_id, work_date, company_name, role_name, start_time, end_time, id,
    );
    if (!valid) { await tx.rollback(); return; }

    await tx.execute({
      sql: 'UPDATE time_entries SET work_date = ?, company_name = ?, role_name = ?, start_time = ?, end_time = ? WHERE id = ?',
      args: [work_date, company_name, role_name, start_time, end_time, id],
    });
    await tx.commit();

    const updatedResult = await db.execute({ sql: 'SELECT * FROM time_entries WHERE id = ?', args: [id] });
    res.json(updatedResult.rows[0]);
  } catch (err) {
    try { await tx.rollback(); } catch { /* already rolled back */ }
    throw err;
  }
});

// ─── DELETE /api/time-entries/:id ─────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();

  const result = await db.execute({ sql: 'DELETE FROM time_entries WHERE id = ?', args: [id] });
  if (result.rowsAffected === 0) {
    return res.status(404).json({
      error: { code: 'ENTRY_NOT_FOUND', message: `Time entry "${id}" not found` },
    });
  }

  res.json({ success: true });
});

export default router;
