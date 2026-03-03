import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initSchema } from './db/schema';
import employeesRouter from './routes/employees';
import timeEntriesRouter from './routes/timeEntries';
import payrollRouter from './routes/payroll';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Bootstrap DB schema ─────────────────────────────────────────────────────
initSchema();

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/employees',    employeesRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/payroll',      payrollRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// ─── Global error handler ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
});

app.listen(PORT, () => {
  console.log(`EZTime backend  →  http://localhost:${PORT}`);
});
