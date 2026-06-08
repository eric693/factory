import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const search = (q) => axios.get('/api/search', { params: { q } }).then(r => r.data);

const TYPE_LABEL = {
  order: { label: '訂單', color: 'bg-blue-100 text-blue-700' },
  workorder: { label: '工單', color: 'bg-indigo-100 text-indigo-700' },
  customer: { label: '客戶', color: 'bg-green-100 text-green-700' },
  product: { label: '產品', color: 'bg-amber-100 text-amber-700' },
  lot: { label: '批號', color: 'bg-purple-100 text-purple-700' },
  anomaly: { label: '異常', color: 'bg-red-100 text-red-700' },
};

export default function GlobalSearch({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      search(query).then(d => { setResults(d.results || []); setActiveIdx(0); setLoading(false); }).catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleSelect = (r) => {
    navigate(r.path);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIdx]) { handleSelect(results[activeIdx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-slate-400 shrink-0">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="flex-1 text-base outline-none placeholder-slate-400"
            placeholder="搜尋訂單、工單、客戶、產品、批號..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-brand-600 border-t-transparent shrink-0" />}
          <kbd className="hidden md:block text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-8">找不到「{query}」相關結果</div>
          )}
          {query.length < 2 && (
            <div className="text-sm text-slate-400 text-center py-8">輸入至少 2 個字開始搜尋</div>
          )}
          {results.map((r, i) => {
            const t = TYPE_LABEL[r.type] || { label: r.type, color: 'bg-slate-100 text-slate-600' };
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-50 last:border-0 ${i === activeIdx ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
              >
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${t.color}`}>{t.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{r.title}</div>
                  {r.sub && <div className="text-xs text-slate-400 truncate">{r.sub}</div>}
                </div>
                {r.meta && <span className="text-xs text-slate-400 shrink-0">{r.meta}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
