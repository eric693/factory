import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getShipments, createShipment, shipOrder, getOrders, getProducts } from '../api';
import { STATUS_SHIP, formatDate } from '../utils';
import { PrintShipmentPDF } from '../components/PrintOrderPDF';
import dayjs from 'dayjs';

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
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

function ShipmentForm({ onClose }) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ['orders', 'in_production'], queryFn: () => getOrders({ status: 'in_production' }) });
  const { data: allOrders = [] } = useQuery({ queryKey: ['orders', 'all'], queryFn: () => getOrders({}) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: getProducts });

  const [form, setForm] = useState({ order_id: '', customer_name: '', carrier: '', tracking_no: '', note: '' });
  const [items, setItems] = useState([{ product_name: '', product_code: '', qty: 1 }]);

  const pickOrder = (orderId) => {
    const o = allOrders.find(o => o.id === orderId);
    setForm(f => ({ ...f, order_id: orderId, customer_name: o?.customer_name || f.customer_name }));
  };

  const mut = useMutation({
    mutationFn: () => createShipment({ ...form, items }),
    onSuccess: () => { qc.invalidateQueries(['shipments']); qc.invalidateQueries(['orders']); onClose(); },
  });

  const addItem = () => setItems(it => [...it, { product_name: '', product_code: '', qty: 1 }]);

  return (
    <div className="space-y-4">
      <div>
        <label className="label">關聯訂單</label>
        <select className="select" value={form.order_id} onChange={e => pickOrder(e.target.value)}>
          <option value="">-- 選擇訂單 (選填) --</option>
          {allOrders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">客戶名稱</label>
        <input className="input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="必填" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">貨運商</label>
          <input className="input" value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="黑貓、貨車..." />
        </div>
        <div>
          <label className="label">追蹤號碼</label>
          <input className="input" value={form.tracking_no} onChange={e => setForm(f => ({ ...f, tracking_no: e.target.value }))} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">出貨品項</label>
          <button className="btn-ghost text-xs px-2 py-1" onClick={addItem}>+ 新增</button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div>
                <label className="label">產品</label>
                <select className="select" value={item.product_name} onChange={e => {
                  const p = products.find(p => p.name === e.target.value);
                  setItems(it => it.map((x, i) => i === idx ? { ...x, product_name: e.target.value, product_code: p?.code || '' } : x));
                }}>
                  <option value="">-- 選擇產品 --</option>
                  {products.map(p => <option key={p.id} value={p.name}>{p.code} {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">數量</label>
                <input type="number" min={1} className="input" value={item.qty} onChange={e => setItems(it => it.map((x, i) => i === idx ? { ...x, qty: +e.target.value } : x))} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        className="btn-primary w-full py-3"
        disabled={!form.customer_name || items.some(i => !i.product_name) || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? '建立中...' : '建立出貨單'}
      </button>
    </div>
  );
}

function ShipModal({ shipment, onClose }) {
  const qc = useQueryClient();
  const [carrier, setCarrier] = useState(shipment.carrier || '');
  const [tracking, setTracking] = useState(shipment.tracking_no || '');

  const mut = useMutation({
    mutationFn: () => shipOrder(shipment.id, { carrier, tracking_no: tracking }),
    onSuccess: () => { qc.invalidateQueries(['shipments']); qc.invalidateQueries(['orders']); qc.invalidateQueries(['dashboard']); onClose(); },
  });

  return (
    <Modal title="確認出貨" onClose={onClose}>
      <div className="space-y-4">
        <div className="card p-4 bg-green-50 border-green-200">
          <div className="text-sm font-medium text-green-800">出貨單 {shipment.shipment_no}</div>
          <div className="text-sm text-green-700">{shipment.customer_name}</div>
        </div>
        <div>
          <label className="label">貨運商</label>
          <input className="input" value={carrier} onChange={e => setCarrier(e.target.value)} placeholder="黑貓、宅急便..." />
        </div>
        <div>
          <label className="label">追蹤號碼</label>
          <input className="input" value={tracking} onChange={e => setTracking(e.target.value)} />
        </div>
        <button className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? '出貨中...' : '確認出貨'}
        </button>
      </div>
    </Modal>
  );
}

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'preparing', label: '備料中' },
  { key: 'shipped', label: '已出貨' },
];

export default function Shipments() {
  const [tab, setTab] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [shipping, setShipping] = useState(null);
  const [printShipment, setPrintShipment] = useState(null);

  const { data: shipments = [], isLoading } = useQuery({
    queryKey: ['shipments', tab],
    queryFn: () => getShipments({ status: tab !== 'all' ? tab : undefined }),
  });

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">出貨管理</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          建立出貨
        </button>
      </div>

      <div className="flex gap-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : shipments.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無出貨單</div>
      ) : (
        <div className="space-y-2">
          {shipments.map(s => {
            const st = STATUS_SHIP[s.status] || STATUS_SHIP.preparing;
            return (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-slate-500">{s.shipment_no}</span>
                      <span className={`badge ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="font-semibold text-slate-800">{s.customer_name}</div>
                    {s.carrier && <div className="text-xs text-slate-400 mt-0.5">{s.carrier} {s.tracking_no && `· ${s.tracking_no}`}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setPrintShipment(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors" title="列印出貨單">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                      </svg>
                    </button>
                    {s.status === 'preparing' && (
                      <button className="btn-secondary text-xs" onClick={() => setShipping(s)}>出貨</button>
                    )}
                    {s.status === 'shipped' && (
                      <div className="text-right">
                        <div className="text-xs font-medium text-green-600">已出貨</div>
                        <div className="text-xs text-slate-400">{formatDate(s.shipped_at)}</div>
                      </div>
                    )}
                  </div>
                </div>
                {s.items?.length > 0 && (
                  <div className="border-t border-slate-50 pt-3 space-y-1">
                    {s.items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-slate-600">{item.product_code && <span className="text-slate-400 mr-1">{item.product_code}</span>}{item.product_name}</span>
                        <span className="font-medium text-slate-700">{item.qty.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <Modal title="建立出貨單" onClose={() => setShowCreate(false)}><ShipmentForm onClose={() => setShowCreate(false)} /></Modal>}
      {shipping && <ShipModal shipment={shipping} onClose={() => setShipping(null)} />}
      {printShipment && <PrintShipmentPDF shipment={printShipment} onClose={() => setPrintShipment(null)} />}
    </div>
  );
}
