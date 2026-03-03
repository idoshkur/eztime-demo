import { useState, useEffect } from 'react';
import {
  api,
  Employee,
  InsightsData,
  InsightsFilters,
} from '../api/client';

function round2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export default function AdminInsights() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter form state
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    api.getEmployees().then(setEmployees).catch(() => {});
  }, []);

  const fetchInsights = (filters?: InsightsFilters) => {
    setLoading(true);
    api
      .getInsights(filters)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // Initial load
  useEffect(() => {
    fetchInsights();
  }, []);

  const handleApply = () => {
    fetchInsights({
      employee_id: filterEmployee || undefined,
      company_name: filterCompany || undefined,
      role_name: filterRole || undefined,
      date_from: filterDateFrom || undefined,
      date_to: filterDateTo || undefined,
    });
  };

  const handleClear = () => {
    setFilterEmployee('');
    setFilterCompany('');
    setFilterRole('');
    setFilterDateFrom('');
    setFilterDateTo('');
    fetchInsights();
  };

  return (
    <section className="card">
      <h2>Data Insights</h2>

      {/* Filter Form */}
      <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="form-group">
          <label htmlFor="ins-employee">Employee</label>
          <select id="ins-employee" value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)}>
            <option value="">All</option>
            {employees.map((emp) => (
              <option key={emp.employee_id} value={emp.employee_id}>
                {emp.full_name} ({emp.employee_id})
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ins-company">Company</label>
          <select id="ins-company" value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}>
            <option value="">All</option>
            {data?.availableCompanies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ins-role">Role</label>
          <select id="ins-role" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">All</option>
            {data?.availableRoles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ins-from">Date From</label>
          <input id="ins-from" type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
        </div>

        <div className="form-group">
          <label htmlFor="ins-to">Date To</label>
          <input id="ins-to" type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
        </div>

        <div className="form-group" style={{ justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={handleApply}>Apply Filters</button>
            <button className="btn-secondary" onClick={handleClear}>Clear</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading insights…</div>
      ) : !data ? (
        <p className="empty-state">Could not load insights.</p>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="kpi-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="kpi-card">
              <div className="kpi-value">{round2(data.summary.totalHours)}</div>
              <div className="kpi-label">Total Hours</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{data.summary.totalEntries}</div>
              <div className="kpi-label">Entries</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{data.summary.uniqueDays}</div>
              <div className="kpi-label">Work Days</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{round2(data.summary.avgHoursPerDay)}</div>
              <div className="kpi-label">Avg Hours/Day</div>
            </div>
          </div>

          {/* By Employee */}
          {data.byEmployee.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Hours by Employee</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Total Hours</th>
                      <th>Entries</th>
                      <th>Days Worked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byEmployee.map((row) => (
                      <tr key={row.employee_id}>
                        <td>{row.full_name} ({row.employee_id})</td>
                        <td className="mono">{round2(row.total_hours)}</td>
                        <td>{row.entry_count}</td>
                        <td>{row.days_worked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Company */}
          {data.byCompany.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Hours by Company</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Total Hours</th>
                      <th>Entries</th>
                      <th>Employees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCompany.map((row) => (
                      <tr key={row.company_name}>
                        <td>{row.company_name}</td>
                        <td className="mono">{round2(row.total_hours)}</td>
                        <td>{row.entry_count}</td>
                        <td>{row.employee_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Role */}
          {data.byRole.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Hours by Role</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Total Hours</th>
                      <th>Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRole.map((row) => (
                      <tr key={row.role_name}>
                        <td>{row.role_name}</td>
                        <td className="mono">{round2(row.total_hours)}</td>
                        <td>{row.entry_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Company + Role */}
          {data.byCompanyRole.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Hours by Company + Role</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Role</th>
                      <th>Total Hours</th>
                      <th>Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCompanyRole.map((row, i) => (
                      <tr key={i}>
                        <td>{row.company_name}</td>
                        <td>{row.role_name}</td>
                        <td className="mono">{round2(row.total_hours)}</td>
                        <td>{row.entry_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* By Date */}
          {data.byDate.length > 0 && (
            <div>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Hours by Date</h3>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Total Hours</th>
                      <th>Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byDate.map((row) => (
                      <tr key={row.work_date}>
                        <td className="mono">{row.work_date}</td>
                        <td className="mono">{round2(row.total_hours)}</td>
                        <td>{row.entry_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
