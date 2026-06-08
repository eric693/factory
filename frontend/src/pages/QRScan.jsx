import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import SOPViewer from './QRScanSOP';

const BASE = '/api';

function ProgressBar({ pct }) {
  return (
    <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function QRScan() {
  const { id } = useParams();
  const [wo, setWo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qty, setQty] = useState('');
  const [defect, setDefect] = useState('');
  const [operator, setOperator] = useState(() => localStorage.getItem('factory_operator') || '');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [showSOP, setShowSOP] = useState(false);

  useEffect(() => {
    axios.get(`${BASE}/wo/${id}/qr-data`)
      .then(r => { setWo(r.data); setLoading(false); })
      .catch(() => { setError('找不到此工單'); setLoading(false); });
  }, [id]);

  const handleSubmit = async () => {
    if (!qty || +qty <= 0) return;
    setSubmitting(true);
    try {
      localStorage.setItem('factory_operator', operator);
      const res = await axios.post(`${BASE}/wo/${id}/quick-progress`, {
        qty: +qty,
        defect_qty: +defect || 0,
        operator: operator || '匿名',
      });
      setResult(res.data);
      setSubmitted(true);
      setWo(prev => ({ ...prev, completed_qty: res.data.completed_qty, status: res.data.status }));
    } catch (e) {
      alert('送出失敗，請重試');
    }
    setSubmitting(false);
  };

  const pct = wo ? Math.min(100, Math.round((wo.completed_qty / wo.planned_qty) * 100)) : 0;
  const STATUS_LABEL = { pending: '待開工', scheduled: '已排程', in_progress: '生產中', completed: '已完工' };
  const STATUS_COLOR = { pending: 'text-amber-600', scheduled: 'text-blue-600', in_progress: 'text-indigo-600', completed: 'text-green-600' };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="card p-8 text-center max-w-sm w-full">
        <div className="text-4xl mb-3 text-slate-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-16 h-16 mx-auto">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div className="text-lg font-bold text-slate-700">{error}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-brand-950 text-white px-4 py-4">
        <div className="text-xs text-brand-400 font-semibold uppercase tracking-widest">FactoryOS</div>
        <div className="text-sm font-medium">掃碼報工</div>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-4">
        {/* 工單資訊 */}
        <div className="card p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-mono text-xs text-slate-400">{wo.wo_no}</div>
              <div className="text-lg font-bold text-slate-800 mt-0.5">{wo.product_name}</div>
              {wo.product_code && <div className="text-xs text-slate-400">{wo.product_code}</div>}
            </div>
            <div className={`text-sm font-semibold ${STATUS_COLOR[wo.status] || 'text-slate-500'}`}>
              {STATUS_LABEL[wo.status] || wo.status}
            </div>
          </div>
          {wo.customer_name && <div className="text-xs text-slate-400 mb-3">客戶：{wo.customer_name}</div>}

          {/* 進度 */}
          <div className="mb-2">
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-500">完工進度</span>
              <span className="font-bold text-brand-600">{pct}%</span>
            </div>
            <ProgressBar pct={pct} />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>完成 {wo.completed_qty}</span>
              <span>計畫 {wo.planned_qty}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50">
            <div>機台：{wo.machine_name || '-'}</div>
            <div>操作員：{wo.operator || '-'}</div>
          </div>
          {wo.product_id && (
            <button
              onClick={() => setShowSOP(true)}
              className="mt-3 w-full py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
            >
              查閱作業標準書 SOP
            </button>
          )}
        </div>

        {showSOP && wo.product_id && (
          <SOPViewer productId={wo.product_id} onClose={() => setShowSOP(false)} />
        )}

        {/* 報工表單 */}
        {wo.status === 'completed' ? (
          <div className="card p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} className="w-8 h-8"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="font-bold text-green-700 text-lg">此工單已完工</div>
          </div>
        ) : submitted && result ? (
          <div className="card p-6 text-center">
            <div className="w-16 h-16 bg-brand-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0e7de8" strokeWidth={2.5} className="w-8 h-8"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div className="font-bold text-brand-700 text-lg mb-1">回報成功</div>
            <div className="text-slate-500 text-sm mb-4">
              +{qty} 件 {+defect > 0 ? `（不良 ${defect} 件）` : ''}
            </div>
            <div className="mb-4">
              <ProgressBar pct={Math.min(100, Math.round((result.completed_qty / result.planned_qty) * 100))} />
              <div className="text-xs text-slate-400 mt-1 text-center">{result.completed_qty} / {result.planned_qty}</div>
            </div>
            {result.status === 'completed' ? (
              <div className="bg-green-50 rounded-xl p-3 text-green-700 font-semibold">工單完工</div>
            ) : (
              <button className="btn-secondary w-full" onClick={() => { setSubmitted(false); setQty(''); setDefect(''); }}>
                繼續回報
              </button>
            )}
          </div>
        ) : (
          <div className="card p-4 space-y-4">
            <div className="text-sm font-semibold text-slate-700">回報生產數量</div>

            <div>
              <label className="label">操作員姓名</label>
              <input className="input" value={operator} onChange={e => setOperator(e.target.value)} placeholder="你的名字" />
            </div>

            <div>
              <label className="label">完成數量</label>
              <input
                type="number" inputMode="numeric" min={1}
                className="input text-3xl font-bold text-center py-5"
                value={qty} onChange={e => setQty(e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label className="label">不良品數量（選填）</label>
              <input
                type="number" inputMode="numeric" min={0}
                className="input text-xl font-bold text-center py-3"
                value={defect} onChange={e => setDefect(e.target.value)}
                placeholder="0"
              />
            </div>

            <button
              className="btn-primary w-full py-4 text-lg"
              disabled={!qty || +qty <= 0 || submitting}
              onClick={handleSubmit}
            >
              {submitting ? '送出中...' : '確認回報'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
