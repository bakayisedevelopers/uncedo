import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export default function MultiSelectDropdown({
  label,
  name,
  options = [],
  value = [],
  onChange,
  helperText,
  required = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedValues = Array.isArray(value) ? value : [];
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label)
    .join(', ');

  const toggleValue = (optionValue) => {
    const next = selectedSet.has(optionValue)
      ? selectedValues.filter((item) => item !== optionValue)
      : [...selectedValues, optionValue];
    onChange?.(next);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`space-y-1 ${isOpen ? 'relative z-[100]' : ''}`}>
      <label className="block text-sm font-semibold text-zinc-700">{label}</label>
      <input type="hidden" name={name} value={selectedValues.join(',')} required={required && !selectedValues.length} />
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-800"
        >
          <span className="truncate">{selectedLabels || 'Select subject(s)'}</span>
          <ChevronDown className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen ? (
          <div className="absolute z-[120] mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleValue(option.value);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-zinc-50 ${
                  selectedSet.has(option.value) ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-800'
                }`}
              >
                <span>{option.label}</span>
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded border ${
                    selectedSet.has(option.value)
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-zinc-300 bg-white text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-zinc-500">{helperText}</p> : null}
    </div>
  );
}
