import React from 'react';
import { TimeEntry } from '../api/client';

interface Props {
  entries: TimeEntry[];
}

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

export default function DayEntriesTable({ entries }: Props) {
  return (
    <section className="card">
      <h2>Day Entries{entries.length > 0 ? ` (${entries.length})` : ''}</h2>
      {entries.length === 0 ? (
        <p className="empty-state">No entries recorded for this day.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Site</th>
                <th>Role</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={entry.id}>
                  <td className="muted">{idx + 1}</td>
                  <td>{entry.site_name}</td>
                  <td>{entry.role_name}</td>
                  <td className="mono">{entry.start_time}</td>
                  <td className="mono">{entry.end_time}</td>
                  <td className="mono">{formatDuration(entry.start_time, entry.end_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
