import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getFAIs = (status) => api.get('/fai', { params: status ? { status } : {} }).then(r => r.data);
const getFAI = (id) => api.get(`/fai/${id}`).then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const createFromSPC = (product_id, data) => api.post(`/fai/from-spc/${product_id}`, data).then(r => r.data);
const updateItems = (id, results) => api.patch(`/fai/${id}/items`, { results }).then(r => r.data);
const approveFAI = (id, data) => api.patch(`/fai/${id}/approve`, data).then(r => r.data);
const deleteFAI = (id) => api.delete(`/fai/${id}`).then(r => r.data);

const STATUS = {
  pending:  { label: '待確認', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '核准', color: 'bg-green-100 text-green-700' },
  rejected: { label: '不合格', color: 'bg-red-100 text-red-700' },
};
const RESULT = {
  pending: { label: '待量測', color: 'text-slate-400' },
  pass: { label: '合格', color: 'text-green-600' },
  fail: { label: '不合格', color: 'text-red-600' },
};

function FAIDetail({ faiId, onClose }) {
  const qc = useQueryClient();
  const { data: fai, isLoading } = useQuery({ queryKey: ['fai', faiId], queryFn: () => getFAI(faiId) });
  const [values, setValues] = useState({});
  const [results, setResults] = useState({});
  const [approver, setApprover] = useState('');

  const updateMut = useMutation({
    mutationFn: () => updateItems(faiId, Object.keys(values).map(itemId => ({ fai_item_id: itemId, actual_value: values[itemId], result: results[itemId] || 'pending' }))),
    onSuccess: () => { qc.invalidateQueries(['fai', faiId]); qc.invalidateQueries(['fais']); },
  });

  const approveMut = useMutation({
    mutationFn: () => approveFAI(faiId, { approved_by: approver }),
    onSuccess: () => { qc.invalidateQueries(['fais']); onClose(); },
  });

  if (isLoading || !fai) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const items = fai.items || [];
  const allFilled = items.every(item => {
    const localResult = results[item.id];
    return (item.result !== 'pending') || (localResult && localResult !== 'pending');
  });
  const allPass = items.every(item => {
    const localResult = results[item.id] || item.result;
    return localResult === 'pass';
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">{fai.fai_no}</div>
            <div className="text-sm text-slate-500">{fai.product_name} · {fai.wo_no}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[fai.status]?.color}`}>{STATUS[fai.status]?.label}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {items.map(item => {
            const localVal = values[item.id] !== undefined ? values[item.id] : (item.actual_value || '');
            const localResult = results[item.id] || item.result || 'pending';
            return (
              <div key={item.id} className={`rounded-xl p-3 border ${localResult === 'pass' ? 'border-green-200 bg-green-50' : localResult === 'fail' ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-slate-800 text-sm">{item.item_no}. {item.measurement_name}</span>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.spec_description}
                      {(item.lsl || item.usl) && <span> ({item.lsl !== null ? `LSL:${item.lsl}` : ''}{item.usl !== null ? ` USL:${item.usl}` : ''} {item.unit})</span>}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold ${RESULT[localResult]?.color}`}>{RESULT[localResult]?.label}</span>
                </div>
                {fai.status === 'pending' && (
                  <div className="flex gap-2">
                    <input
                      className="input text-sm flex-1 py-1.5"
                      placeholder={`量測值 (${item.unit})`}
                      value={localVal}
                      onChange={e => setValues(v => ({ ...v, [item.id]: e.target.value }))}
                    />
                    <select
                      className="select text-sm py-1.5 w-28"
                      value={localResult}
                      onChange={e => setResults(r => ({ ...r, [item.id]: e.target.value }))}
                    >
                      <option value="pending">待判定</option>
                      <option value="pass">合格</option>
                      <option value="fail">不合格</option>
                    </select>
                  </div>
                )}
                {fai.status !== 'pending' && item.actual_value && (
                  <div className="text-sm font-semibold text-slate-700">實測：{item.actual_value} {item.unit}</div>
                )}
              </div>
            );
          })}

          {fai.status === 'pending' && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <button className="btn-secondary w-full py-2.5" onClick={() => updateMut.mutate()} disabled={updateMut.isPending}>
                {updateMut.isPending ? '儲存中...' : '儲存量測結果'}
              </button>
              {allFilled && allPass && (
                <div className="space-y-2">
                  <div>
                    <label className="label">核准人員</label>
                    <input className="input" value={approver} onChange={e => setApprover(e.target.value)} placeholder="姓名" />
                  </div>
                  <button className="btn-primary w-full py-2.5 bg-green-600 hover:bg-green-700" onClick={() => approveMut.mutate()} disabled={!approver || approveMut.isPending}>
                    核准首件 — 允許量產
                  </button>
                </div>
              )}
              {allFilled && !allPass && (
                <div className="card p-3 bg-red-50 border-red-200 text-sm text-red-700 text-center">
                  存在不合格項目，請調整後重新確認
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateFAIModal({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const { data: wos = [] } = useQuery({ queryKey: ['work-orders'], queryFn: getWorkOrders });
  const activeWOs = wos.filter(w => !['completed','cancelled'].includes(w.status));
  const [form, setForm] = useState({ product_id: '', work_order_id: '', inspector: '' });

  const mut = useMutation({
    mutationFn: () => createFromSPC(form.product_id, { work_order_id: form.work_order_id, inspector: form.inspector }),
    onSuccess: () => { qc.invalidateQueries(['fais']); onClose(); },
  });

  const pickWO = (woId) => {
    const wo = activeWOs.find(w => w.id === woId);
    setForm(f => ({ ...f, work_order_id: woId, product_id: wo?.product_id || f.product_id }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="label">關聯工單</label>
        <select className="select" value={form.work_order_id} onChange={e => pickWO(e.target.value)}>
          <option value="">-- 選填 --</option>
          {activeWOs.map(w => <option key={w.id} value={w.id}>{w.wo_no} · {w.product_name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">產品 *</label>
        <select className="select" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">-- 選擇產品 --</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">品檢人員</label>
        <input className="input" value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} />
      </div>
      <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
        系統將自動從 SPC 規格建立量測項目。若無 SPC 規格，將建立基本品檢項目（外觀/尺寸/功能）。
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.product_id || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立首件確認單'}
      </button>
    </div>
  );
}

const TABS = [{ k: '', l: '全部' }, { k: 'pending', l: '待確認' }, { k: 'approved', l: '已核准' }, { k: 'rejected', l: '不合格' }];

export default function FAI() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);

  const { data: fais = [], isLoading } = useQuery({
    queryKey: ['fais', tab],
    queryFn: () => getFAIs(tab || undefined),
  });

  const deleteMut = useMutation({ mutationFn: deleteFAI, onSuccess: () => qc.invalidateQueries(['fais']) });
  const pendingCount = fais.filter(f => f.status === 'pending').length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">首件確認 FAI</h1>
          {pendingCount > 0 && <div className="text-xs text-amber-600 font-medium mt-0.5">{pendingCount} 件待確認</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增首件
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : fais.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無首件確認記錄</div>
      ) : (
        <div className="space-y-2">
          {fais.map(fai => {
            const st = STATUS[fai.status] || STATUS.pending;
            return (
              <div key={fai.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailId(fai.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-400">{fai.fai_no}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="font-semibold text-slate-800">{fai.product_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {fai.wo_no && <span>{fai.wo_no} · </span>}
                      {fai.inspector && <span>品檢：{fai.inspector} · </span>}
                      {dayjs(fai.created_at).format('MM/DD')}
                    </div>
                  </div>
                  {fai.status === 'approved' && fai.approved_by && (
                    <div className="text-right shrink-0">
                      <div className="text-xs text-green-600 font-medium">核准：{fai.approved_by}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">新增首件確認單</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-4"><CreateFAIModal onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {detailId && <FAIDetail faiId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
