import React from 'react';
import { DailyPayroll } from '../api/client';

interface Props {
  payroll: DailyPayroll | null;
}

const fmt = (n: number, d = 2) => n.toFixed(d);
const currency = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayrollSummary({ payroll }: Props) {
  if (!payroll) {
    return (
      <section className="card">
        <h2>Daily Payroll Summary</h2>
        <p className="empty-state">Select an employee and date to view payroll summary.</p>
      </section>
    );
  }

  const { overtime_threshold: thr, night_minutes: nm, applied_hourly_rate: rate } = payroll;
  const hasRate = rate > 0;
  const nightActive = nm >= 120;

  return (
    <section className="card">
      <h2>Daily Payroll Summary</h2>
      <div className="summary-grid">

        {/* Work Hours */}
        <div className="summary-section">
          <h3>Work Hours</h3>
          <div className="stat-row">
            <span>Total Worked</span>
            <strong>{fmt(payroll.total_hours)} hrs ({payroll.total_worked_minutes} min)</strong>
          </div>
          <div className="stat-row">
            <span>Standard Quota</span>
            <strong>{fmt(payroll.standard_daily_quota)} hrs</strong>
          </div>
          <div className={`stat-row ${payroll.daily_deficit_hours > 0 ? 'row-deficit' : 'row-ok'}`}>
            <span>Daily Deficit</span>
            <strong>{fmt(payroll.daily_deficit_hours)} hrs</strong>
          </div>
        </div>

        {/* Night Rule */}
        <div className="summary-section">
          <h3>Night Rule (22:00 – 06:00)</h3>
          <div className="stat-row">
            <span>Night Minutes Worked</span>
            <strong>{nm} min</strong>
          </div>
          <div className={`stat-row ${nightActive ? 'row-night' : ''}`}>
            <span>Overtime Threshold</span>
            <strong>
              {thr}h{' '}
              <span className="badge">{nightActive ? 'night rule ≥ 120 min' : 'standard'}</span>
            </strong>
          </div>
        </div>

        {/* Overtime Tiers */}
        <div className="summary-section">
          <h3>Overtime Breakdown</h3>
          <div className="stat-row tier-100">
            <span>100% (base) — first {thr}h</span>
            <strong>{fmt(payroll.hours_100)} hrs</strong>
          </div>
          <div className="stat-row tier-125">
            <span>125% — {thr}h → 10h</span>
            <strong>{fmt(payroll.hours_125)} hrs</strong>
          </div>
          <div className="stat-row tier-150">
            <span>150% — above 10h</span>
            <strong>{fmt(payroll.hours_150)} hrs</strong>
          </div>
        </div>

        {/* Pay Calculation */}
        {hasRate && (
          <div className="summary-section">
            <h3>Pay Calculation</h3>
            <div className="stat-row">
              <span>Applied Hourly Rate (MAX)</span>
              <strong>₪{currency(rate)}</strong>
            </div>
            <div className="stat-row tier-100">
              <span>100%  {fmt(payroll.hours_100)}h × ₪{fmt(rate)}</span>
              <strong>₪{currency(payroll.hours_100 * rate)}</strong>
            </div>
            <div className="stat-row tier-125">
              <span>125%  {fmt(payroll.hours_125)}h × ₪{fmt(rate)} × 1.25</span>
              <strong>₪{currency(payroll.hours_125 * rate * 1.25)}</strong>
            </div>
            <div className="stat-row tier-150">
              <span>150%  {fmt(payroll.hours_150)}h × ₪{fmt(rate)} × 1.50</span>
              <strong>₪{currency(payroll.hours_150 * rate * 1.5)}</strong>
            </div>
            <div className="stat-row row-total">
              <span>Gross Daily Salary</span>
              <strong>₪{currency(payroll.gross_daily_salary)}</strong>
            </div>
          </div>
        )}

        {/* Site + Role breakdown */}
        {payroll.breakdown_by_site_role.length > 0 && (
          <div className="summary-section">
            <h3>Breakdown by Site &amp; Role</h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Role</th>
                    <th>Hours</th>
                    <th>Minutes</th>
                    <th>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.breakdown_by_site_role.map((b, i) => (
                    <tr key={i}>
                      <td>{b.site_name}</td>
                      <td>{b.role_name}</td>
                      <td className="mono">{fmt(b.hours)}</td>
                      <td className="mono">{b.minutes}</td>
                      <td className="mono">{b.entry_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}
