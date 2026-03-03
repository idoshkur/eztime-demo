import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initSchema } from './db/schema';
import employeesRouter from './routes/employees';
import timeEntriesRouter from './routes/timeEntries';
import payrollRouter from './routes/payroll';
import adminRouter from './routes/admin';

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/employees',    employeesRouter);
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/payroll',      payrollRouter);
app.use('/api/admin',        adminRouter);

// ─── Serve frontend in production ────────────────────────────────────────────
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ─── 404 (API routes only when frontend is not served) ───────────────────────
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

// ─── Bootstrap DB schema then start server ──────────────────────────────────
(async () => {
  await initSchema();
  app.listen(PORT, () => {
    console.log(`EZTime backend  →  http://localhost:${PORT}`);
  });
})();
