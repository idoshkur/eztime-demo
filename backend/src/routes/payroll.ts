import { Router, Request, Response } from 'express';
import { calculateDailyPayroll } from '../services/payrollService';

const router = Router();

// GET /api/payroll/daily?employee_id=...&work_date=...
router.get('/daily', async (req: Request, res: Response) => {
  const { employee_id, work_date } = req.query;

  if (!employee_id || !work_date) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PARAMS',
        message: 'Query params employee_id and work_date are required',
      },
    });
  }

  const result = await calculateDailyPayroll(employee_id as string, work_date as string);

  if (!result) {
    return res.status(404).json({
      error: {
        code: 'EMPLOYEE_NOT_FOUND',
        message: `Employee "${employee_id}" not found`,
      },
    });
  }

  res.json(result);
});

export default router;
