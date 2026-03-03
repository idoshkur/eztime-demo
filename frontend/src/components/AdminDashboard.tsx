import { useState, useEffect } from 'react';
import { api, DashboardData } from '../api/client';

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = () => {
    setLoading(true);
    api
      .getDashboard()
      .then(setData)
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  if (loading) return <div className="loading">Loading dashboard…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  return (
    <>
      {/* Overview KPIs */}
      <section className="card">
        <h2>Overview</h2>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-value">{data.employeeCount}</div>
            <div className="kpi-label">Active Employees</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{data.totalEntries}</div>
            <div className="kpi-label">Total Entries</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{data.totalHoursWorked.toFixed(1)}</div>
            <div className="kpi-label">Total Hours</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{data.uniqueDays}</div>
            <div className="kpi-label">Work Days Recorded</div>
          </div>
        </div>
        <button className="btn-secondary" style={{ marginTop: '1rem' }} onClick={refresh}>
          Refresh Data
        </button>
      </section>

      {/* Hours per Employee */}
      <section className="card">
        <h2>Hours by Employee</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>ID</th>
                <th>Days Worked</th>
                <th>Total Hours</th>
                <th>Avg/Day</th>
                <th>Entries</th>
              </tr>
            </thead>
            <tbody>
              {data.hoursPerEmployee.map((row) => (
                <tr key={row.employee_id}>
                  <td>{row.full_name}</td>
                  <td className="muted mono">{row.employee_id}</td>
                  <td className="mono">{row.days_worked}</td>
                  <td className="mono">{row.total_hours.toFixed(1)}</td>
                  <td className="mono">{row.days_worked > 0 ? (row.total_hours / row.days_worked).toFixed(1) : '—'}</td>
                  <td className="mono">{row.entry_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Entries by Company */}
      <section className="card">
        <h2>Entries by Company</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Entries</th>
                <th>Unique Employees</th>
              </tr>
            </thead>
            <tbody>
              {data.entriesByCompany.map((row) => (
                <tr key={row.company_name}>
                  <td>{row.company_name}</td>
                  <td className="mono">{row.entry_count}</td>
                  <td className="mono">{row.employee_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent Daily Activity */}
      <section className="card">
        <h2>Recent Daily Activity (Last 30 Days)</h2>
        {data.entriesPerDay.length === 0 ? (
          <p className="empty-state">No entries recorded yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entries</th>
                  <th>Employees</th>
                </tr>
              </thead>
              <tbody>
                {data.entriesPerDay.map((row) => (
                  <tr key={row.work_date}>
                    <td className="mono">{row.work_date}</td>
                    <td className="mono">{row.entry_count}</td>
                    <td className="mono">{row.employee_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
