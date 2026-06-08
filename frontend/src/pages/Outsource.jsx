import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getOrders = (status) => api.get('/outsource', { params: status ? { status } : {} }).then(r => r.data);
const getStats = () => api.get('/outsource/stats').then(r => r.data);
const getWorkOrders = () => api.get('/work-orders').then(r => r.data);
const createOrder = (data) => api.post('/outsource', data).then(r => r.data);
const updateStatus = (id, data) => api.patch(`/outsource/${id}/status`, data).then(r => r.data);
const deleteOrder = (id) => api.delete(`/outsource/${id}`).then(r => r.data);

const STATUS = {
  pending:   { label: '待發送', color: 'bg-slate-100 text-slate-600' },
  sent:      { label: '已發送', color: 'bg-blue-100 text-blue-700' },
  in_process:{ label: '加工中', color: 'bg-indigo-100 text-indigo-700' },
  completed: { label: '已回料', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-red-100 text-red-600' },
};
const STATUS_FLOW = { pending: ['sent', 'cancelled'], sent: ['in_process', 'completed', 'cancelled'], in_process: ['completed', 'cancelled'] };

function OutsourceForm({ onClose }) {
  const qc = useQueryClient();
  const { data: wos = [] } = useQuery({ queryKey: ['work-orders'], queryFn: getWorkOrders });
  const activeWOs = wos.filter(w => !['completed','cancelled'].includes(w.status));
  const [form, setForm] = useState({ work_order_id: '', vendor_name: '', process_name: '', product_name: '', qty: '', unit_cost: '', sent_at: dayjs().format('YYYY-MM-DD'), expected_return: dayjs().add(7,'day').format('YYYY-MM-DD'), note: '' });

  const pickWO = (id) => {
    const wo = activeWOs.find(w => w.id === id);
    setForm(f => ({ ...f, work_order_id: id, product_name: wo?.product_name || f.product_name }));
  };

  const mut = useMutation({
    mutationFn: () => createOrder({ ...form, qty: +form.qty, unit_cost: +form.unit_cost }),
    onSuccess: () => { qc.invalidateQueries(['outsource']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">關聯工單（選填）</label>
        <select className="select" value={form.work_order_id} onChange={e => pickWO(e.target.value)}>
          <option value="">-- 選擇工單 --</option>
          {activeWOs.map(w => <option key={w.id} value={w.id}>{w.wo_no} · {w.product_name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">外發廠商 *</label>
          <input className="input" value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} placeholder="廠商名稱" />
        </div>
        <div>
          <label className="label">外發製程 *</label>
          <input className="input" value={form.process_name} onChange={e => setForm(f => ({ ...f, process_name: e.target.value }))} placeholder="表面處理、電鍍..." />
        </div>
      </div>
      <div>
        <label className="label">產品名稱</label>
        <input className="input" value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">數量 *</label>
          <input type="number" min={1} className="input" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
        </div>
        <div>
          <label className="label">單價（元）</label>
          <input type="number" min={0} step={0.01} className="input" value={form.unit_cost} onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">發送日期</label>
          <input type="date" className="input" value={form.sent_at} onChange={e => setForm(f => ({ ...f, sent_at: e.target.value }))} />
        </div>
        <div>
          <label className="label">預計回料日</label>
          <input type="date" className="input" value={form.expected_return} onChange={e => setForm(f => ({ ...f, expected_return: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">備註</label>
        <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.vendor_name || !form.process_name || !form.qty || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立外發單'}
      </button>
    </div>
  );
}

function ReceiveModal({ order, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ received_qty: order.qty, actual_return: dayjs().format('YYYY-MM-DD'), note: '' });
  const mut = useMutation({
    mutationFn: () => updateStatus(order.id, { status: 'completed', ...form, received_qty: +form.received_qty }),
    onSuccess: () => { qc.invalidateQueries(['outsource']); onClose(); },
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><div className="font-bold text-slate-800">確認回料</div><div className="text-sm text-slate-500">{order.out_no}</div></div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">回料數量</label>
              <input type="number" min={0} max={order.qty} className="input text-xl font-bold text-center py-4" value={form.received_qty} onChange={e => setForm(f => ({ ...f, received_qty: e.target.value }))} />
            </div>
            <div>
              <label className="label">實際回料日</label>
              <input type="date" className="input" value={form.actual_return} onChange={e => setForm(f => ({ ...f, actual_return: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">備註</label>
            <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <button className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? '確認中...' : '確認回料完成'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [{ k: '', l: '全部' }, { k: 'pending', l: '待發送' }, { k: 'sent', l: '已發送' }, { k: 'in_process', l: '加工中' }, { k: 'completed', l: '已完成' }];

export default function Outsource() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [receiving, setReceiving] = useState(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['outsource', tab],
    queryFn: () => getOrders(tab || undefined),
  });
  const { data: stats = [] } = useQuery({ queryKey: ['outsource-stats'], queryFn: getStats });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updateStatus(id, { status }),
    onSuccess: () => qc.invalidateQueries(['outsource']),
  });
  const deleteMut = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => qc.invalidateQueries(['outsource']),
  });

  const overdueCount = orders.filter(o => o.expected_return < dayjs().format('YYYY-MM-DD') && !['completed','cancelled'].includes(o.status)).length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">外發加工</h1>
          {overdueCount > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{overdueCount} 件已逾回料期</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增外發單
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無外發單</div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => {
            const st = STATUS[o.status] || STATUS.pending;
            const isOverdue = o.expected_return < dayjs().format('YYYY-MM-DD') && !['completed','cancelled'].includes(o.status);
            const daysLeft = dayjs(o.expected_return).diff(dayjs(), 'day');
            const nextStatuses = STATUS_FLOW[o.status] || [];
            return (
              <div key={o.id} className={`card p-4 ${isOverdue ? 'border-red-200 bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-400">{o.out_no}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      {isOverdue && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">逾期 {Math.abs(daysLeft)} 天</span>}
                    </div>
                    <div className="font-semibold text-slate-800">{o.vendor_name} · {o.process_name}</div>
                    <div className="text-sm text-slate-600">{o.product_name}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{o.qty} 件</span>
                      {o.total_cost > 0 && <span>費用 {o.total_cost.toLocaleString()} 元</span>}
                      <span>預計回料：{o.expected_return}</span>
                    </div>
                  </div>
                </div>
                {nextStatuses.length > 0 && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100 flex-wrap">
                    {nextStatuses.map(s => s === 'completed' ? (
                      <button key={s} onClick={() => setReceiving(o)} className="btn-primary text-xs py-1.5 flex-1 bg-green-600 hover:bg-green-700">確認回料</button>
                    ) : (
                      <button key={s} onClick={() => statusMut.mutate({ id: o.id, status: s })} className={`text-xs py-1.5 px-3 rounded-lg font-medium ${s === 'cancelled' ? 'text-slate-400 hover:text-red-500' : 'btn-secondary flex-1'}`}>
                        {STATUS[s]?.label || s}
                      </button>
                    ))}
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
              <h2 className="font-bold text-slate-800">新增外發單</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4"><OutsourceForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {receiving && <ReceiveModal order={receiving} onClose={() => setReceiving(null)} />}
    </div>
  );
}
