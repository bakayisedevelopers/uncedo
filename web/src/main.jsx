import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { hasFirebaseEnv, missingFirebaseEnvKeys } from './firebase/config';

function FirebaseConfigErrorScreen() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <section className="w-full max-w-2xl rounded-2xl border border-red-400/30 bg-red-950/30 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-red-200">Configuration error</h1>
        <p className="mt-3 text-red-100">
          This production build is missing required Firebase environment variables and has been blocked to prevent
          accidental fallback to local mock mode.
        </p>
        <div className="mt-5">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-red-200">Missing variables</h2>
          <ul className="mt-2 list-disc list-inside text-sm text-red-100 space-y-1">
            {missingFirebaseEnvKeys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

const shouldBlockForFirebaseConfig = import.meta.env.PROD && !hasFirebaseEnv;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {shouldBlockForFirebaseConfig ? (
      <FirebaseConfigErrorScreen />
    ) : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>,
);
