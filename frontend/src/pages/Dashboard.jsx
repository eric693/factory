import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { dashboard } from '../api';
import { STATUS_ORDER, formatDate, isOverdue } from '../utils';
import dayjs from 'dayjs';

function StatCard({ label, value, sub, color, warn, onClick }) {
  return (
    <div
      className={`card p-4 ${warn ? 'ring-1 ring-red-300 bg-red-50' : ''} ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
      onClick={onClick}
    >
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
      <div className={`text-3xl font-bold ${color || 'text-slate-800'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct, color = 'bg-brand-500' }) {
  return (
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [now, setNow] = useState(dayjs());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboard,
    refetchInterval: 30000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  const { orderStats, woStats, overdueOrders, recentProgress, upcomingDue, machineUtilization, yieldRate, bottlenecks = [], warnings = [] } = data;
  const yieldPct = (yieldRate?.total_ok || 0) + (yieldRate?.total_defect || 0) > 0
    ? Math.round(yieldRate.total_ok / (yieldRate.total_ok + yieldRate.total_defect) * 100)
    : null;

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      {/* 頁頭 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-400 font-medium">{now.format('YYYY年MM月DD日 dddd')}</div>
          <h1 className="text-2xl font-bold text-slate-800">生產總覽</h1>
        </div>
        <div className="text-right">
          <div className="text-2xl font-mono font-bold text-brand-600 tabular-nums">{now.format('HH:mm:ss')}</div>
          <button onClick={() => refetch()} className="text-xs text-slate-400 hover:text-brand-600 mt-0.5">重新整理</button>
        </div>
      </div>

      {/* 產能預警橫幅 */}
      {warnings.length > 0 && (
        <div className="card p-4 bg-amber-50 border border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-amber-600 shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="font-semibold text-amber-800 text-sm">產能預警</span>
          </div>
          <div className="space-y-1.5">
            {warnings.map(w => (
              <div key={w.machine_id} className="flex items-center justify-between text-sm gap-3">
                <span className="text-amber-700 truncate">{w.machine_name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 bg-amber-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${w.load_pct >= 100 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(w.load_pct, 100)}%` }} />
                  </div>
                  <span className={`font-bold text-xs w-12 text-right ${w.load_pct >= 100 ? 'text-red-600' : 'text-amber-600'}`}>{w.load_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="訂單總數"
          value={orderStats.total}
          sub={`${orderStats.shipped} 已出貨`}
          onClick={() => navigate('/orders')}
        />
        <StatCard
          label="生產中"
          value={orderStats.in_production}
          color="text-indigo-600"
          sub="張訂單"
          onClick={() => navigate('/work-orders')}
        />
        <StatCard
          label="逾期訂單"
          value={overdueOrders.cnt}
          color={overdueOrders.cnt > 0 ? 'text-red-600' : 'text-green-600'}
          warn={overdueOrders.cnt > 0}
          sub={overdueOrders.cnt > 0 ? '需緊急處理' : '全數準時'}
          onClick={() => navigate('/orders')}
        />
        <StatCard
          label="本月良率"
          value={yieldPct !== null ? `${yieldPct}%` : '-'}
          color={yieldPct === null ? 'text-slate-400' : yieldPct >= 95 ? 'text-green-600' : yieldPct >= 85 ? 'text-amber-600' : 'text-red-600'}
          sub={`良品 ${yieldRate?.total_ok || 0} · 不良 ${yieldRate?.total_defect || 0}`}
        />
      </div>

      {/* 快速入口 - 手機顯示 */}
      <div className="md:hidden grid grid-cols-4 gap-2">
        {[
          { label: '新增訂單', path: '/orders', color: 'text-brand-600 bg-brand-50', icon: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 3h6v4H9z" /> },
          { label: '回報工單', path: '/work-orders', color: 'text-indigo-600 bg-indigo-50', icon: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" /> },
          { label: '異常通報', path: '/anomalies', color: 'text-red-600 bg-red-50', icon: <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
          { label: '生產看板', path: '/kanban', color: 'text-green-600 bg-green-50', icon: <><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></> },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="card p-2.5 text-center active:scale-95 transition-transform"
          >
            <div className={`w-9 h-9 mx-auto mb-1.5 rounded-xl flex items-center justify-center ${item.color}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">{item.icon}</svg>
            </div>
            <div className="text-xs text-slate-600 font-medium leading-tight">{item.label}</div>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 即將到期 */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">即將到期訂單</h2>
            <button onClick={() => navigate('/orders')} className="text-xs text-brand-600 hover:underline">全部</button>
          </div>
          <div className="space-y-2">
            {upcomingDue.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">暫無即將到期訂單</div>}
            {upcomingDue.map(order => {
              const overdue = isOverdue(order.due_date, order.status);
              const daysLeft = dayjs(order.due_date).diff(dayjs(), 'day');
              const st = STATUS_ORDER[order.status] || STATUS_ORDER.pending;
              return (
                <div key={order.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-400">{order.order_no}</span>
                      <span className={`badge ${st.color}`}>{st.label}</span>
                    </div>
                    <div className="text-sm font-medium text-slate-700 truncate">{order.customer_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${overdue ? 'text-red-600' : daysLeft <= 3 ? 'text-amber-600' : 'text-slate-600'}`}>
                      {overdue ? `逾期${Math.abs(daysLeft)}天` : daysLeft === 0 ? '今天到期' : `${daysLeft}天後`}
                    </div>
                    <div className="text-xs text-slate-400">{formatDate(order.due_date)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* TOC 瓶頸分析 */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700">產能負載</h2>
            <button onClick={() => navigate('/kanban')} className="text-xs text-brand-600 hover:underline">看板</button>
          </div>
          <div className="space-y-3">
            {machineUtilization.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">暫無機台資料</div>}
            {machineUtilization.map(m => {
              const bottleneck = bottlenecks.find(b => b.machine_id === m.id);
              const isBottleneck = bottleneck?.is_bottleneck;
              const loadPct = bottleneck?.load_days ? Math.min(100, Math.round(bottleneck.load_days / 20 * 100)) : m.active_jobs > 0 ? 60 : 5;
              return (
                <div key={m.id}>
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700 font-medium">{m.name}</span>
                      {isBottleneck && <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">瓶頸</span>}
                    </div>
                    <span className={`text-xs font-semibold ${isBottleneck ? 'text-red-600' : m.active_jobs > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {bottleneck ? `${bottleneck.total_load_hours}h` : m.active_jobs > 0 ? `${m.active_jobs} 件` : '閒置'}
                    </span>
                  </div>
                  <ProgressBar pct={loadPct} color={isBottleneck ? 'bg-red-500' : m.active_jobs > 0 ? 'bg-indigo-500' : 'bg-slate-200'} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 最新進度回報 */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-700">最新進度回報</h2>
          <button onClick={() => navigate('/work-orders')} className="text-xs text-brand-600 hover:underline">全部工單</button>
        </div>
        {recentProgress.length === 0 && <div className="text-sm text-slate-400 py-4 text-center">尚無回報記錄</div>}
        <div className="space-y-2">
          {recentProgress.map(log => (
            <div key={log.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold shrink-0">
                {(log.operator || '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-700 truncate">{log.product_name}</div>
                <div className="text-xs text-slate-400 truncate">{log.wo_no} · {log.operator}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold text-green-600">+{log.qty} 件</div>
                {log.defect_qty > 0 && <div className="text-xs text-red-500">不良 {log.defect_qty}</div>}
                <div className="text-xs text-slate-400">{dayjs(log.logged_at).format('HH:mm')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
