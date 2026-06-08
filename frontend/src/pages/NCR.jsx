import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getNCRs = (status) => api.get('/ncr', { params: status ? { status } : {} }).then(r => r.data);
const getStats = () => api.get('/ncr/stats').then(r => r.data);
const getProducts = () => api.get('/products').then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const createNCR = (data) => api.post('/ncr', data).then(r => r.data);
const setDisposition = (id, data) => api.patch(`/ncr/${id}/disposition`, data).then(r => r.data);
const closeNCR = (id, data) => api.patch(`/ncr/${id}/close`, data).then(r => r.data);
const deleteNCR = (id) => api.delete(`/ncr/${id}`).then(r => r.data);

const SOURCES = { incoming: '進料檢驗', process: '製程巡檢', final: '成品檢驗', customer: '客訴退貨' };
const DISPOSITIONS = { scrap: '報廢', rework: '重工', concession: '特採放行', return: '退回供應商' };
const SEVERITY = { high: { label: '嚴重', color: 'bg-red-100 text-red-700' }, medium: { label: '一般', color: 'bg-amber-100 text-amber-700' }, low: { label: '輕微', color: 'bg-green-100 text-green-700' } };
const DEFECT_TYPES = { dimension: '尺寸不符', surface: '外觀瑕疵', function: '功能異常', material: '材質不符', other: '其他' };

