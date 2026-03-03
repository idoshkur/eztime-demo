import { useState, useEffect } from 'react';
import { api, Employee, EmployeeOptions, AdminTimeEntry, ApiError } from '../api/client';
import TimeInput from './TimeInput';

function formatDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 24 * 60;
  const dur = e - s;
  const h = Math.floor(dur / 60);
  const m = dur % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function AdminTimeEntryManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<AdminTimeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    work_date: '', company_name: '', role_name: '', start_time: '', end_time: '',
  });
  const [editOptions, setEditOptions] = useState<EmployeeOptions | null>(null);
  const [saving, setSaving] = useState(false);

  const LIMIT = 25;

  useEffect(() => {
    api.getEmployees().then(setEmployees).catch(() => {});
  }, []);

  const fetchEntries = () => {
    setLoading(true);
    api
      .getAdminTimeEntries({
        employee_id: filterEmployee || undefined,
        page,
        limit: LIMIT,
      })
      .then((data) => {
        setEntries(data.entries);
        setTotal(data.total);
      })
      .catch(() => setMessage({ type: 'error', text: 'Failed to load time entries.' }))
      .finally(() => setLoading(false));
  };

  useEffect(fetchEntries, [page, filterEmployee]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleFilterChange = (empId: string) => {
    setFilterEmployee(empId);
    setPage(1);
    setEditingId(null);
  };

  const startEdit = async (entry: AdminTimeEntry) => {
    setEditingId(entry.id);
    setEditForm({
      work_date: entry.work_date,
      company_name: entry.company_name,
      role_name: entry.role_name,
      start_time: entry.start_time,
      end_time: entry.end_time,
    });
    setMessage(null);

    // Load allowed companies/roles for this employee
    try {
      const opts = await api.getEmployeeOptions(entry.employee_id);
      setEditOptions(opts);
    } catch {
      setEditOptions(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditOptions(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.updateTimeEntry(editingId, editForm);
      setMessage({ type: 'success', text: 'Time entry updated successfully.' });
      setEditingId(null);
      setEditOptions(null);
      fetchEntries();
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to update entry.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: AdminTimeEntry) => {
    const confirmed = window.confirm(
      `Delete time entry for ${entry.employee_name || entry.employee_id} on ${entry.work_date} (${entry.start_time}–${entry.end_time})?`,
    );
    if (!confirmed) return;

    setMessage(null);
    try {
      await api.deleteTimeEntry(entry.id);
      setMessage({ type: 'success', text: 'Time entry deleted.' });
      // If current page becomes empty, go back a page
      if (entries.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchEntries();
      }
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to delete entry.' });
    }
  };

  return (
    <section className="card">
      <h2>Manage Time Entries ({total})</h2>

      {/* Filter */}
      <div className="filter-bar">
        <label htmlFor="filter-emp">Filter by Employee:</label>
        <select
          id="filter-emp"
          value={filterEmployee}
          onChange={(e) => handleFilterChange(e.target.value)}
        >
          <option value="">All employees</option>
          {employees.map((emp) => (
            <option key={emp.employee_id} value={emp.employee_id}>
              {emp.full_name} ({emp.employee_id})
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
      )}

      {loading ? (
        <div className="loading">Loading entries…</div>
      ) : entries.length === 0 ? (
        <p className="empty-state">No time entries found.</p>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) =>
                  editingId === entry.id ? (
                    <tr key={entry.id}>
                      <td>
                        <input
                          type="date"
                          value={editForm.work_date}
                          onChange={(e) => setEditForm({ ...editForm, work_date: e.target.value })}
                        />
                      </td>
                      <td className="muted">{entry.employee_name || entry.employee_id}</td>
                      <td>
                        {editOptions && editOptions.allowed_companies.length > 0 ? (
                          <select
                            value={editForm.company_name}
                            onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                          >
                            {editOptions.allowed_companies.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={editForm.company_name}
                            onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                          />
                        )}
                      </td>
                      <td>
                        {editOptions && editOptions.allowed_roles.length > 0 ? (
                          <select
                            value={editForm.role_name}
                            onChange={(e) => setEditForm({ ...editForm, role_name: e.target.value })}
                          >
                            {editOptions.allowed_roles.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={editForm.role_name}
                            onChange={(e) => setEditForm({ ...editForm, role_name: e.target.value })}
                          />
                        )}
                      </td>
                      <td>
                        <TimeInput
                          id={`edit-start-${entry.id}`}
                          value={editForm.start_time}
                          onChange={(val) => setEditForm({ ...editForm, start_time: val })}
                        />
                      </td>
                      <td>
                        <TimeInput
                          id={`edit-end-${entry.id}`}
                          value={editForm.end_time}
                          onChange={(val) => setEditForm({ ...editForm, end_time: val })}
                        />
                      </td>
                      <td className="mono">
                        {editForm.start_time && editForm.end_time
                          ? formatDuration(editForm.start_time, editForm.end_time)
                          : '—'}
                      </td>
                      <td>
                        <div className="action-group">
                          <button className="btn-icon btn-save" onClick={saveEdit} disabled={saving}>
                            {saving ? '…' : 'Save'}
                          </button>
                          <button className="btn-icon btn-cancel" onClick={cancelEdit} disabled={saving}>
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id}>
                      <td className="mono">{entry.work_date}</td>
                      <td>{entry.employee_name || entry.employee_id}</td>
                      <td>{entry.company_name}</td>
                      <td>{entry.role_name}</td>
                      <td className="mono">{entry.start_time}</td>
                      <td className="mono">{entry.end_time}</td>
                      <td className="mono">{formatDuration(entry.start_time, entry.end_time)}</td>
                      <td>
                        <div className="action-group">
                          <button className="btn-icon btn-edit" onClick={() => startEdit(entry)}>Edit</button>
                          <button className="btn-icon btn-delete" onClick={() => handleDelete(entry)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button
              className="btn-icon"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              className="btn-icon"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
