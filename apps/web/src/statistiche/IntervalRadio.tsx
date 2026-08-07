import type { IntervalValue } from '@gc/shared-types';

export type IntervalOption = { value: IntervalValue; label: string };

type Props = {
  legend: string;
  options: IntervalOption[];
  value: IntervalValue;
  onChange: (value: IntervalValue) => void;
};

// Legacy markup: <fieldset class="fieldset"><legend class="legend"> + inline radios.
// The legend's light/dark background was an ngClass on themeService in Angular;
// Bootstrap 5.3's theme-aware `bg-body` does the same job under data-bs-theme.
export const IntervalRadio = ({ legend, options, value, onChange }: Props) => (
  <fieldset className="fieldset">
    <legend className="legend bg-body">{legend}</legend>
    <div className="pt-1 text-center">
      {options.map((o) => (
        <div className="form-check form-check-inline" key={o.value}>
          <input
            type="radio"
            className="form-check-input"
            id={`intervallo-${o.value}`}
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <label className="form-check-label" htmlFor={`intervallo-${o.value}`}>
            {o.label}
          </label>
        </div>
      ))}
    </div>
  </fieldset>
);
