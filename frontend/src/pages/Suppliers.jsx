import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getSuppliers = () => api.get('/suppliers').then(r => r.data);
const getPerformance = (id) => api.get(`/suppliers/${id}/performance`).then(r => r.data);
const getEvaluations = (id) => api.get(`/suppliers/${id}/evaluations`).then(r => r.data);
const createSupplier = (data) => api.post('/suppliers', data).then(r => r.data);
const updateSupplier = (id, data) => api.patch(`/suppliers/${id}`, data).then(r => r.data);
const deleteSupplier = (id) => api.delete(`/suppliers/${id}`).then(r => r.data);
const addEvaluation = (id, data) => api.post(`/suppliers/${id}/evaluate`, data).then(r => r.data);

function StarRating({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} viewBox="0 0 24 24" fill={i <= value ? '#f59e0b' : 'none'} stroke={i <= value ? '#f59e0b' : '#d1d5db'} strokeWidth={1.5} className="w-4 h-4">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ))}
    </div>
  );
}

function SupplierDetail({ supplierId, onClose }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['supplier-perf', supplierId], queryFn: () => getPerformance(supplierId) });
  const { data: evals = [] } = useQuery({ queryKey: ['supplier-evals', supplierId], queryFn: () => getEvaluations(supplierId) });
  const [evalForm, setEvalForm] = useState({ period: dayjs().format('YYYY-MM'), delivery_score: 100, quality_score: 100, price_score: 100, note: '' });
  const [showEval, setShowEval] = useState(false);

  const evalMut = useMutation({
    mutationFn: () => addEvaluation(supplierId, evalForm),
    onSuccess: () => { qc.invalidateQueries(['supplier-perf']); qc.invalidateQueries(['supplier-evals']); qc.invalidateQueries(['suppliers']); setShowEval(false); },
  });

  if (isLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const { supplier, pos = [], stats } = data || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800 text-lg">{supplier?.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating value={supplier?.rating || 3} />
              <span className="text-xs text-slate-400">{supplier?.code}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowEval(true)} className="btn-secondary text-xs">新增評鑑</button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 聯絡 */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[{ l: '聯絡人', v: supplier?.contact }, { l: '電話', v: supplier?.phone }, { l: '付款條件', v: supplier?.payment_terms }, { l: '交貨天數', v: supplier?.lead_days ? `${supplier.lead_days} 天` : '-' }].map(item => item.v && (
              <div key={item.l} className="bg-slate-50 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-0.5">{item.l}</div>
                <div className="font-medium text-slate-700">{item.v}</div>
              </div>
            ))}
          </div>

          {/* 績效 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[{ l: '採購次數', v: stats?.total_orders || 0 }, { l: '到貨率', v: stats?.delivery_rate !== null ? `${stats.delivery_rate}%` : '-' }, { l: '總採購額', v: stats?.total_spend ? `${Math.round(stats.total_spend / 1000)}K` : '-' }].map(item => (
              <div key={item.l} className="card p-3">
                <div className="font-bold text-slate-800">{item.v}</div>
                <div className="text-xs text-slate-400">{item.l}</div>
              </div>
            ))}
          </div>

          {/* 評鑑記錄 */}
          {evals.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">評鑑記錄</div>
              <div className="space-y-2">
                {evals.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                    <div>
                      <div className="font-medium text-slate-700 text-sm">{e.period}</div>
                      <div className="text-xs text-slate-400">交期 {e.delivery_score} · 品質 {e.quality_score} · 價格 {e.price_score}</div>
                    </div>
                    <div className={`text-lg font-bold ${e.total_score >= 80 ? 'text-green-600' : e.total_score >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{e.total_score}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 採購歷史 */}
          {pos.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">採購歷史</div>
              <div className="space-y-1.5">
                {pos.slice(0, 10).map(po => (
                  <div key={po.id} className="flex justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-slate-600">{po.po_no}</span>
                    <span className="font-medium text-slate-700">{(po.total_amount || 0).toLocaleString()} 元</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 評鑑表單 */}
        {showEval && (
          <div className="border-t border-slate-100 px-5 py-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="font-semibold text-slate-800">新增供應商評鑑</div>
            <div>
              <label className="label">評鑑期別</label>
              <input type="month" className="input" value={evalForm.period} onChange={e => setEvalForm(f => ({ ...f, period: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[{ key: 'delivery_score', label: '交期 (50%)' }, { key: 'quality_score', label: '品質 (30%)' }, { key: 'price_score', label: '價格 (20%)' }].map(item => (
                <div key={item.key}>
                  <label className="label text-xs">{item.label}</label>
                  <input type="number" min={0} max={100} className="input text-center font-bold" value={evalForm[item.key]} onChange={e => setEvalForm(f => ({ ...f, [item.key]: +e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="text-center text-sm text-slate-600">
              加權總分：<strong>{Math.round(evalForm.delivery_score * 0.5 + evalForm.quality_score * 0.3 + evalForm.price_score * 0.2)}</strong>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => setShowEval(false)}>取消</button>
              <button className="btn-primary flex-1" onClick={() => evalMut.mutate()} disabled={evalMut.isPending}>{evalMut.isPending ? '儲存中...' : '儲存評鑑'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SupplierForm({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', contact: '', phone: '', email: '', address: '', payment_terms: '月結30天', lead_days: 7, note: '' });

  const mut = useMutation({
    mutationFn: () => createSupplier(form),
    onSuccess: () => { qc.invalidateQueries(['suppliers']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">供應商代碼 *</label><input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="S001" /></div>
        <div><label className="label">供應商名稱 *</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">聯絡人</label><input className="input" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
        <div><label className="label">電話</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
      </div>
      <div><label className="label">Email</label><input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
      <div><label className="label">地址</label><input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">付款條件</label><input className="input" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} /></div>
        <div><label className="label">交貨天數</label><input type="number" min={1} className="input" value={form.lead_days} onChange={e => setForm(f => ({ ...f, lead_days: +e.target.value }))} /></div>
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.code || !form.name || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立供應商'}
      </button>
    </div>
  );
}

export default function Suppliers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: getSuppliers });
  const deleteMut = useMutation({ mutationFn: deleteSupplier, onSuccess: () => qc.invalidateQueries(['suppliers']) });

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">供應商管理</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增供應商
        </button>
      </div>

      <input className="input" placeholder="搜尋供應商名稱、代碼..." value={search} onChange={e => setSearch(e.target.value)} />

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無供應商資料</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedId(s.id)}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 truncate">{s.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">{s.code}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StarRating value={s.rating || 3} />
                    <span className="text-xs text-slate-400">{s.po_count} 筆採購 · {(s.po_total || 0).toLocaleString()} 元</span>
                  </div>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-300 shrink-0">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">新增供應商</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4"><SupplierForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {selectedId && <SupplierDetail supplierId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
