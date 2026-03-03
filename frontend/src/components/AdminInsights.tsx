import { useState, useEffect } from 'react';
import {
  api,
  Employee,
  InsightsData,
  InsightsFilters,
  PayrollReport,
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

  // Payroll report state
  const [payrollEmployee, setPayrollEmployee] = useState('');
  const [payrollMonth, setPayrollMonth] = useState('');
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollError, setPayrollError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [exportAllMonth, setExportAllMonth] = useState('');
  const [downloadingAll, setDownloadingAll] = useState(false);

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

  // Payroll report handlers
  const handleGeneratePayroll = async () => {
    if (!payrollEmployee || !payrollMonth) return;
    setPayrollLoading(true);
    setPayrollError('');
    setPayrollReport(null);
    try {
      const report = await api.getPayrollReport(payrollEmployee, payrollMonth);
      setPayrollReport(report);
    } catch {
      setPayrollError('Failed to generate payroll report.');
    } finally {
      setPayrollLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!payrollEmployee || !payrollMonth) return;
    setDownloading(true);
    try {
      await api.downloadPayrollExcel(payrollEmployee, payrollMonth);
    } catch {
      setPayrollError('Failed to download Excel file.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadAllExcel = async () => {
    if (!exportAllMonth) return;
    setDownloadingAll(true);
    try {
      await api.downloadAllPayrollExcel(exportAllMonth);
    } catch {
      setPayrollError('Failed to download all-employees Excel file.');
    } finally {
      setDownloadingAll(false);
    }
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
        <div className="loading">Loading insights...</div>
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
            <div style={{ marginBottom: '1.5rem' }}>
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

      {/* ── Payroll Report Section ──────────────────────────────────────────────── */}
      <div style={{ borderTop: '2px solid var(--border)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          Payroll Report
        </h2>

        {/* Global Export: All Employees */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem', padding: '0.75rem', background: 'var(--bg-alt, #f9fafb)', borderRadius: '8px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="export-all-month">Month</label>
            <input
              id="export-all-month"
              type="month"
              value={exportAllMonth}
              onChange={(e) => setExportAllMonth(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            disabled={!exportAllMonth || downloadingAll}
            onClick={handleDownloadAllExcel}
          >
            {downloadingAll ? 'Downloading...' : 'Export All Employees to Excel'}
          </button>
        </div>

        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <div className="form-group">
            <label htmlFor="pr-employee">Employee</label>
            <select
              id="pr-employee"
              value={payrollEmployee}
              onChange={(e) => { setPayrollEmployee(e.target.value); setPayrollReport(null); }}
            >
              <option value="">Select employee...</option>
              {employees.map((emp) => (
                <option key={emp.employee_id} value={emp.employee_id}>
                  {emp.full_name} ({emp.employee_id})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="pr-month">Month</label>
            <input
              id="pr-month"
              type="month"
              value={payrollMonth}
              onChange={(e) => { setPayrollMonth(e.target.value); setPayrollReport(null); }}
            />
          </div>

          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-primary"
                disabled={!payrollEmployee || !payrollMonth || payrollLoading}
                onClick={handleGeneratePayroll}
              >
                {payrollLoading ? 'Generating...' : 'Generate Report'}
              </button>
              {payrollReport && (
                <button
                  className="btn-secondary"
                  disabled={downloading}
                  onClick={handleDownloadExcel}
                >
                  {downloading ? 'Downloading...' : 'Download Excel'}
                </button>
              )}
            </div>
          </div>
        </div>

        {payrollError && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{payrollError}</div>
        )}

        {payrollReport && (
          <>
            {/* Monthly Summary KPIs */}
            <div className="kpi-grid" style={{ marginBottom: '1.25rem' }}>
              <div className="kpi-card">
                <div className="kpi-value">{round2(payrollReport.monthly.total_hours)}</div>
                <div className="kpi-label">Total Hours</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value" style={{ color: payrollReport.monthly.total_deficit > 0 ? 'var(--red)' : 'var(--green)' }}>
                  {round2(payrollReport.monthly.total_deficit)}
                </div>
                <div className="kpi-label">Total Deficit</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value" style={{ color: 'var(--green)' }}>
                  {round2(payrollReport.monthly.total_salary)}
                </div>
                <div className="kpi-label">Monthly Paycheck</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-value">{payrollReport.monthly.work_days}</div>
                <div className="kpi-label">Work Days</div>
              </div>
            </div>

            {/* Daily Payroll Table */}
            {payrollReport.days.length > 0 ? (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Hours</th>
                      <th>Quota</th>
                      <th>Deficit</th>
                      <th>100%</th>
                      <th>125%</th>
                      <th>150%</th>
                      <th>Rate</th>
                      <th>Daily Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollReport.days.map((day) => (
                      <tr key={day.work_date}>
                        <td className="mono">{day.work_date}</td>
                        <td className="mono">{round2(day.total_hours)}</td>
                        <td className="mono">{day.standard_daily_quota}</td>
                        <td className="mono" style={{ color: day.daily_deficit_hours > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                          {day.daily_deficit_hours > 0 ? `-${round2(day.daily_deficit_hours)}` : '0.00'}
                        </td>
                        <td className="mono">{round2(day.hours_100)}</td>
                        <td className="mono" style={{ color: day.hours_125 > 0 ? 'var(--amber)' : undefined }}>
                          {round2(day.hours_125)}
                        </td>
                        <td className="mono" style={{ color: day.hours_150 > 0 ? 'var(--red)' : undefined }}>
                          {round2(day.hours_150)}
                        </td>
                        <td className="mono">{day.applied_hourly_rate}</td>
                        <td className="mono" style={{ fontWeight: 600, color: 'var(--green)' }}>
                          {round2(day.gross_daily_salary)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals Row */}
                    <tr style={{ background: '#f0fdf4', fontWeight: 600 }}>
                      <td>TOTAL</td>
                      <td className="mono">{round2(payrollReport.monthly.total_hours)}</td>
                      <td></td>
                      <td className="mono" style={{ color: 'var(--red)' }}>
                        {payrollReport.monthly.total_deficit > 0 ? `-${round2(payrollReport.monthly.total_deficit)}` : '0.00'}
                      </td>
                      <td className="mono">{round2(payrollReport.monthly.total_hours_100)}</td>
                      <td className="mono">{round2(payrollReport.monthly.total_hours_125)}</td>
                      <td className="mono">{round2(payrollReport.monthly.total_hours_150)}</td>
                      <td></td>
                      <td className="mono" style={{ color: 'var(--green)', fontSize: '1rem' }}>
                        {round2(payrollReport.monthly.total_salary)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">No time entries found for this employee in {payrollMonth}.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
