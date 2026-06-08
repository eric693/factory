import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getLots = (params) => api.get('/lots', { params }).then(r => r.data);
const getMaterials = () => api.get('/materials').then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const createLot = (data) => api.post('/lots', data).then(r => r.data);
const useLot = (id, data) => api.post(`/lots/${id}/use`, data).then(r => r.data);
const traceForward = (id) => api.get(`/lots/${id}/trace-forward`).then(r => r.data);
const traceOrder = (id) => api.get(`/lots/trace-order/${id}`).then(r => r.data);
const getOrders = () => api.get('/orders').then(r => r.data);

function LotForm({ onClose }) {
  const qc = useQueryClient();
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: getMaterials });
  const [form, setForm] = useState({ material_id: '', qty: '', supplier: '', received_at: dayjs().format('YYYY-MM-DD'), expiry_date: '', unit_cost: '', lot_no: '', note: '' });

  const mut = useMutation({
    mutationFn: () => createLot({ ...form, qty: +form.qty, unit_cost: +form.unit_cost }),
    onSuccess: () => { qc.invalidateQueries(['lots']); onClose(); },
  });

  const mat = materials.find(m => m.id === form.material_id);

  return (
    <div className="space-y-4">
      <div>
        <label className="label">物料 *</label>
        <select className="select" value={form.material_id} onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))}>
          <option value="">-- 選擇物料 --</option>
          {materials.map(m => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">批號（留空自動產生）</label>
          <input className="input" value={form.lot_no} onChange={e => setForm(f => ({ ...f, lot_no: e.target.value }))} placeholder="LOT-2026-0001" />
        </div>
        <div>
          <label className="label">數量 * {mat && `(${mat.unit})`}</label>
          <input type="number" min={0.01} step={0.01} className="input" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">供應商</label>
          <input className="input" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
        </div>
        <div>
          <label className="label">單價</label>
          <input type="number" min={0} className="input" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">入庫日期</label>
          <input type="date" className="input" value={form.received_at} onChange={e => setForm(f => ({ ...f, received_at: e.target.value }))} />
        </div>
        <div>
          <label className="label">有效期限</label>
          <input type="date" className="input" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">備註</label>
        <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.material_id || !form.qty || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立批號入庫'}
      </button>
    </div>
  );
}

