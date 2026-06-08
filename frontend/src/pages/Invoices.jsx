import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getInvoices = (status) => api.get('/invoices', { params: status ? { status } : {} }).then(r => r.data);
const getSummary = () => api.get('/invoices/summary').then(r => r.data);
const getOrders = () => api.get('/orders').then(r => r.data);
const getCustomers = () => api.get('/customers').then(r => r.data);
const createInvoice = (data) => api.post('/invoices', data).then(r => r.data);
const payInvoice = (id, data) => api.patch(`/invoices/${id}/pay`, data).then(r => r.data);
const deleteInvoice = (id) => api.delete(`/invoices/${id}`).then(r => r.data);

const STATUS = {
  unpaid:  { label: '未收款', color: 'bg-amber-100 text-amber-700' },
  partial: { label: '部分收款', color: 'bg-blue-100 text-blue-700' },
  paid:    { label: '已收款', color: 'bg-green-100 text-green-700' },
};

function InvoiceForm({ onClose }) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({ queryKey: ['orders'], queryFn: getOrders });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: getCustomers });
  const [form, setForm] = useState({
    order_id: '', customer_id: '', customer_name: '',
    issue_date: dayjs().format('YYYY-MM-DD'),
    due_date: dayjs().add(30, 'day').format('YYYY-MM-DD'),
    amount: '', payment_method: '', note: '',
  });

  const pickOrder = (id) => {
    const o = orders.find(o => o.id === id);
    const c = customers.find(c => c.name === o?.customer_name);
    setForm(f => ({ ...f, order_id: id, customer_name: o?.customer_name || f.customer_name, customer_id: c?.id || f.customer_id }));
  };

  const mut = useMutation({
    mutationFn: () => createInvoice({ ...form, amount: +form.amount }),
    onSuccess: () => { qc.invalidateQueries(['invoices']); qc.invalidateQueries(['invoices-summary']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">關聯訂單（選填）</label>
        <select className="select" value={form.order_id} onChange={e => pickOrder(e.target.value)}>
          <option value="">-- 選填 --</option>
          {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">客戶名稱 *</label>
          <input className="input" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
        </div>
        <div>
          <label className="label">金額 (元) *</label>
          <input type="number" min={1} className="input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">開票日期</label>
          <input type="date" className="input" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">到期日 *</label>
          <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">付款方式</label>
        <select className="select" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
          <option value="">-- 選填 --</option>
          {['月結30天', '月結60天', '現金', '匯款', '支票'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">備註</label>
        <input className="input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.customer_name || !form.amount || !form.due_date || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立應收帳款'}
      </button>
    </div>
  );
}

function PayModal({ invoice, onClose }) {
  const qc = useQueryClient();
  const outstanding = (invoice.amount || 0) - (invoice.paid_amount || 0);
  const [form, setForm] = useState({ paid_amount: outstanding, payment_method: invoice.payment_method || '', paid_at: dayjs().format('YYYY-MM-DD'), note: '' });

  const mut = useMutation({
    mutationFn: () => payInvoice(invoice.id, form),
    onSuccess: () => { qc.invalidateQueries(['invoices']); qc.invalidateQueries(['invoices-summary']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-bold text-slate-800">登記收款</div>
            <div className="text-sm text-slate-500">{invoice.invoice_no} · 未收 {outstanding.toLocaleString()} 元</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="label">收款金額 (元) *</label>
            <input type="number" min={1} max={outstanding} className="input text-2xl font-bold text-center py-4" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: +e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">收款日期</label>
              <input type="date" className="input" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
            </div>
            <div>
              <label className="label">付款方式</label>
              <input className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} placeholder="現金、匯款..." />
            </div>
          </div>
          <button className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700" onClick={() => mut.mutate()} disabled={!form.paid_amount || mut.isPending}>
            {mut.isPending ? '登記中...' : '確認收款'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [{ k: '', l: '全部' }, { k: 'unpaid', l: '未收款' }, { k: 'partial', l: '部分收款' }, { k: 'paid', l: '已收款' }];

export default function Invoices() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('unpaid');
  const [showCreate, setShowCreate] = useState(false);
  const [paying, setPaying] = useState(null);

  const { data: invoices = [], isLoading } = useQuery({ queryKey: ['invoices', tab], queryFn: () => getInvoices(tab || undefined) });
  const { data: summary } = useQuery({ queryKey: ['invoices-summary'], queryFn: getSummary });
  const deleteMut = useMutation({ mutationFn: deleteInvoice, onSuccess: () => { qc.invalidateQueries(['invoices']); qc.invalidateQueries(['invoices-summary']); } });

  const { stats = {}, aging = {} } = summary || {};
  const today = dayjs().format('YYYY-MM-DD');

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">應收帳款</h1>
          {stats.overdue_count > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{stats.overdue_count} 筆逾期未收</div>}
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增帳款
        </button>
      </div>

      {/* 帳款統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: '應收總額', v: stats.outstanding ? `${(stats.outstanding).toLocaleString()}元` : '-', c: 'text-slate-800' },
          { l: '逾期金額', v: stats.overdue_amount ? `${(stats.overdue_amount).toLocaleString()}元` : '0', c: stats.overdue_amount > 0 ? 'text-red-600' : 'text-green-600' },
          { l: '未收筆數', v: stats.unpaid_count || 0, c: 'text-amber-600' },
          { l: '逾期筆數', v: stats.overdue_count || 0, c: stats.overdue_count > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(item => (
          <div key={item.l} className="card p-3 text-center">
            <div className={`text-xl font-bold ${item.c}`}>{item.v}</div>
            <div className="text-xs text-slate-400 mt-0.5">{item.l}</div>
          </div>
        ))}
      </div>

      {/* 帳齡分析 */}
      {(aging.d30 > 0 || aging.d31_60 > 0 || aging.d61_plus > 0) && (
        <div className="card p-4">
          <div className="font-semibold text-slate-700 mb-3 text-sm">帳齡分析</div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {[
              { l: '未到期', v: aging.current || 0, c: 'text-green-600' },
              { l: '逾期 1-30 天', v: aging.d30 || 0, c: 'text-amber-600' },
              { l: '逾期 31-60 天', v: aging.d31_60 || 0, c: 'text-orange-600' },
              { l: '逾期 60 天+', v: aging.d61_plus || 0, c: 'text-red-600' },
            ].map(item => (
              <div key={item.l} className="bg-slate-50 rounded-xl p-2">
                <div className={`font-bold text-base ${item.c}`}>{item.v ? `${(+item.v).toLocaleString()}` : '-'}</div>
                <div className="text-slate-400 text-xs">{item.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.l}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : invoices.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無應收帳款記錄</div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const st = STATUS[inv.status] || STATUS.unpaid;
            const outstanding = (inv.amount || 0) - (inv.paid_amount || 0);
            return (
              <div key={inv.id} className={`card p-4 ${inv.is_overdue ? 'border-red-200 bg-red-50' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-xs text-slate-400">{inv.invoice_no}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                      {inv.is_overdue && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">逾期 {inv.overdue_days} 天</span>}
                    </div>
                    <div className="font-semibold text-slate-800">{inv.customer_name}</div>
                    <div className="flex gap-3 mt-1 text-xs text-slate-400">
                      {inv.order_no && <span>{inv.order_no}</span>}
                      <span>到期：{inv.due_date}</span>
                      {inv.payment_method && <span>{inv.payment_method}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-800">{(inv.amount || 0).toLocaleString()} 元</div>
                    {outstanding > 0 && outstanding < inv.amount && (
                      <div className="text-xs text-amber-600">未收 {outstanding.toLocaleString()}</div>
                    )}
                  </div>
                </div>
                {inv.status !== 'paid' && (
                  <div className="flex gap-2 pt-2 border-t border-slate-100 mt-1">
                    <button onClick={() => setPaying(inv)} className="btn-primary text-xs py-1.5 flex-1 bg-green-600 hover:bg-green-700">登記收款</button>
                    <button onClick={() => { if (confirm('確定刪除？')) deleteMut.mutate(inv.id); }} className="text-xs text-slate-300 hover:text-red-500 px-2">刪除</button>
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
              <h2 className="font-bold text-slate-800">新增應收帳款</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4"><InvoiceForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}
      {paying && <PayModal invoice={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
