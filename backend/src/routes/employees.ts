import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/employees
router.get('/', async (_req: Request, res: Response) => {
  const db = getDb();
  const result = await db.execute(
    'SELECT employee_id, full_name, status, standard_daily_quota FROM employees ORDER BY full_name',
  );
  res.json(result.rows);
});

// GET /api/employees/:employeeId/options
router.get('/:employeeId/options', async (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const db = getDb();

  const empResult = await db.execute({
    sql: 'SELECT employee_id FROM employees WHERE employee_id = ?',
    args: [employeeId],
  });
  if (empResult.rows.length === 0) {
    return res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employeeId}" not found` },
    });
  }

  const companiesResult = await db.execute({
    sql: 'SELECT company_name FROM employee_allowed_companies WHERE employee_id = ? ORDER BY company_name',
    args: [employeeId],
  });
  const rolesResult = await db.execute({
    sql: 'SELECT role_name FROM employee_allowed_roles WHERE employee_id = ? ORDER BY role_name',
    args: [employeeId],
  });

  res.json({
    allowed_companies: companiesResult.rows.map((c) => c.company_name),
    allowed_roles: rolesResult.rows.map((r) => r.role_name),
  });
});

// PUT /api/employees/:employeeId
router.put('/:employeeId', async (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const db = getDb();

  const existingResult = await db.execute({
    sql: 'SELECT * FROM employees WHERE employee_id = ?',
    args: [employeeId],
  });
  const existing = existingResult.rows[0] as unknown as { employee_id: string; full_name: string; status: string; standard_daily_quota: number } | undefined;

  if (!existing) {
    return res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employeeId}" not found` },
    });
  }

  const body = req.body as Record<string, unknown>;
  const hasUpdate = ['full_name', 'status', 'standard_daily_quota'].some((f) => body[f] !== undefined);
  if (!hasUpdate) {
    return res.status(400).json({
      error: { code: 'NO_FIELDS', message: 'Provide at least one field to update' },
    });
  }

  const full_name = (body.full_name as string) ?? existing.full_name;
  const status = (body.status as string) ?? existing.status;
  const standard_daily_quota = (body.standard_daily_quota as number) ?? existing.standard_daily_quota;

  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({
      error: { code: 'INVALID_STATUS', message: 'status must be "active" or "inactive"' },
    });
  }
  if (typeof standard_daily_quota !== 'number' || standard_daily_quota <= 0) {
    return res.status(400).json({
      error: { code: 'INVALID_QUOTA', message: 'standard_daily_quota must be a positive number' },
    });
  }

  await db.execute({
    sql: 'UPDATE employees SET full_name = ?, status = ?, standard_daily_quota = ? WHERE employee_id = ?',
    args: [full_name, status, standard_daily_quota, employeeId],
  });

  const updatedResult = await db.execute({
    sql: 'SELECT employee_id, full_name, status, standard_daily_quota FROM employees WHERE employee_id = ?',
    args: [employeeId],
  });
  res.json(updatedResult.rows[0]);
});

// DELETE /api/employees/:employeeId
router.delete('/:employeeId', async (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const db = getDb();

  const existingResult = await db.execute({
    sql: 'SELECT employee_id FROM employees WHERE employee_id = ?',
    args: [employeeId],
  });
  if (existingResult.rows.length === 0) {
    return res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employeeId}" not found` },
    });
  }

  const deleted = { time_entries: 0, rates: 0, allowed_companies: 0, allowed_roles: 0 };

  const tx = await db.transaction('write');
  try {
    const r1 = await tx.execute({ sql: 'DELETE FROM time_entries WHERE employee_id = ?', args: [employeeId] });
    deleted.time_entries = r1.rowsAffected;
    const r2 = await tx.execute({ sql: 'DELETE FROM rates WHERE employee_id = ?', args: [employeeId] });
    deleted.rates = r2.rowsAffected;
    const r3 = await tx.execute({ sql: 'DELETE FROM employee_allowed_companies WHERE employee_id = ?', args: [employeeId] });
    deleted.allowed_companies = r3.rowsAffected;
    const r4 = await tx.execute({ sql: 'DELETE FROM employee_allowed_roles WHERE employee_id = ?', args: [employeeId] });
    deleted.allowed_roles = r4.rowsAffected;
    await tx.execute({ sql: 'DELETE FROM employees WHERE employee_id = ?', args: [employeeId] });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  res.json({ success: true, deleted });
});

export default router;