function UseLotModal({ lot, onClose }) {
  const qc = useQueryClient();
  const { data: wos = [] } = useQuery({ queryKey: ['work-orders'], queryFn: getWorkOrders });
  const activeWOs = wos.filter(w => !['completed', 'cancelled'].includes(w.status));
  const [form, setForm] = useState({ work_order_id: '', qty_used: '', operator: '' });

  const mut = useMutation({
    mutationFn: () => useLot(lot.id, { ...form, qty_used: +form.qty_used }),
    onSuccess: () => { qc.invalidateQueries(['lots']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-bold text-slate-800">領料</div>
            <div className="text-sm text-slate-500">{lot.lot_no} · 剩餘 {lot.remaining_qty} {lot.unit}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">關聯工單（選填）</label>
            <select className="select" value={form.work_order_id} onChange={e => setForm(f => ({ ...f, work_order_id: e.target.value }))}>
              <option value="">-- 選擇工單 --</option>
              {activeWOs.map(w => <option key={w.id} value={w.id}>{w.wo_no} · {w.product_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">領料數量 *</label>
              <input type="number" min={0.01} max={lot.remaining_qty} step={0.01} className="input text-xl font-bold text-center py-4" value={form.qty_used} onChange={e => setForm(f => ({ ...f, qty_used: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="label">領料人員</label>
              <input className="input" value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} />
            </div>
          </div>
          <button className="btn-primary w-full py-3" disabled={!form.qty_used || +form.qty_used <= 0 || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? '記錄中...' : '確認領料'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TracePanel({ traceData, onClose }) {
  const { lot, usages = [] } = traceData;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">正向追溯</div>
            <div className="text-sm text-slate-500">{lot.lot_no} · {lot.material_name}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[{ l: '供應商', v: lot.supplier || '-' }, { l: '入庫日', v: lot.received_at }, { l: '入庫數量', v: `${lot.qty} ${lot.unit}` }, { l: '剩餘數量', v: `${lot.remaining_qty} ${lot.unit}` }].map(item => (
              <div key={item.l} className="bg-slate-50 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-0.5">{item.l}</div>
                <div className="font-semibold text-slate-800">{item.v}</div>
              </div>
            ))}
          </div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">使用記錄（{usages.length} 筆）</div>
          {usages.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">尚未使用</div>
          ) : (
            <div className="space-y-2">
              {usages.map(u => (
                <div key={u.id} className="card p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      {u.wo_no && <div className="font-mono text-xs text-brand-600">{u.wo_no}</div>}
                      <div className="font-semibold text-slate-800 text-sm">{u.product_name || '未關聯工單'}</div>
                      {u.customer_name && <div className="text-xs text-slate-400">{u.customer_name} · {u.order_no}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-700">{u.qty_used} {lot.unit}</div>
                      <div className="text-xs text-slate-400">{dayjs(u.used_at).format('MM/DD HH:mm')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderTracePanel({ traceData, onClose }) {
  const { order, workOrders = [], shipments = [] } = traceData;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">訂單完整追溯</div>
            <div className="text-sm text-slate-500">{order.order_no} · {order.customer_name}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 出貨資訊 */}
          {shipments.map(s => (
            <div key={s.shipment_no} className="card p-3 bg-green-50 border-green-200">
              <div className="text-xs font-semibold text-green-700 mb-1">出貨記錄</div>
              <div className="text-sm font-semibold text-green-800">{s.shipment_no}</div>
              <div className="text-xs text-green-600">{s.shipped_at?.slice(0,10)} · {s.carrier} {s.tracking_no}</div>
            </div>
          ))}

          {/* 工單 + 批號 */}
          {workOrders.map(wo => (
            <div key={wo.id} className="space-y-2">
              <div className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                <span className="font-mono">{wo.wo_no}</span>
                <span>{wo.product_name}</span>
              </div>
              {wo.lots.length === 0 ? (
                <div className="text-xs text-slate-300 pl-2">無批號記錄</div>
              ) : (
                wo.lots.map(l => (
                  <div key={l.id} className="pl-2 border-l-2 border-brand-200 space-y-0.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-mono text-brand-600 font-semibold">{l.lot_no}</span>
                      <span className="text-slate-600 font-medium">{l.qty_used} {l.unit}</span>
                    </div>
                    <div className="text-xs text-slate-400">{l.material_name} · 供應商：{l.supplier || '-'} · 入庫：{l.received_at}</div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'lots', label: '批號管理' },
  { key: 'order-trace', label: '訂單追溯' },
];

export default function Traceability() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('lots');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [usingLot, setUsingLot] = useState(null);
  const [traceResult, setTraceResult] = useState(null);
  const [orderTraceId, setOrderTraceId] = useState('');
  const [orderTraceResult, setOrderTraceResult] = useState(null);

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['lots', search],
    queryFn: () => getLots(search ? { search } : {}),
  });
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: getOrders });

  const traceMut = useMutation({
    mutationFn: (id) => traceForward(id),
    onSuccess: (data) => setTraceResult(data),
  });

  const orderTraceMut = useMutation({
    mutationFn: (id) => traceOrder(id),
    onSuccess: (data) => setOrderTraceResult(data),
  });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">全程追溯</h1>
          <div className="text-xs text-slate-400 mt-0.5">原料批號 → 工單 → 出貨完整追蹤</div>
        </div>
        {tab === 'lots' && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            批號入庫
          </button>
        )}
      </div>

      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lots' && (
        <>
          <input className="input" placeholder="搜尋批號、物料、供應商..." value={search} onChange={e => setSearch(e.target.value)} />
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
          ) : lots.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">尚無批號記錄</div>
          ) : (
            <div className="space-y-2">
              {lots.map(lot => {
                const usedPct = lot.qty > 0 ? Math.round((1 - lot.remaining_qty / lot.qty) * 100) : 0;
                const isExpired = lot.expiry_date && lot.expiry_date < dayjs().format('YYYY-MM-DD');
                const isLow = lot.remaining_qty <= lot.qty * 0.1;
                return (
                  <div key={lot.id} className={`card p-4 ${isExpired ? 'border-red-200 bg-red-50' : isLow ? 'border-amber-200' : ''}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-sm font-bold text-brand-700">{lot.lot_no}</span>
                          {isExpired && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">已過期</span>}
                          {isLow && !isExpired && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">低庫存</span>}
                        </div>
                        <div className="font-semibold text-slate-800">{lot.material_name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {lot.material_code} · 供應商：{lot.supplier || '-'} · 入庫：{lot.received_at}
                          {lot.expiry_date && <span> · 效期：{lot.expiry_date}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-800">{lot.remaining_qty}</div>
                        <div className="text-xs text-slate-400">/ {lot.qty} {lot.unit}</div>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${usedPct}%` }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setUsingLot(lot)} disabled={lot.remaining_qty <= 0} className="btn-secondary text-xs py-1.5 flex-1 disabled:opacity-40">領料</button>
                      <button onClick={() => traceMut.mutate(lot.id)} className="btn-ghost text-xs py-1.5 flex-1">追溯</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'order-trace' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">選擇訂單進行完整追溯</div>
            <select className="select mb-3" value={orderTraceId} onChange={e => setOrderTraceId(e.target.value)}>
              <option value="">-- 選擇訂單 --</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}</option>)}
            </select>
            <button className="btn-primary w-full" disabled={!orderTraceId || orderTraceMut.isPending} onClick={() => orderTraceMut.mutate(orderTraceId)}>
              {orderTraceMut.isPending ? '查詢中...' : '產生追溯報告'}
            </button>
          </div>
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
            追溯報告顯示：訂單 → 各工單 → 使用的所有原料批號 → 供應商資訊 → 出貨記錄
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">批號入庫</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <LotForm onClose={() => setShowCreate(false)} />
            </div>
          </div>
        </div>
      )}
      {usingLot && <UseLotModal lot={usingLot} onClose={() => setUsingLot(null)} />}
      {traceResult && <TracePanel traceData={traceResult} onClose={() => setTraceResult(null)} />}
      {orderTraceResult && <OrderTracePanel traceData={orderTraceResult} onClose={() => setOrderTraceResult(null)} />}
    </div>
  );
}
