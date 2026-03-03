import React, { useState } from 'react';
import { api, UploadSummary, ApiError } from '../api/client';

export default function AdminUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadSummary | null>(null);
  const [error, setError] = useState('');

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError('');

    try {
      const data = await api.uploadExcel(file);
      setResult(data.summary);
      setFile(null);
      // Reset file input
      const input = document.getElementById('excel-file') as HTMLInputElement;
      if (input) input.value = '';
    } catch (err) {
      const apiErr = err as ApiError;
      setError(apiErr?.error?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="card">
      <h2>Upload Excel Data</h2>
      <form onSubmit={handleUpload} className="upload-form">
        <div className="upload-row">
          <input
            id="excel-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading…' : 'Upload & Import'}
          </button>
        </div>
      </form>

      {error && (
        <div className="alert alert-error" style={{ marginTop: '1rem' }}>{error}</div>
      )}

      {result && (
        <div className="upload-result">
          <div className="summary-section">
            <h3>Employees</h3>
            <div className="stat-row"><span>Inserted</span><strong>{result.employees.inserted}</strong></div>
            <div className="stat-row"><span>Updated</span><strong>{result.employees.updated}</strong></div>
            <div className="stat-row"><span>Skipped</span><strong>{result.employees.skipped}</strong></div>
          </div>

          <div className="summary-section">
            <h3>Rates</h3>
            <div className="stat-row"><span>Inserted</span><strong>{result.rates.inserted}</strong></div>
            <div className="stat-row"><span>Updated</span><strong>{result.rates.updated}</strong></div>
            <div className="stat-row"><span>Skipped</span><strong>{result.rates.skipped}</strong></div>
          </div>

          <div className="summary-section">
            <h3>Time Entries</h3>
            <div className="stat-row"><span>Inserted</span><strong>{result.timeEntries.inserted}</strong></div>
            <div className="stat-row"><span>Duplicates (skipped)</span><strong>{result.timeEntries.duplicates}</strong></div>
            <div className="stat-row"><span>Skipped (no match)</span><strong>{result.timeEntries.skipped}</strong></div>
          </div>

          {result.warnings.length > 0 && (
            <div className="summary-section">
              <h3>Warnings ({result.warnings.length})</h3>
              <div className="warnings-list">
                {result.warnings.slice(0, 20).map((w, i) => (
                  <div key={i} className="stat-row"><span>{w}</span></div>
                ))}
                {result.warnings.length > 20 && (
                  <div className="stat-row muted">…and {result.warnings.length - 20} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