function NCRForm({ onClose }) {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const { data: wos = [] } = useQuery({ queryKey: ['work-orders'], queryFn: getWorkOrders });
  const [form, setForm] = useState({ source: 'process', product_id: '', product_name: '', product_code: '', work_order_id: '', defect_qty: '', defect_description: '', defect_type: 'dimension', severity: 'medium', found_by: '' });

  const pickWO = (woId) => {
    const wo = wos.find(w => w.id === woId);
    setForm(f => ({ ...f, work_order_id: woId, product_id: wo?.product_id || f.product_id, product_name: wo?.product_name || f.product_name, product_code: wo?.product_code || f.product_code }));
  };

  const mut = useMutation({
    mutationFn: () => createNCR({ ...form, defect_qty: +form.defect_qty }),
    onSuccess: () => { qc.invalidateQueries(['ncrs']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">發現來源 *</label>
          <select className="select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
            {Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label">嚴重度</label>
          <select className="select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
            <option value="high">嚴重</option>
            <option value="medium">一般</option>
            <option value="low">輕微</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">關聯工單（選填）</label>
        <select className="select" value={form.work_order_id} onChange={e => pickWO(e.target.value)}>
          <option value="">-- 選填 --</option>
          {wos.filter(w => !['cancelled'].includes(w.status)).map(w => <option key={w.id} value={w.id}>{w.wo_no} · {w.product_name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">產品</label>
          <select className="select" value={form.product_id} onChange={e => { const p = products.find(p => p.id === e.target.value); setForm(f => ({ ...f, product_id: e.target.value, product_name: p?.name || '', product_code: p?.code || '' })); }}>
            <option value="">-- 選填 --</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">不良數量 *</label>
          <input type="number" min={1} className="input" value={form.defect_qty} onChange={e => setForm(f => ({ ...f, defect_qty: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">不良類型</label>
        <select className="select" value={form.defect_type} onChange={e => setForm(f => ({ ...f, defect_type: e.target.value }))}>
          {Object.entries(DEFECT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">不良描述 *</label>
        <textarea className="input" rows={3} value={form.defect_description} onChange={e => setForm(f => ({ ...f, defect_description: e.target.value }))} placeholder="詳細描述不良狀況..." />
      </div>
      <div>
        <label className="label">發現人員</label>
        <input className="input" value={form.found_by} onChange={e => setForm(f => ({ ...f, found_by: e.target.value }))} />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.defect_qty || !form.defect_description || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立不合格單'}
      </button>
    </div>
  );
}

function DispositionModal({ ncr, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ disposition: ncr.disposition || 'scrap', disposition_note: ncr.disposition_note || '', scrap_cost: ncr.scrap_cost || '', rework_cost: ncr.rework_cost || '', closed_by: '' });

  const disposeMut = useMutation({
    mutationFn: () => setDisposition(ncr.id, { ...form, scrap_cost: +form.scrap_cost, rework_cost: +form.rework_cost }),
    onSuccess: () => { qc.invalidateQueries(['ncrs']); onClose(); },
  });

  const closeMut = useMutation({
    mutationFn: () => closeNCR(ncr.id, { closed_by: form.closed_by, disposition: form.disposition }),
    onSuccess: () => { qc.invalidateQueries(['ncrs']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">不合格品處置</div>
            <div className="text-sm text-slate-500">{ncr.ncr_no} · {ncr.defect_qty} 件</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="label">處置方式</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(DISPOSITIONS).map(([k, v]) => (
                <button key={k} onClick={() => setForm(f => ({ ...f, disposition: k }))} className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${form.disposition === k ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}>{v}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">處置說明</label>
            <textarea className="input" rows={2} value={form.disposition_note} onChange={e => setForm(f => ({ ...f, disposition_note: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">報廢損失（元）</label><input type="number" min={0} className="input" value={form.scrap_cost} onChange={e => setForm(f => ({ ...f, scrap_cost: e.target.value }))} /></div>
            <div><label className="label">重工成本（元）</label><input type="number" min={0} className="input" value={form.rework_cost} onChange={e => setForm(f => ({ ...f, rework_cost: e.target.value }))} /></div>
          </div>
          <div><label className="label">結案人員</label><input className="input" value={form.closed_by} onChange={e => setForm(f => ({ ...f, closed_by: e.target.value }))} /></div>
          <div className="flex gap-3">
            <button className="btn-secondary flex-1" onClick={() => disposeMut.mutate()} disabled={disposeMut.isPending}>儲存處置</button>
            <button className="btn-primary flex-1 bg-green-600 hover:bg-green-700" onClick={() => closeMut.mutate()} disabled={!form.closed_by || closeMut.isPending}>確認結案</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const TABS = [{ k: '', l: '全部' }, { k: 'open', l: '待處置' }, { k: 'closed', l: '已結案' }];

export default function NCR() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [disposing, setDisposing] = useState(null);

  const { data: ncrs = [], isLoading } = useQuery({ queryKey: ['ncrs', tab], queryFn: () => getNCRs(tab || undefined) });
  const { data: stats } = useQuery({ queryKey: ['ncr-stats'], queryFn: getStats });
  const deleteMut = useMutation({ mutationFn: deleteNCR, onSuccess: () => qc.invalidateQueries(['ncrs']) });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">不合格品管理 NCR</h1>
          {stats?.open > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{stats.open} 件待處置</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          建立 NCR
        </button>
      </div>

      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : ncrs.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無不合格記錄</div>
      ) : (
        <div className="space-y-2">
          {ncrs.map(ncr => {
            const sev = SEVERITY[ncr.severity] || SEVERITY.medium;
            return (
              <div key={ncr.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-400">{ncr.ncr_no}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sev.color}`}>{sev.label}</span>
                      <span className="text-xs text-slate-500">{SOURCES[ncr.source] || ncr.source}</span>
                      {ncr.status === 'closed' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">已結案</span>}
                    </div>
                    <div className="font-semibold text-slate-800">{ncr.product_name || '未指定產品'}</div>
                    <div className="text-sm text-slate-600 mt-0.5 line-clamp-2">{ncr.defect_description}</div>
                    <div className="flex gap-3 mt-1.5 text-xs text-slate-400">
                      <span>不良 {ncr.defect_qty} 件</span>
                      {ncr.wo_no && <span>{ncr.wo_no}</span>}
                      {ncr.disposition && <span>處置：{DISPOSITIONS[ncr.disposition]}</span>}
                      <span>{dayjs(ncr.created_at).format('MM/DD')}</span>
                    </div>
                  </div>
                  {ncr.status === 'open' && (
                    <button className="btn-secondary text-xs shrink-0" onClick={() => setDisposing(ncr)}>處置</button>
                  )}
                </div>
                {(ncr.scrap_cost > 0 || ncr.rework_cost > 0) && (
                  <div className="flex gap-3 text-xs text-slate-500 pt-2 border-t border-slate-50">
                    {ncr.scrap_cost > 0 && <span>報廢損失：{ncr.scrap_cost.toLocaleString()} 元</span>}
                    {ncr.rework_cost > 0 && <span>重工成本：{ncr.rework_cost.toLocaleString()} 元</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">建立不合格單</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4"><NCRForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {disposing && <DispositionModal ncr={disposing} onClose={() => setDisposing(null)} />}
    </div>
  );
}
