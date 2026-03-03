import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/employees
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const employees = db
    .prepare(
      'SELECT employee_id, full_name, status, standard_daily_quota FROM employees ORDER BY full_name',
    )
    .all();
  res.json(employees);
});

// GET /api/employees/:employeeId/options
router.get('/:employeeId/options', (req: Request, res: Response) => {
  const { employeeId } = req.params;
  const db = getDb();

  const employee = db
    .prepare('SELECT employee_id FROM employees WHERE employee_id = ?')
    .get(employeeId);

  if (!employee) {
    return res.status(404).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: `Employee "${employeeId}" not found` },
    });
  }

  const sites = db
    .prepare('SELECT site_name FROM employee_allowed_sites WHERE employee_id = ? ORDER BY site_name')
    .all(employeeId) as { site_name: string }[];

  const roles = db
    .prepare('SELECT role_name FROM employee_allowed_roles WHERE employee_id = ? ORDER BY role_name')
    .all(employeeId) as { role_name: string }[];

  res.json({
    allowed_sites: sites.map((s) => s.site_name),
    allowed_roles: roles.map((r) => r.role_name),
  });
});

export default router;
