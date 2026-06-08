import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { STATUS_ORDER, formatDate } from '../utils';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getCustomers = () => api.get('/customers').then(r => r.data);
const getCustomerCRM = (id) => api.get(`/customers/${id}/crm`).then(r => r.data);
const createCustomer = (data) => api.post('/customers', data).then(r => r.data);
const updateCustomer = (id, data) => api.patch(`/customers/${id}`, data).then(r => r.data);

function CustomerDetail({ customerId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-crm', customerId],
    queryFn: () => getCustomerCRM(customerId),
  });

  if (isLoading) return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  const { customer, orders = [], stats } = data || {};

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800 text-lg">{customer?.name}</div>
            {customer?.contact && <div className="text-sm text-slate-500">{customer.contact}</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* 統計 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '總訂單', value: stats?.total_orders || 0, color: 'text-slate-800' },
              { label: '進行中', value: stats?.active || 0, color: 'text-indigo-600' },
              { label: '已出貨', value: stats?.shipped || 0, color: 'text-green-600' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* 聯絡資訊 */}
          {(customer?.contact || customer?.phone) && (
            <div className="card p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">聯絡資訊</div>
              {customer?.contact && (
                <div className="flex items-center gap-2 text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-400">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <span className="text-slate-700">{customer.contact}</span>
                </div>
              )}
              {customer?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-slate-400">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.7A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.09 6.09l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
                  </svg>
                  <span className="text-slate-700">{customer.phone}</span>
                </div>
              )}
            </div>
          )}

          {/* 客戶查詢連結 */}
          {customer?.query_token && (
            <div className="card p-3 bg-blue-50 border-blue-100">
              <div className="text-xs font-semibold text-blue-600 mb-1">客戶查詢連結</div>
              <div className="text-xs text-blue-500 break-all">{window.location.origin}/customer/{customer.query_token}</div>
              <button
                onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/customer/${customer.query_token}`)}
                className="mt-2 text-xs text-blue-600 hover:underline"
              >複製連結</button>
            </div>
          )}

          {/* 訂單歷史 */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">訂單歷史</div>
            {orders.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-4">尚無訂單</div>
            ) : (
              <div className="space-y-2">
                {orders.map(o => {
                  const st = STATUS_ORDER[o.status] || STATUS_ORDER.pending;
                  return (
                    <div key={o.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">{o.order_no}</span>
                          <span className={`badge ${st.color}`}>{st.label}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{o.item_count} 品項 · {o.total_qty?.toLocaleString()} 件</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">{formatDate(o.due_date)}</div>
                        <div className="text-xs text-slate-400">{dayjs(o.created_at).format('YYYY/MM/DD')}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerForm({ onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', contact: '', phone: '' });

  const mut = useMutation({
    mutationFn: () => createCustomer(form),
    onSuccess: () => { qc.invalidateQueries(['customers']); onClose(); },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="label">公司名稱 *</label>
        <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="必填" />
      </div>
      <div>
        <label className="label">聯絡人</label>
        <input className="input" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
      </div>
      <div>
        <label className="label">電話</label>
        <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </div>
      <button className="btn-primary w-full py-3" disabled={!form.name || mut.isPending} onClick={() => mut.mutate()}>
        {mut.isPending ? '建立中...' : '建立客戶'}
      </button>
    </div>
  );
}

export default function Customers() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const { data: customers = [], isLoading } = useQuery({ queryKey: ['customers'], queryFn: getCustomers });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">客戶管理</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增客戶
        </button>
      </div>

      <input className="input" placeholder="搜尋客戶名稱、聯絡人..." value={search} onChange={e => setSearch(e.target.value)} />

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">暫無客戶資料</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div
              key={c.id}
              className="card p-4 cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
              onClick={() => setSelectedId(c.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold shrink-0">
                  {c.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{c.name}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    {c.contact && <span>{c.contact}</span>}
                    {c.phone && <span>· {c.phone}</span>}
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
          <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">新增客戶</h2>
              <button onClick={() => setShowCreate(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="px-5 py-4"><CustomerForm onClose={() => setShowCreate(false)} /></div>
          </div>
        </div>
      )}

      {selectedId && <CustomerDetail customerId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
