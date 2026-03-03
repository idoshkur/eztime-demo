import { useState, useEffect } from 'react';
import { api, AdminEmployee, ApiError } from '../api/client';

export default function AdminEmployeeManager() {
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', status: '', standard_daily_quota: 0 });
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    setLoading(true);
    api
      .getAdminEmployees()
      .then(setEmployees)
      .catch(() => setError('Failed to load employees.'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const startEdit = (emp: AdminEmployee) => {
    setEditingId(emp.employee_id);
    setEditForm({
      full_name: emp.full_name,
      status: emp.status,
      standard_daily_quota: emp.standard_daily_quota,
    });
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.updateEmployee(editingId, editForm);
      setMessage({ type: 'success', text: 'Employee updated successfully.' });
      setEditingId(null);
      refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to update employee.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (emp: AdminEmployee) => {
    const confirmed = window.confirm(
      `Delete employee "${emp.full_name}" (${emp.employee_id})?\n\nThis will also delete all their time entries, rates, and permissions. This action cannot be undone.`,
    );
    if (!confirmed) return;

    setMessage(null);
    try {
      const result = await api.deleteEmployee(emp.employee_id);
      setMessage({
        type: 'success',
        text: `Deleted ${emp.full_name}. Removed ${result.deleted.time_entries} entries, ${result.deleted.rates} rates.`,
      });
      refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to delete employee.' });
    }
  };

  if (loading) return <div className="loading">Loading employees…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <section className="card">
      <h2>Manage Employees ({employees.length})</h2>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
      )}

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Status</th>
              <th>Daily Quota</th>
              <th>Entries</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) =>
              editingId === emp.employee_id ? (
                <tr key={emp.employee_id}>
                  <td>
                    <input
                      type="text"
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                    />
                  </td>
                  <td className="muted mono">{emp.employee_id}</td>
                  <td>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={editForm.standard_daily_quota}
                      onChange={(e) => setEditForm({ ...editForm, standard_daily_quota: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="mono">{emp.entry_count}</td>
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
                <tr key={emp.employee_id}>
                  <td>{emp.full_name}</td>
                  <td className="muted mono">{emp.employee_id}</td>
                  <td>
                    <span className={emp.status === 'active' ? 'status-active' : 'status-inactive'}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="mono">{emp.standard_daily_quota}</td>
                  <td className="mono">{emp.entry_count}</td>
                  <td>
                    <div className="action-group">
                      <button className="btn-icon btn-edit" onClick={() => startEdit(emp)}>Edit</button>
                      <button className="btn-icon btn-delete" onClick={() => handleDelete(emp)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
