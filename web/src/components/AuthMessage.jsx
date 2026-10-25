export function AuthMessage({ text, tone = 'error' }) {
  if (!text) return null;
  const info = tone === 'info';
  return (
    <p role={info ? 'status' : 'alert'} className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${info ? 'bg-blue-50 text-blue-800' : 'bg-red-50 text-red-800'}`}>
      {text}
    </p>
  );
}
