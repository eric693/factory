import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { STATUS_ORDER, formatDate } from '../utils';
import dayjs from 'dayjs';

const BASE = '/api';

const STATUS_WO_PUBLIC = {
  pending: { label: '等待開工', pct: 0 },
  scheduled: { label: '已排程', pct: 5 },
  in_progress: { label: '生產中', pct: null },
  completed: { label: '完工', pct: 100 },
};

export default function CustomerPortal() {
  const { token } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-orders', token],
    queryFn: () => axios.get(`${BASE}/public/orders/${token}`).then(r => r.data),
    retry: false,
  });

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  if (isError) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="card p-8 text-center max-w-sm w-full">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-16 h-16 mx-auto text-slate-300 mb-3">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div className="font-bold text-slate-700 text-lg">查詢代碼無效</div>
        <div className="text-slate-400 text-sm mt-1">請確認您的查詢連結是否正確</div>
      </div>
    </div>
  );

  const { customer, orders } = data;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-brand-950 text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <div className="text-xs text-brand-400 font-semibold uppercase tracking-widest mb-1">訂單進度查詢</div>
          <div className="text-xl font-bold">{customer.name}</div>
          {customer.contact && <div className="text-sm text-brand-300">聯絡人：{customer.contact}</div>}
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        <div className="text-xs text-slate-400">共 {orders.length} 筆訂單 · 最近 20 筆</div>

        {orders.length === 0 && (
          <div className="card p-12 text-center text-slate-400">目前無訂單記錄</div>
        )}

        {orders.map(order => {
          const st = STATUS_ORDER[order.status] || STATUS_ORDER.pending;
          const daysLeft = dayjs(order.due_date).diff(dayjs(), 'day');
          const overdue = daysLeft < 0 && !['shipped', 'cancelled'].includes(order.status);

          return (
            <div key={order.id} className="card p-4">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-slate-400">{order.order_no}</span>
                    <span className={`badge ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="text-sm text-slate-500">
                    {overdue
                      ? <span className="text-red-500 font-medium">已逾期 {Math.abs(daysLeft)} 天</span>
                      : order.status === 'shipped'
                      ? <span className="text-green-600 font-medium">已出貨</span>
                      : daysLeft === 0 ? '今天交期'
                      : `還有 ${daysLeft} 天（${formatDate(order.due_date)}）`
                    }
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-brand-600">{order.progress_pct}%</div>
                  <div className="text-xs text-slate-400">完成度</div>
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all ${order.status === 'shipped' ? 'bg-green-500' : 'bg-brand-500'}`}
                  style={{ width: `${order.status === 'shipped' ? 100 : order.progress_pct}%` }}
                />
              </div>

              {/* Work orders breakdown */}
              {order.workOrders?.length > 0 && (
                <div className="space-y-2">
                  {order.workOrders.map(wo => {
                    const wst = STATUS_WO_PUBLIC[wo.status] || STATUS_WO_PUBLIC.pending;
                    const woPct = wst.pct !== null ? wst.pct : Math.round((wo.completed_qty / wo.planned_qty) * 100);
                    return (
                      <div key={wo.wo_no} className="bg-slate-50 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <div className="text-sm font-medium text-slate-700">{wo.product_name}</div>
                            <div className="text-xs text-slate-400">{wst.label}</div>
                          </div>
                          <div className="text-sm font-bold text-slate-600">{woPct}%</div>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${wo.status === 'completed' ? 'bg-green-500' : 'bg-brand-400'}`} style={{ width: `${woPct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>完成 {wo.completed_qty} / {wo.planned_qty}</span>
                          <span>預計 {formatDate(wo.planned_end)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {order.note && (
                <div className="mt-3 text-xs text-slate-400 pt-3 border-t border-slate-50">{order.note}</div>
              )}
            </div>
          );
        })}

        <div className="text-center text-xs text-slate-300 pb-4">
          Powered by FactoryOS · 查詢日期 {dayjs().format('YYYY/MM/DD')}
        </div>
      </div>
    </div>
  );
}
