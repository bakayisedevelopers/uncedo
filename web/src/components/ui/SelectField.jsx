export default function SelectField({ label, name, options, error, className = '', ...props }) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-semibold text-zinc-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        className={`w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/20 ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
