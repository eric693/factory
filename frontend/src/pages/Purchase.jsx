import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getPOs = (status) => api.get('/purchase', { params: { status } }).then(r => r.data);
const createPO = (data) => api.post('/purchase', data).then(r => r.data);
const updatePOStatus = (id, status) => api.patch(`/purchase/${id}/status`, { status }).then(r => r.data);
const deletePO = (id) => api.delete(`/purchase/${id}`).then(r => r.data);
const getMaterials = () => api.get('/materials').then(r => r.data);

const STATUS = {
  draft:    { label: '草稿', color: 'bg-slate-100 text-slate-600' },
  approved: { label: '已核准', color: 'bg-blue-100 text-blue-700' },
  ordered:  { label: '已下單', color: 'bg-indigo-100 text-indigo-700' },
  received: { label: '已到貨', color: 'bg-green-100 text-green-700' },
  cancelled:{ label: '已取消', color: 'bg-red-100 text-red-600' },
};

function POForm({ onClose }) {
  const qc = useQueryClient();
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: getMaterials });
  const [form, setForm] = useState({ supplier: '', expected_date: dayjs().add(7, 'day').format('YYYY-MM-DD'), note: '', created_by: '' });
  const [items, setItems] = useState([{ material_id: '', material_name: '', material_code: '', unit: '個', qty: 1, unit_cost: 0 }]);

  const mut = useMutation({
    mutationFn: () => createPO({ ...form, items: items.map(i => ({ ...i, total_cost: i.qty * i.unit_cost })) }),
    onSuccess: () => { qc.invalidateQueries(['purchase']); onClose(); },
  });

  const setMaterial = (idx, matId) => {
    const m = materials.find(m => m.id === matId);
    setItems(it => it.map((item, i) => i === idx ? { ...item, material_id: matId, material_name: m?.name || '', material_code: m?.code || '', unit: m?.unit || '個', unit_cost: m?.unit_cost || 0 } : item));
  };

  const addItem = () => setItems(it => [...it, { material_id: '', material_name: '', material_code: '', unit: '個', qty: 1, unit_cost: 0 }]);
  const removeItem = (idx) => setItems(it => it.filter((_, i) => i !== idx));
  const totalAmount = items.reduce((s, i) => s + i.qty * (i.unit_cost || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">供應商</label>
          <input className="input" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="供應商名稱" />
        </div>
        <div>
          <label className="label">預計到貨日</label>
          <input type="date" className="input" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">建立人員</label>
        <input className="input" value={form.created_by} onChange={e => setForm(f => ({ ...f, created_by: e.target.value }))} placeholder="姓名" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">採購品項</label>
          <button className="btn-ghost text-xs px-2 py-1" onClick={addItem}>+ 新增</button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div>
                <label className="label">物料</label>
                <select className="select" value={item.material_id} onChange={e => setMaterial(idx, e.target.value)}>
                  <option value="">-- 選擇物料 --</option>
                  {materials.map(m => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label">數量</label>
                  <input type="number" min={1} className="input" value={item.qty} onChange={e => setItems(it => it.map((x, i) => i === idx ? { ...x, qty: +e.target.value } : x))} />
                </div>
                <div>
                  <label className="label">單位</label>
                  <input className="input" value={item.unit} onChange={e => setItems(it => it.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} />
                </div>
                <div>
                  <label className="label">單價</label>
                  <input type="number" min={0} className="input" value={item.unit_cost} onChange={e => setItems(it => it.map((x, i) => i === idx ? { ...x, unit_cost: +e.target.value } : x))} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">小計：{(item.qty * (item.unit_cost || 0)).toLocaleString()} 元</span>
                {items.length > 1 && <button className="text-xs text-red-500" onClick={() => removeItem(idx)}>移除</button>}
              </div>
            </div>
          ))}
        </div>
        <div className="text-right mt-2 text-sm font-semibold text-slate-700">合計：{totalAmount.toLocaleString()} 元</div>
      </div>

      <div>
        <label className="label">備註</label>
        <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="選填" />
      </div>

      <button
        className="btn-primary w-full py-3"
        disabled={items.some(i => !i.material_id || i.qty <= 0) || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? '建立中...' : '建立採購單'}
      </button>
    </div>
  );
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'approved', label: '已核准' },
  { key: 'ordered', label: '已下單' },
  { key: 'received', label: '已到貨' },
];

const STATUS_FLOW = {
  draft: ['approved', 'cancelled'],
  approved: ['ordered', 'cancelled'],
  ordered: ['received', 'cancelled'],
};

export default function Purchase() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ['purchase', tab],
    queryFn: () => getPOs(tab !== 'all' ? tab : undefined),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }) => updatePOStatus(id, status),
    onSuccess: () => qc.invalidateQueries(['purchase']),
  });
  const deleteMut = useMutation({
    mutationFn: deletePO,
    onSuccess: () => qc.invalidateQueries(['purchase']),
  });

  const totalDraft = pos.filter(p => p.status === 'draft').length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">採購申請單</h1>
          {totalDraft > 0 && <div className="text-xs text-amber-600 font-medium mt-0.5">{totalDraft} 張草稿待核准</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增採購單
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : pos.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無採購單</div>
      ) : (
        <div className="space-y-2">
          {pos.map(po => {
            const st = STATUS[po.status] || STATUS.draft;
            const isExpanded = expanded === po.id;
            const nextStatuses = STATUS_FLOW[po.status] || [];
            const isOverdue = po.expected_date && dayjs(po.expected_date).isBefore(dayjs(), 'day') && po.status !== 'received';

            return (
              <div key={po.id} className={`card overflow-hidden ${isOverdue ? 'border-amber-200' : ''}`}>
                <div className="p-4 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : po.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-400">{po.po_no}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        {isOverdue && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">到貨逾期</span>}
                      </div>
                      <div className="font-semibold text-slate-800">{po.supplier || '未指定供應商'}</div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                        <span>{po.items?.length || 0} 項物料</span>
                        <span>合計 {(po.total_amount || 0).toLocaleString()} 元</span>
                        {po.expected_date && <span>預計到貨：{po.expected_date}</span>}
                      </div>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3 space-y-3">
                    {/* 品項 */}
                    {po.items?.length > 0 && (
                      <div className="space-y-1">
                        {po.items.map(item => (
                          <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                            <div>
                              <span className="text-slate-400 text-xs mr-1">{item.material_code}</span>
                              <span className="text-slate-700 font-medium">{item.material_name}</span>
                            </div>
                            <div className="text-right text-slate-600">
                              <span className="font-semibold">{item.qty} {item.unit}</span>
                              {item.unit_cost > 0 && <span className="text-xs text-slate-400 ml-1">@ {item.unit_cost}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 操作按鈕 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {nextStatuses.map(s => (
                        <button
                          key={s}
                          onClick={() => statusMut.mutate({ id: po.id, status: s })}
                          disabled={statusMut.isPending}
                          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${s === 'received' ? 'bg-green-100 text-green-700 hover:bg-green-200' : s === 'cancelled' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'btn-secondary'}`}
                        >
                          {STATUS[s]?.label || s}
                          {s === 'received' && ' (自動入庫)'}
                        </button>
                      ))}
                      {po.status === 'draft' && (
                        <button onClick={() => deleteMut.mutate(po.id)} className="text-xs text-slate-400 hover:text-red-500 ml-auto">刪除</button>
                      )}
                    </div>
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
          <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-slate-800">新增採購單</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <POForm onClose={() => setShowCreate(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
