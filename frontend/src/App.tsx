import React, { useState, useEffect, useCallback } from 'react';
import { api, Employee, TimeEntry, DailyPayroll } from './api/client';
import AttendanceForm from './components/AttendanceForm';
import DayEntriesTable from './components/DayEntriesTable';
import PayrollSummary from './components/PayrollSummary';

export default function App() {
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
          <h1>EZTime</h1>
          <p>Attendance &amp; Daily Payroll Manager</p>
        </div>
      </header>

      <main className="app-main">
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
      </main>
    </div>
  );
}
