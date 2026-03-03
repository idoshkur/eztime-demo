import { useState, useEffect, useCallback } from 'react';
import { api, Employee, TimeEntry, DailyPayroll } from './api/client';
import AttendanceForm from './components/AttendanceForm';
import DayEntriesTable from './components/DayEntriesTable';
import PayrollSummary from './components/PayrollSummary';
import AdminUpload from './components/AdminUpload';
import AdminDashboard from './components/AdminDashboard';
import AdminEmployeeManager from './components/AdminEmployeeManager';
import AdminTimeEntryManager from './components/AdminTimeEntryManager';
import AdminInsights from './components/AdminInsights';

type View = 'employee' | 'admin';
type AdminSection = 'dashboard' | 'employees' | 'entries' | 'insights';

export default function App() {
  const [view, setView] = useState<View>('employee');
  const [adminSection, setAdminSection] = useState<AdminSection>('dashboard');
  const [employees, setEmployees]           = useState<Employee[]>([]);
  const [selectedEmployee, setEmployee]     = useState('');
  const [selectedDate, setDate]             = useState(() => new Date().toISOString().split('T')[0]);
  const [entries, setEntries]               = useState<TimeEntry[]>([]);
  const [payroll, setPayroll]               = useState<DailyPayroll | null>(null);
  const [loadingEmployees, setLoadingEmps]  = useState(true);
  const [dataError, setDataError]           = useState('');

  // Load employee list once on mount
  useEffect(() => {
    api
      .getEmployees()
      .then(setEmployees)
      .catch(() => setDataError('Could not load employees. Is the backend running?'))
      .finally(() => setLoadingEmps(false));
  }, []);

  // Refresh entries + payroll whenever employee or date changes
  const refreshData = useCallback(async () => {
    if (!selectedEmployee || !selectedDate) return;
    try {
      const [e, p] = await Promise.all([
        api.getTimeEntries(selectedEmployee, selectedDate),
        api.getDailyPayroll(selectedEmployee, selectedDate),
      ]);
      setEntries(e);
      setPayroll(p);
    } catch {
      // Non-fatal – keep stale data
    }
  }, [selectedEmployee, selectedDate]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const handleEmployeeChange = (id: string) => {
    setEmployee(id);
    setEntries([]);
    setPayroll(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="header-top">
            <div>
              <h1>EZTime</h1>
              <p>Attendance &amp; Daily Payroll Manager</p>
            </div>
          </div>
          <nav className="nav-tabs">
            <button
              className={`nav-tab${view === 'employee' ? ' nav-tab-active' : ''}`}
              onClick={() => setView('employee')}
            >
              Employee
            </button>
            <button
              className={`nav-tab${view === 'admin' ? ' nav-tab-active' : ''}`}
              onClick={() => setView('admin')}
            >
              Admin
            </button>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {view === 'employee' && (
          <>
            {dataError && <div className="alert alert-error">{dataError}</div>}

            {loadingEmployees ? (
              <div className="loading">Loading employees…</div>
            ) : (
              <>
                <AttendanceForm
                  employees={employees}
                  selectedEmployee={selectedEmployee}
                  selectedDate={selectedDate}
                  onEmployeeChange={handleEmployeeChange}
                  onDateChange={setDate}
                  onSaved={refreshData}
                />

                {selectedEmployee && selectedDate && (
                  <>
                    <DayEntriesTable entries={entries} />
                    <PayrollSummary payroll={payroll} />
                  </>
                )}
              </>
            )}
          </>
        )}

        {view === 'admin' && (
          <>
            <AdminUpload />

            <div className="admin-sub-nav">
              <button
                className={adminSection === 'dashboard' ? 'active' : ''}
                onClick={() => setAdminSection('dashboard')}
              >
                Dashboard
              </button>
              <button
                className={adminSection === 'employees' ? 'active' : ''}
                onClick={() => setAdminSection('employees')}
              >
                Manage Employees
              </button>
              <button
                className={adminSection === 'entries' ? 'active' : ''}
                onClick={() => setAdminSection('entries')}
              >
                Manage Time Entries
              </button>
              <button
                className={adminSection === 'insights' ? 'active' : ''}
                onClick={() => setAdminSection('insights')}
              >
                Insights
              </button>
            </div>

            {adminSection === 'dashboard' && <AdminDashboard />}
            {adminSection === 'employees' && <AdminEmployeeManager />}
            {adminSection === 'entries' && <AdminTimeEntryManager />}
            {adminSection === 'insights' && <AdminInsights />}
          </>
        )}
      </main>
    </div>
  );
}
