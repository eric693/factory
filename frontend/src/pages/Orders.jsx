import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getOrders, createOrder, updateOrderStatus, deleteOrder, getCustomers, getProducts, autoSchedule } from '../api';
import { STATUS_ORDER, PRIORITY, formatDate, isOverdue } from '../utils';
import { PrintOrderPDF } from '../components/PrintOrderPDF';
import dayjs from 'dayjs';

const getOrderFull = (id) => axios.get(`/api/orders/${id}/full`).then(r => r.data);
const WO_STATUS_LABEL = { pending: '待開工', scheduled: '已排程', in_progress: '生產中', completed: '完工', cancelled: '取消' };

function OrderDetailModal({ orderId, onClose }) {
  const { data, isLoading } = useQuery({ queryKey: ['order-full', orderId], queryFn: () => getOrderFull(orderId) });

  if (isLoading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
  );

  const { order_no, customer_name, status, due_date, items = [], wos = [], shipments = [], invoice, profit = {}, total_progress = 0 } = data || {};
  const st = STATUS_ORDER[status] || STATUS_ORDER.pending;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-lg">{order_no}</span>
              <span className={`badge ${st.color}`}>{st.label}</span>
            </div>
            <div className="text-sm text-slate-500">{customer_name} · 交期 {formatDate(due_date)}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 整體進度 */}
          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="text-slate-600 font-medium">整體生產進度</span>
              <span className="font-bold text-brand-600">{total_progress}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${total_progress >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${total_progress}%` }} />
            </div>
          </div>

          {/* 損益 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-0.5">收入</div>
              <div className="font-bold text-green-600">{profit.revenue ? `${profit.revenue.toLocaleString()}元` : '未設定'}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-xs text-slate-400 mb-0.5">毛利</div>
              <div className={`font-bold ${(profit.gross_profit || 0) >= 0 ? 'text-brand-600' : 'text-red-600'}`}>
                {profit.revenue ? `${(profit.gross_profit || 0).toLocaleString()}元` : '-'}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-slate-500">原料成本：{(profit.material_cost || 0).toLocaleString()} 元</div>
            <div className="text-slate-500">人工成本：{(profit.labor_cost || 0).toLocaleString()} 元</div>
          </div>

          {/* 品項 */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">訂購品項</div>
            <div className="space-y-1">
              {items.map(it => (
                <div key={it.id} className="flex justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700">{it.product_code && <span className="text-slate-400 mr-1">{it.product_code}</span>}{it.product_name}</span>
                  <span className="font-medium text-slate-600">{it.qty} {it.unit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 工單 */}
          {wos.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">工單進度（{wos.length}）</div>
              <div className="space-y-2">
                {wos.map(wo => (
                  <div key={wo.id} className="bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{wo.wo_no}</span>
                        <span className="text-xs text-slate-500">{WO_STATUS_LABEL[wo.status] || wo.status}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-600">{wo.completed_qty}/{wo.planned_qty}</span>
                    </div>
                    <div className="text-sm text-slate-700 mb-1.5">{wo.product_name}</div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${(wo.progress_pct || 0) >= 100 ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(wo.progress_pct || 0, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>{wo.machine_name || '未指派機台'}{wo.operator ? ` · ${wo.operator}` : ''}</span>
                      <span>{formatDate(wo.planned_start)} ~ {formatDate(wo.planned_end)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 出貨 */}
          {shipments.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">出貨記錄</div>
              {shipments.map(s => (
                <div key={s.shipment_no} className="flex items-center justify-between text-sm py-1.5">
                  <span className="text-slate-700">{s.shipment_no} {s.carrier && `· ${s.carrier}`}</span>
                  <span className="text-xs text-slate-400">{s.shipped_at?.slice(0, 10) || s.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* 帳款 */}
          {invoice && (
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-blue-600 font-semibold">應收帳款</div>
                  <div className="text-sm font-medium text-blue-800">{invoice.invoice_no}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-blue-800">{(invoice.amount || 0).toLocaleString()} 元</div>
                  <div className="text-xs text-blue-500">{invoice.status === 'paid' ? '已收款' : `到期 ${invoice.due_date}`}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function OrderForm({ onClose, onSuccess }) {
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: getCustomers });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });
  const qc = useQueryClient();
  const [form, setForm] = useState({ customer_name: '', customer_id: '', due_date: dayjs().add(14, 'day').format('YYYY-MM-DD'), priority: 2, note: '' });
  const [items, setItems] = useState([{ product_id: '', product_name: '', product_code: '', qty: 1, unit: '個' }]);

  const mut = useMutation({
    mutationFn: () => createOrder({ ...form, items }),
    onSuccess: () => { qc.invalidateQueries(['orders']); qc.invalidateQueries(['dashboard']); onSuccess?.(); onClose(); },
  });

  const setCustomer = (e) => {
    const c = customers.find(c => c.id === e.target.value);
    setForm(f => ({ ...f, customer_id: e.target.value, customer_name: c ? c.name : e.target.value }));
  };

  const setProduct = (idx, productId) => {
    const p = products.find(p => p.id === productId);
    setItems(it => it.map((item, i) => i === idx ? { ...item, product_id: productId, product_name: p?.name || '', product_code: p?.code || '', unit: p?.unit || '個' } : item));
  };

  const addItem = () => setItems(it => [...it, { product_id: '', product_name: '', product_code: '', qty: 1, unit: '個' }]);
  const removeItem = (idx) => setItems(it => it.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div>
        <label className="label">客戶</label>
        <select className="select" value={form.customer_id} onChange={setCustomer}>
          <option value="">-- 選擇客戶 --</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">交期</label>
          <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">優先度</label>
          <select className="select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: +e.target.value }))}>
            <option value={1}>急件</option>
            <option value={2}>一般</option>
            <option value={3}>低優先</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">備註</label>
        <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="選填" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">品項</label>
          <button className="btn-ghost text-xs px-2 py-1" onClick={addItem}>+ 新增品項</button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div>
                <label className="label">產品</label>
                <select className="select" value={item.product_id} onChange={e => setProduct(idx, e.target.value)}>
                  <option value="">-- 選擇產品 --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">數量</label>
                  <input type="number" min={1} className="input" value={item.qty} onChange={e => setItems(it => it.map((x, i) => i === idx ? { ...x, qty: +e.target.value } : x))} />
                </div>
                <div>
                  <label className="label">單位</label>
                  <input className="input" value={item.unit} onChange={e => setItems(it => it.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} />
                </div>
              </div>
              {items.length > 1 && (
                <button className="text-xs text-red-500 hover:text-red-700" onClick={() => removeItem(idx)}>移除此品項</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        className="btn-primary w-full py-3"
        disabled={!form.customer_name || items.some(i => !i.product_name) || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? '建立中...' : '建立訂單'}
      </button>
    </div>
  );
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待排產' },
  { key: 'scheduled', label: '已排產' },
  { key: 'in_production', label: '生產中' },
  { key: 'shipped', label: '已出貨' },
];

export default function Orders() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState([]);
  const [printOrder, setPrintOrder] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', tab, search],
    queryFn: () => getOrders({ status: tab !== 'all' ? tab : undefined, search: search || undefined }),
  });

  const scheduleMut = useMutation({
    mutationFn: () => autoSchedule(selected),
    onSuccess: (data) => {
      qc.invalidateQueries(['orders']);
      qc.invalidateQueries(['dashboard']);
      setSelected([]);
      alert(`已排產 ${data.scheduled} 張工單`);
    },
  });

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">訂單管理</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增訂單
        </button>
      </div>

      {/* Search */}
      <input className="input" placeholder="搜尋訂單編號、客戶名稱..." value={search} onChange={e => setSearch(e.target.value)} />

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Batch action */}
      {selected.length > 0 && (
        <div className="card p-3 flex items-center justify-between bg-brand-50 border-brand-200">
          <span className="text-sm text-brand-700 font-medium">已選 {selected.length} 張訂單</span>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={() => setSelected([])}>取消</button>
            <button className="btn-primary text-xs" onClick={() => scheduleMut.mutate()} disabled={scheduleMut.isPending}>
              {scheduleMut.isPending ? '排產中...' : '自動排產'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無訂單</div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => {
            const st = STATUS_ORDER[order.status] || STATUS_ORDER.pending;
            const pr = PRIORITY[order.priority] || PRIORITY[2];
            const overdue = isOverdue(order.due_date, order.status);
            const daysLeft = dayjs(order.due_date).diff(dayjs(), 'day');
            const isSelected = selected.includes(order.id);

            return (
              <div key={order.id} className={`card p-4 transition-all ${isSelected ? 'ring-2 ring-brand-500' : ''}`}>
                <div className="flex items-start gap-3">
                  {/* Checkbox for pending/scheduled */}
                  {['pending', 'scheduled'].includes(order.status) && (
                    <button onClick={() => toggleSelect(order.id)} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-brand-600 border-brand-600' : 'border-slate-300'}`}>
                      {isSelected && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  )}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailId(order.id)}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-slate-500">{order.order_no}</span>
                      <span className={`badge ${st.color}`}>{st.label}</span>
                      <span className={`badge ${pr.color}`}>{pr.label}</span>
                      {overdue && <span className="badge bg-red-100 text-red-700">逾期</span>}
                    </div>
                    <div className="font-semibold text-slate-800">{order.customer_name}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span>{order.item_count} 品項</span>
                      <span className={`font-medium ${overdue ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-slate-500'}`}>
                        交期 {formatDate(order.due_date)} {!overdue && daysLeft >= 0 ? `(${daysLeft}天)` : overdue ? `(逾${Math.abs(daysLeft)}天)` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setPrintOrder(order); }}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                    title="列印確認書"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                      <rect x="6" y="14" width="12" height="8"/>
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="新增訂單" onClose={() => setShowCreate(false)}>
          <OrderForm onClose={() => setShowCreate(false)} />
        </Modal>
      )}
      {printOrder && <PrintOrderPDF order={printOrder} onClose={() => setPrintOrder(null)} />}
      {detailId && <OrderDetailModal orderId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
