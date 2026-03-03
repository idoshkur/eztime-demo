import React, { useState, useEffect } from 'react';
import { api, Employee, EmployeeOptions, ApiError } from '../api/client';

interface Props {
  employees: Employee[];
  selectedEmployee: string;
  selectedDate: string;
  onEmployeeChange: (id: string) => void;
  onDateChange: (date: string) => void;
  onSaved: () => void;
}

export default function AttendanceForm({
  employees,
  selectedEmployee,
  selectedDate,
  onEmployeeChange,
  onDateChange,
  onSaved,
}: Props) {
  const [options, setOptions] = useState<EmployeeOptions>({ allowed_sites: [], allowed_roles: [] });
  const [site, setSite] = useState('');
  const [role, setRole] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reload options when employee changes
  useEffect(() => {
    if (!selectedEmployee) {
      setOptions({ allowed_sites: [], allowed_roles: [] });
      return;
    }
    api
      .getEmployeeOptions(selectedEmployee)
      .then(setOptions)
      .catch(() => setOptions({ allowed_sites: [], allowed_roles: [] }));
    setSite('');
    setRole('');
  }, [selectedEmployee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.createTimeEntry({
        employee_id: selectedEmployee,
        work_date:   selectedDate,
        site_name:   site,
        role_name:   role,
        start_time:  startTime,
        end_time:    endTime,
      });
      setMessage({ type: 'success', text: 'Entry saved successfully.' });
      setStartTime('');
      setEndTime('');
      onSaved();
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to save entry.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <h2>Add Attendance Entry</h2>
      <form onSubmit={handleSubmit} className="form-grid">

        {/* Employee */}
        <div className="form-group">
          <label htmlFor="emp-select">Employee</label>
          <select
            id="emp-select"
            value={selectedEmployee}
            onChange={(e) => onEmployeeChange(e.target.value)}
            required
          >
            <option value="">— Select employee —</option>
            {employees.map((emp) => (
              <option key={emp.employee_id} value={emp.employee_id}>
                {emp.full_name} ({emp.employee_id})
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="form-group">
          <label htmlFor="work-date">Date</label>
          <input
            id="work-date"
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            required
          />
        </div>

        {/* Site */}
        <div className="form-group">
          <label htmlFor="site-field">Site</label>
          {options.allowed_sites.length > 0 ? (
            <select
              id="site-field"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              required
            >
              <option value="">— Select site —</option>
              {options.allowed_sites.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <input
              id="site-field"
              type="text"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="e.g. Main Office"
              required
            />
          )}
        </div>

        {/* Role */}
        <div className="form-group">
          <label htmlFor="role-field">Role</label>
          {options.allowed_roles.length > 0 ? (
            <select
              id="role-field"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              required
            >
              <option value="">— Select role —</option>
              {options.allowed_roles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          ) : (
            <input
              id="role-field"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Security Guard"
              required
            />
          )}
        </div>

        {/* Start time */}
        <div className="form-group">
          <label htmlFor="start-time">Start Time</label>
          <input
            id="start-time"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>

        {/* End time */}
        <div className="form-group">
          <label htmlFor="end-time">End Time</label>
          <input
            id="end-time"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>

        {/* Submit */}
        <div className="form-group form-full">
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !selectedEmployee || !selectedDate}
          >
            {saving ? 'Saving…' : 'Save Entry'}
          </button>
        </div>

        {/* Feedback */}
        {message && (
          <div className={`form-full alert alert-${message.type}`} role="alert">
            {message.text}
          </div>
        )}
      </form>
    </section>
  );
}
