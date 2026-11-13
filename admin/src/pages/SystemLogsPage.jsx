import { useEffect, useState, useMemo } from 'react';
import { Terminal, RefreshCw, Trash2, Search, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { getFirebaseClients } from '../firebase/config';
import { collection, query, orderBy, limit, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';

export default function SystemLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const clients = await getFirebaseClients();
      if (!clients || !clients.db) {
        setLogs([
          { id: 'mock-1', level: 'info', message: 'Admin frontend initialized successfully.', path: '/dashboard', clientTimestamp: new Date().toISOString() },
          { id: 'mock-2', level: 'warn', message: 'Firebase emulators not connected in development mode.', path: '/dashboard', clientTimestamp: new Date().toISOString() },
          { id: 'mock-3', level: 'error', message: 'Sample frontend error captured for demonstration.', path: '/support', clientTimestamp: new Date().toISOString() },
        ]);
        setLoading(false);
        return;
      }

      const q = query(collection(clients.db, 'adminFrontendLogs'), orderBy('clientTimestamp', 'desc'), limit(150));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      }));
      setLogs(items);
    } catch (err) {
      console.error('Failed to fetch frontend logs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filterLevel !== 'all' && log.level !== filterLevel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchMsg = (log.message || '').toLowerCase().includes(q);
        const matchPath = (log.path || '').toLowerCase().includes(q);
        if (!matchMsg && !matchPath) return false;
      }
      return true;
    });
  }, [logs, filterLevel, searchQuery]);

  const clearAllLogs = async () => {
    if (!window.confirm('Clear all stored frontend console logs?')) return;
    try {
      const clients = await getFirebaseClients();
      if (clients && clients.db) {
        const snapshot = await getDocs(collection(clients.db, 'adminFrontendLogs'));
        const batch = writeBatch(clients.db);
        snapshot.docs.forEach(d => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }
      setLogs([]);
    } catch (err) {
      alert('Failed to clear logs: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-xl bg-brand/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-soft">
            <Terminal className="h-4 w-4" />
            <span>Frontend Console Logs</span>
          </div>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">Browser & Console Activity</h3>
          <p className="mt-1 text-sm text-ink-200">
            Real-time console logs, warnings, and errors captured from the admin web app frontend and synced to Firestore.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchLogs}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={clearAllLogs}
            className="inline-flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Clear logs
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
          {['all', 'info', 'warn', 'error'].map(lvl => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilterLevel(lvl)}
              className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                filterLevel === lvl
                  ? 'bg-brand text-white shadow-md'
                  : 'bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="relative min-w-[260px]">
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-ink-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search logs by message or path..."
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white placeholder-ink-400 focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-[24px] border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Error loading logs: {error}
        </div>
      ) : null}

      {/* Logs Table / List */}
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 backdrop-blur">
        {loading && logs.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-300">Loading frontend logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-300">No logs found matching your criteria.</div>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredLogs.map(log => {
              const isError = log.level === 'error';
              const isWarn = log.level === 'warn';
              return (
                <div key={log.id || Math.random()} className="flex flex-col gap-2 p-4 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      isError ? 'bg-red-500/20 text-red-300' : isWarn ? 'bg-amber-500/20 text-amber-300' : 'bg-brand/20 text-brand-soft'
                    }`}>
                      {isError ? <AlertCircle className="h-4 w-4" /> : isWarn ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest ${
                          isError ? 'bg-red-500/20 text-red-300' : isWarn ? 'bg-amber-500/20 text-amber-300' : 'bg-brand/20 text-brand-soft'
                        }`}>
                          {log.level || 'info'}
                        </span>
                        {log.path ? (
                          <span className="rounded-lg bg-white/5 px-2 py-0.5 font-mono text-[11px] text-ink-300">
                            {log.path}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-xs text-white break-all">{log.message}</p>
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-ink-400 shrink-0">
                    {log.clientTimestamp ? new Date(log.clientTimestamp).toLocaleTimeString() : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
