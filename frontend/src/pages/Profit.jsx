import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import axios from 'axios';
import dayjs from 'dayjs';

const api = axios.create({ baseURL: '/api' });
const getProfitOrders = (params) => api.get('/profit/orders', { params }).then(r => r.data);
const getMonthly = (year) => api.get('/profit/monthly', { params: { year } }).then(r => r.data);
const getCustomers = (year) => api.get('/profit/customers', { params: { year } }).then(r => r.data);
const setRevenue = (order_id, data) => api.patch(`/profit/orders/${order_id}/revenue`, data).then(r => r.data);
const getOrderDetail = (id) => api.get(`/api/orders/${id}`).then(r => r.data);

function MarginBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-slate-400">未設定收入</span>;
  const color = pct >= 30 ? 'bg-green-100 text-green-700' : pct >= 15 ? 'bg-blue-100 text-blue-700' : pct >= 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{pct}%</span>;
}

function RevenueModal({ order, onClose }) {
  const qc = useQueryClient();
  const [totalRevenue, setTotalRevenue] = useState(order.revenue || '');

  const mut = useMutation({
    mutationFn: () => setRevenue(order.id, { total_revenue: +totalRevenue }),
    onSuccess: () => { qc.invalidateQueries(['profit-orders']); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-bold text-slate-800">設定訂單收入</div>
            <div className="text-sm text-slate-500">{order.order_no} · {order.customer_name}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="card p-3 bg-slate-50 text-sm grid grid-cols-2 gap-2">
            <div><div className="text-slate-400 text-xs">原料成本</div><div className="font-semibold">{order.material_cost?.toLocaleString()} 元</div></div>
            <div><div className="text-slate-400 text-xs">人工成本</div><div className="font-semibold">{order.labor_cost?.toLocaleString()} 元</div></div>
            <div><div className="text-slate-400 text-xs">外發成本</div><div className="font-semibold">{order.outsource_cost?.toLocaleString()} 元</div></div>
            <div><div className="text-slate-400 text-xs">總成本</div><div className="font-bold text-slate-800">{order.total_cost?.toLocaleString()} 元</div></div>
          </div>
          <div>
            <label className="label">訂單收入（元）</label>
            <input type="number" min={0} className="input text-2xl font-bold text-center py-4" value={totalRevenue} onChange={e => setTotalRevenue(e.target.value)} placeholder="0" />
          </div>
          {totalRevenue && (
            <div className="text-center text-sm">
              毛利 <strong className={+totalRevenue - order.total_cost >= 0 ? 'text-green-600' : 'text-red-600'}>{(+totalRevenue - order.total_cost).toLocaleString()} 元</strong>
              {' · '}毛利率 <strong>{order.total_cost > 0 ? Math.round((+totalRevenue - order.total_cost) / +totalRevenue * 100 * 10) / 10 : '-'}%</strong>
            </div>
          )}
          <button className="btn-primary w-full py-3" onClick={() => mut.mutate()} disabled={!totalRevenue || mut.isPending}>
            {mut.isPending ? '儲存中...' : '儲存收入'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TABS = [{ k: 'orders', l: '訂單利潤' }, { k: 'monthly', l: '月度趨勢' }, { k: 'customers', l: '客戶貢獻' }];

export default function Profit() {
  const [tab, setTab] = useState('orders');
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [year, setYear] = useState(dayjs().format('YYYY'));
  const [settingRevenue, setSettingRevenue] = useState(null);

  const { data: ordersData = { orders: [], totals: {} }, isLoading: ordersLoading } = useQuery({
    queryKey: ['profit-orders', month],
    queryFn: () => getProfitOrders({ month }),
    enabled: tab === 'orders',
  });
  const { data: monthly = [], isLoading: monthlyLoading } = useQuery({
    queryKey: ['profit-monthly', year],
    queryFn: () => getMonthly(year),
    enabled: tab === 'monthly',
  });
  const { data: customers = [], isLoading: custLoading } = useQuery({
    queryKey: ['profit-customers', year],
    queryFn: () => getCustomers(year),
    enabled: tab === 'customers',
  });

  const { orders, totals } = ordersData;

  const fmtCurrency = (n) => n ? `${n.toLocaleString()} 元` : '-';

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">訂單利潤分析</h1>
          <div className="text-xs text-slate-400 mt-0.5">收入 - 成本 = 毛利，點擊訂單可設定收入</div>
        </div>
        <div className="flex gap-2 items-center">
          {tab === 'orders' && <input type="month" className="input w-auto text-sm py-1.5" value={month} onChange={e => setMonth(e.target.value)} />}
          {(tab === 'monthly' || tab === 'customers') && <input type="number" min={2020} max={2030} className="input w-24 text-sm py-1.5" value={year} onChange={e => setYear(e.target.value)} />}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${tab === t.k ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.l}</button>
        ))}
      </div>

      {tab === 'orders' && (
        <>
          {/* 月度合計 */}
          {orders.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: '總收入', v: fmtCurrency(totals.revenue), c: 'text-green-600' },
                { l: '總成本', v: fmtCurrency(totals.total_cost), c: 'text-red-500' },
                { l: '毛利', v: fmtCurrency(totals.gross_profit), c: totals.gross_profit >= 0 ? 'text-brand-600' : 'text-red-600' },
                { l: '平均毛利率', v: totals.avg_margin !== null ? `${totals.avg_margin}%` : '-', c: (totals.avg_margin || 0) >= 20 ? 'text-green-600' : 'text-amber-600' },
              ].map(item => (
                <div key={item.l} className="card p-4 text-center">
                  <div className={`text-xl font-bold ${item.c}`}>{item.v}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.l}</div>
                </div>
              ))}
            </div>
          )}

          {ordersLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
          ) : orders.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">此月份暫無訂單</div>
          ) : (
            <div className="space-y-2">
              {orders.map(order => (
                <div key={order.id} className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSettingRevenue(order)}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs text-slate-400">{order.order_no}</span>
                        <MarginBadge pct={order.gross_margin_pct} />
                      </div>
                      <div className="font-semibold text-slate-800 truncate">{order.customer_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-bold ${(order.gross_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {order.gross_profit ? `${order.gross_profit.toLocaleString()} 元` : '未設收入'}
                      </div>
                      <div className="text-xs text-slate-400">毛利</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="font-bold text-green-700">{(order.revenue || 0).toLocaleString()}</div>
                      <div className="text-slate-400">收入</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <div className="font-bold text-slate-700">{(order.total_cost || 0).toLocaleString()}</div>
                      <div className="text-slate-400">成本</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <div className="font-bold text-slate-600">{(order.material_cost || 0).toLocaleString()} / {(order.labor_cost || 0).toLocaleString()}</div>
                      <div className="text-slate-400">料/工</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'monthly' && (
        monthlyLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div> :
        <div className="space-y-4">
          <div className="card p-4">
            <div className="font-semibold text-slate-700 mb-4">{year} 年月度利潤趨勢</div>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => `${v?.toLocaleString()} 元`} />
                  <Legend />
                  <Bar dataKey="revenue" name="收入" fill="#10b981" radius={[3,3,0,0]} />
                  <Bar dataKey="total_cost" name="成本" fill="#f97316" radius={[3,3,0,0]} />
                  <Bar dataKey="gross_profit" name="毛利" fill="#0e7de8" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-4">
            <div className="font-semibold text-slate-700 mb-4">月度毛利率趨勢</div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[-10, 60]} />
                  <Tooltip formatter={v => `${v}%`} />
                  <Line type="monotone" dataKey="margin_pct" name="毛利率" stroke="#0e7de8" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === 'customers' && (
        custLoading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div> :
        customers.length === 0 ? <div className="card p-12 text-center text-slate-400">尚無已設定收入的訂單</div> :
        <div className="space-y-2">
          {customers.map((c, i) => (
            <div key={c.customer_name} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{c.customer_name}</div>
                  <div className="text-xs text-slate-400">{c.order_count} 張訂單 · {c.shipped_count} 已出貨</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-green-600">{(c.total_revenue || 0).toLocaleString()} 元</div>
                  <div className="text-xs text-slate-400">年度收入</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {settingRevenue && <RevenueModal order={settingRevenue} onClose={() => setSettingRevenue(null)} />}
    </div>
  );
}
