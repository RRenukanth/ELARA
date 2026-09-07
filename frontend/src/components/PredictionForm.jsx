import { useState } from "react";
import { FEATURE_FIELDS } from "../utils/featureContract.js";

const initialValues = FEATURE_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: "" }), {});

export default function PredictionForm({ onSubmit, isSubmitting }) {
  const [values, setValues] = useState(initialValues);

  function update(key) {
    return (e) => setValues((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const payload = {};
    for (const field of FEATURE_FIELDS) {
      payload[field.key] = Number(values[field.key]);
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {FEATURE_FIELDS.map((field) => (
        <div key={field.key}>
          <label className="label">{field.label}</label>
          {field.type === "select" ? (
            <select className="input-field" value={values[field.key]} onChange={update(field.key)} required>
              <option value="">Select</option>
              {field.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              step={field.step || "1"}
              min={field.min}
              max={field.max}
              className="input-field"
              value={values[field.key]}
              onChange={update(field.key)}
              placeholder={field.help}
              required
            />
          )}
        </div>
      ))}

      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Analyzing..." : "Get Risk Assessment"}
        </button>
      </div>
    </form>
  );
}
