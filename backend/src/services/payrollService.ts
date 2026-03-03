import { getDb } from '../db';
import { TimeEntry, DailyPayroll } from '../types';

// ─── Time helpers ────────────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Duration of a single time entry in minutes.
 * If end <= start the shift crosses midnight (add 24 h to end).
 */
function entryDuration(start: string, end: string): number {
  const s = timeToMinutes(start);
  let e = timeToMinutes(end);
  if (e <= s) e += 24 * 60;
  return e - s;
}

// ─── 6.2  Night minutes  [22:00 – 06:00)  ───────────────────────────────────
//
//  The night window spans two "halves":
//    Evening half  → [1320, 1440)  = 22:00 to midnight
//    Morning half  → [0,   360)   = 00:00 to 06:00
//
//  For each entry we compute the overlap in each half independently,
//  which correctly handles:
//    - day-only entries (no overlap)
//    - evening entries (22:00–23:xx → overlap in evening half)
//    - early-morning entries (01:00–04:00 → overlap in morning half)
//    - overnight entries crossing midnight (both halves)
//
function calculateNightMinutes(entries: TimeEntry[]): number {
  const EVENING_START = 22 * 60; // 1320
  const MIDNIGHT      = 24 * 60; // 1440
  const MORNING_END   =  6 * 60; //  360

  let nightMinutes = 0;

  for (const entry of entries) {
    const s = timeToMinutes(entry.start_time);
    let   e = timeToMinutes(entry.end_time);
    if (e <= s) e += MIDNIGHT; // normalise midnight-crossing entries

    // Evening half [1320, 1440)
    const evStart = Math.max(s, EVENING_START);
    const evEnd   = Math.min(e, MIDNIGHT);
    if (evEnd > evStart) nightMinutes += evEnd - evStart;

    if (e > MIDNIGHT) {
      // Entry crosses midnight → morning overlap from 1440 up to 1800 (06:00 next day)
      const moStart = MIDNIGHT;
      const moEnd   = Math.min(e, MIDNIGHT + MORNING_END);
      if (moEnd > moStart) nightMinutes += moEnd - moStart;
    } else {
      // Entry does NOT cross midnight; check if it falls in early morning [0, 360)
      if (s < MORNING_END) {
        // Overlap = [s, min(e, MORNING_END))
        const moEnd = Math.min(e, MORNING_END);
        if (moEnd > s) nightMinutes += moEnd - s;
      }
    }
  }

  return nightMinutes;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function calculateDailyPayroll(
  employeeId: string,
  workDate: string,
): DailyPayroll | null {
  const db = getDb();

  // Fetch employee
  const employee = db
    .prepare('SELECT * FROM employees WHERE employee_id = ?')
    .get(employeeId) as { employee_id: string; full_name: string; status: string; standard_daily_quota: number } | undefined;

  if (!employee) return null;

  // Fetch time entries for the day (ordered by start time)
  const entries = db
    .prepare(
      'SELECT * FROM time_entries WHERE employee_id = ? AND work_date = ? ORDER BY start_time',
    )
    .all(employeeId, workDate) as TimeEntry[];

  // Empty day – return zeroed structure
  if (entries.length === 0) {
    return {
      employee_id:          employeeId,
      work_date:            workDate,
      standard_daily_quota: employee.standard_daily_quota,
      total_worked_minutes: 0,
      total_hours:          0,
      night_minutes:        0,
      overtime_threshold:   8,
      hours_100:            0,
      hours_125:            0,
      hours_150:            0,
      applied_hourly_rate:  0,
      gross_daily_salary:   0,
      daily_deficit_hours:  employee.standard_daily_quota,
      entries:              [],
      breakdown_by_site_role: [],
    };
  }

  // 6.1 – Aggregate daily work time
  let totalWorkedMinutes = 0;
  for (const e of entries) {
    totalWorkedMinutes += entryDuration(e.start_time, e.end_time);
  }
  const totalHours = totalWorkedMinutes / 60;

  // 6.2 – Night rule
  const nightMinutes      = calculateNightMinutes(entries);
  const overtimeThreshold = nightMinutes >= 120 ? 7 : 8;

  // 6.3 – Overtime tiers
  const hours100 = Math.min(totalHours, overtimeThreshold);
  const hours125 = Math.min(Math.max(totalHours - overtimeThreshold, 0), 10 - overtimeThreshold);
  const hours150 = Math.max(totalHours - 10, 0);

  // 6.4 – Applied hourly rate (MAX across all entries)
  const getRateStmt = db.prepare(
    'SELECT hourly_rate FROM rates WHERE employee_id = ? AND site_name = ? AND role_name = ?',
  );
  let appliedHourlyRate = 0;
  for (const e of entries) {
    const row = getRateStmt.get(e.employee_id, e.site_name, e.role_name) as
      | { hourly_rate: number }
      | undefined;
    if (row && row.hourly_rate > appliedHourlyRate) {
      appliedHourlyRate = row.hourly_rate;
    }
  }

  // 6.5 – Gross daily salary
  const salary100       = hours100 * appliedHourlyRate;
  const salary125       = hours125 * appliedHourlyRate * 1.25;
  const salary150       = hours150 * appliedHourlyRate * 1.5;
  const grossDailySalary = salary100 + salary125 + salary150;

  // 6.6 – Daily deficit
  const dailyDeficitHours = Math.max(employee.standard_daily_quota - totalHours, 0);

  // 6.7 – Breakdown by (site_name, role_name)
  const breakdownMap = new Map<
    string,
    { site_name: string; role_name: string; minutes: number; entry_count: number }
  >();
  for (const e of entries) {
    const key = `${e.site_name}\x00${e.role_name}`;
    const dur = entryDuration(e.start_time, e.end_time);
    const cur = breakdownMap.get(key);
    if (cur) {
      cur.minutes     += dur;
      cur.entry_count += 1;
    } else {
      breakdownMap.set(key, {
        site_name:   e.site_name,
        role_name:   e.role_name,
        minutes:     dur,
        entry_count: 1,
      });
    }
  }
  const breakdownBySiteRole = Array.from(breakdownMap.values()).map((b) => ({
    site_name:   b.site_name,
    role_name:   b.role_name,
    minutes:     b.minutes,
    hours:       b.minutes / 60,
    entry_count: b.entry_count,
  }));

  return {
    employee_id:          employeeId,
    work_date:            workDate,
    standard_daily_quota: employee.standard_daily_quota,
    total_worked_minutes: totalWorkedMinutes,
    total_hours:          totalHours,
    night_minutes:        nightMinutes,
    overtime_threshold:   overtimeThreshold,
    hours_100:            hours100,
    hours_125:            hours125,
    hours_150:            hours150,
    applied_hourly_rate:  appliedHourlyRate,
    gross_daily_salary:   grossDailySalary,
    daily_deficit_hours:  dailyDeficitHours,
    entries,
    breakdown_by_site_role: breakdownBySiteRole,
  };
}
