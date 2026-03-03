import { useState, useEffect } from 'react';
import { api, AdminEmployee, Rate, ApiError } from '../api/client';

export default function AdminEmployeeManager() {
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create employee form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    employee_id: '', full_name: '', status: 'active', standard_daily_quota: 8,
    companiesInput: '', rolesInput: '',
  });
  const [creating, setCreating] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', status: '', standard_daily_quota: 0 });
  const [saving, setSaving] = useState(false);

  // Rate management
  const [ratesFor, setRatesFor] = useState<string | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [newRate, setNewRate] = useState({ company_name: '', role_name: '', hourly_rate: 0 });
  const [editingRate, setEditingRate] = useState<string | null>(null); // "company|role" key
  const [editRateValue, setEditRateValue] = useState(0);

  const refresh = () => {
    setLoading(true);
    api
      .getAdminEmployees()
      .then(setEmployees)
      .catch(() => setError('Failed to load employees.'))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  // ── Create employee ─────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreating(true);
    setMessage(null);
    const companies = createForm.companiesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const roles = createForm.rolesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      await api.createEmployee({
        employee_id: createForm.employee_id.trim(),
        full_name: createForm.full_name.trim(),
        status: createForm.status,
        standard_daily_quota: createForm.standard_daily_quota,
        allowed_companies: companies,
        allowed_roles: roles,
      });
      setMessage({ type: 'success', text: `Employee "${createForm.employee_id}" created.` });
      setCreateForm({ employee_id: '', full_name: '', status: 'active', standard_daily_quota: 8, companiesInput: '', rolesInput: '' });
      setShowCreate(false);
      refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to create employee.' });
    } finally {
      setCreating(false);
    }
  };

  // ── Inline edit ─────────────────────────────────────────────────────────────

  const startEdit = (emp: AdminEmployee) => {
    setEditingId(emp.employee_id);
    setEditForm({
      full_name: emp.full_name,
      status: emp.status,
      standard_daily_quota: emp.standard_daily_quota,
    });
    setMessage(null);
  };

  const cancelEdit = () => setEditingId(null);

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
      if (ratesFor === emp.employee_id) setRatesFor(null);
      refresh();
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to delete employee.' });
    }
  };

  // ── Rate management ─────────────────────────────────────────────────────────

  const toggleRates = async (employeeId: string) => {
    if (ratesFor === employeeId) {
      setRatesFor(null);
      return;
    }
    setRatesFor(employeeId);
    setRatesLoading(true);
    setEditingRate(null);
    setNewRate({ company_name: '', role_name: '', hourly_rate: 0 });
    try {
      const data = await api.getRates(employeeId);
      setRates(data);
    } catch {
      setRates([]);
    } finally {
      setRatesLoading(false);
    }
  };

  const handleAddRate = async () => {
    if (!ratesFor || !newRate.company_name.trim() || !newRate.role_name.trim() || newRate.hourly_rate <= 0) return;
    setMessage(null);
    try {
      await api.createRate({
        employee_id: ratesFor,
        company_name: newRate.company_name.trim(),
        role_name: newRate.role_name.trim(),
        hourly_rate: newRate.hourly_rate,
      });
      setNewRate({ company_name: '', role_name: '', hourly_rate: 0 });
      const data = await api.getRates(ratesFor);
      setRates(data);
      setMessage({ type: 'success', text: 'Rate added.' });
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to add rate.' });
    }
  };

  const handleUpdateRate = async (rate: Rate) => {
    if (editRateValue <= 0) return;
    setMessage(null);
    try {
      await api.updateRate({ ...rate, hourly_rate: editRateValue });
      setEditingRate(null);
      const data = await api.getRates(rate.employee_id);
      setRates(data);
      setMessage({ type: 'success', text: 'Rate updated.' });
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to update rate.' });
    }
  };

  const handleDeleteRate = async (rate: Rate) => {
    if (!window.confirm(`Delete rate for ${rate.company_name} / ${rate.role_name}?`)) return;
    setMessage(null);
    try {
      await api.deleteRate({
        employee_id: rate.employee_id,
        company_name: rate.company_name,
        role_name: rate.role_name,
      });
      const data = await api.getRates(rate.employee_id);
      setRates(data);
      setMessage({ type: 'success', text: 'Rate deleted.' });
    } catch (err) {
      const apiErr = err as ApiError;
      setMessage({ type: 'error', text: apiErr?.error?.message ?? 'Failed to delete rate.' });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="loading">Loading employees...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Manage Employees ({employees.length})</h2>
        <button
          className={showCreate ? 'btn-secondary' : 'btn-primary'}
          onClick={() => { setShowCreate(!showCreate); setMessage(null); }}
        >
          {showCreate ? 'Cancel' : '+ New Employee'}
        </button>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '1rem' }}>{message.text}</div>
      )}

      {/* ── Create Employee Form ─────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', marginBottom: '1.25rem', background: '#f8fafc' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>Create New Employee</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Employee ID</label>
              <input
                type="text"
                placeholder="e.g. EMP-051"
                value={createForm.employee_id}
                onChange={(e) => setCreateForm({ ...createForm, employee_id: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="e.g. John Smith"
                value={createForm.full_name}
                onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div className="form-group">
              <label>Daily Quota (hours)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={createForm.standard_daily_quota}
                onChange={(e) => setCreateForm({ ...createForm, standard_daily_quota: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="form-group form-full">
              <label>Allowed Companies (comma-separated)</label>
              <input
                type="text"
                placeholder="e.g. Acme Corp, Beta Inc"
                value={createForm.companiesInput}
                onChange={(e) => setCreateForm({ ...createForm, companiesInput: e.target.value })}
              />
            </div>
            <div className="form-group form-full">
              <label>Allowed Roles (comma-separated)</label>
              <input
                type="text"
                placeholder="e.g. Developer, QA Tester"
                value={createForm.rolesInput}
                onChange={(e) => setCreateForm({ ...createForm, rolesInput: e.target.value })}
              />
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn-primary"
              disabled={creating || !createForm.employee_id.trim() || !createForm.full_name.trim()}
              onClick={handleCreate}
            >
              {creating ? 'Creating...' : 'Create Employee'}
            </button>
          </div>
        </div>
      )}

      {/* ── Employee Table ───────────────────────────────────────────────────── */}
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
            {employees.map((emp) => (
              <>
                {editingId === emp.employee_id ? (
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
                          {saving ? '...' : 'Save'}
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
                        <button
                          className="btn-icon"
                          style={{ color: 'var(--amber)', borderColor: 'var(--amber)' }}
                          onClick={() => toggleRates(emp.employee_id)}
                        >
                          {ratesFor === emp.employee_id ? 'Hide Rates' : 'Rates'}
                        </button>
                        <button className="btn-icon btn-delete" onClick={() => handleDelete(emp)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* ── Rates sub-row ─────────────────────────────────────────────── */}
                {ratesFor === emp.employee_id && (
                  <tr key={`${emp.employee_id}-rates`}>
                    <td colSpan={6} style={{ padding: '0.75rem', background: '#fefce8' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                        Rates for {emp.full_name}
                      </div>

                      {ratesLoading ? (
                        <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Loading rates...</div>
                      ) : (
                        <>
                          {rates.length > 0 && (
                            <table style={{ marginBottom: '0.75rem', fontSize: '0.82rem' }}>
                              <thead>
                                <tr>
                                  <th>Company</th>
                                  <th>Role</th>
                                  <th>Hourly Rate</th>
                                  <th>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rates.map((rate) => {
                                  const rateKey = `${rate.company_name}|${rate.role_name}`;
                                  return editingRate === rateKey ? (
                                    <tr key={rateKey}>
                                      <td>{rate.company_name}</td>
                                      <td>{rate.role_name}</td>
                                      <td>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={editRateValue}
                                          onChange={(e) => setEditRateValue(parseFloat(e.target.value) || 0)}
                                          style={{ width: '80px' }}
                                        />
                                      </td>
                                      <td>
                                        <div className="action-group">
                                          <button className="btn-icon btn-save" onClick={() => handleUpdateRate(rate)}>Save</button>
                                          <button className="btn-icon btn-cancel" onClick={() => setEditingRate(null)}>Cancel</button>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : (
                                    <tr key={rateKey}>
                                      <td>{rate.company_name}</td>
                                      <td>{rate.role_name}</td>
                                      <td className="mono">{rate.hourly_rate}</td>
                                      <td>
                                        <div className="action-group">
                                          <button
                                            className="btn-icon btn-edit"
                                            onClick={() => { setEditingRate(rateKey); setEditRateValue(rate.hourly_rate); }}
                                          >
                                            Edit
                                          </button>
                                          <button className="btn-icon btn-delete" onClick={() => handleDeleteRate(rate)}>Delete</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}

                          {rates.length === 0 && (
                            <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>No rates defined yet.</p>
                          )}

                          {/* Add rate form */}
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: '1', minWidth: '120px' }}>
                              <label>Company</label>
                              <input
                                type="text"
                                placeholder="Company"
                                value={newRate.company_name}
                                onChange={(e) => setNewRate({ ...newRate, company_name: e.target.value })}
                              />
                            </div>
                            <div className="form-group" style={{ flex: '1', minWidth: '120px' }}>
                              <label>Role</label>
                              <input
                                type="text"
                                placeholder="Role"
                                value={newRate.role_name}
                                onChange={(e) => setNewRate({ ...newRate, role_name: e.target.value })}
                              />
                            </div>
                            <div className="form-group" style={{ width: '100px' }}>
                              <label>Hourly Rate</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={newRate.hourly_rate || ''}
                                onChange={(e) => setNewRate({ ...newRate, hourly_rate: parseFloat(e.target.value) || 0 })}
                              />
                            </div>
                            <button
                              className="btn-primary"
                              style={{ padding: '0.52rem 1rem', fontSize: '0.82rem', marginBottom: '0.3rem' }}
                              disabled={!newRate.company_name.trim() || !newRate.role_name.trim() || newRate.hourly_rate <= 0}
                              onClick={handleAddRate}
                            >
                              + Add Rate
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
