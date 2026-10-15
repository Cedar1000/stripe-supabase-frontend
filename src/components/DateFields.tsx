import { MONTHS, type DateDraft } from '../lib/dates';

/** Day / month / year inputs where only the year is required. */
export function DateFields({ legend, value, onChange, hint }: { legend: string; value: DateDraft; onChange: (v: DateDraft) => void; hint: string }) {
  return (
    <fieldset className="date-fields">
      <legend>{legend}</legend>
      <div className="date-row">
        <label>
          <span className="sr-only">Day</span>
          <input inputMode="numeric" placeholder="Day" value={value.day} maxLength={2}
            onChange={(e) => onChange({ ...value, day: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label>
          <span className="sr-only">Month</span>
          <select value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })}>
            <option value="">Month</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Year</span>
          <input inputMode="numeric" placeholder="Year" value={value.year} maxLength={4}
            onChange={(e) => onChange({ ...value, year: e.target.value.replace(/\D/g, '') })} />
        </label>
      </div>
      <p className="hint">{hint}</p>
    </fieldset>
  );
}
