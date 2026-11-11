interface FormFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}

/** A labelled input whose hint and error are announced through aria-describedby. */
export function FormField({ id, label, type, autoComplete, value, onChange, error, hint }: FormFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 aria-[invalid=true]:border-red-600"
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
