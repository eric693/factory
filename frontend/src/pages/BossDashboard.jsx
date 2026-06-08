import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import axios from 'axios';
import dayjs from 'dayjs';

const getBoss = () => axios.get('/api/boss-dashboard').then(r => r.data);

function KPI({ label, value, sub, color = 'text-slate-800', onClick, warn }) {
  return (
    <div className={`card p-4 ${warn ? 'border-red-200 bg-red-50' : ''} ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`} onClick={onClick}>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function BossDashboard() {
  const navigate = useNavigate();
  const [now, setNow] = useState(dayjs());
  const { data, isLoading, refetch } = useQuery({ queryKey: ['boss-dashboard'], queryFn: getBoss, refetchInterval: 60000 });

  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 60000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>;

  const { revenue = {}, ar = {}, production = {}, alerts = {}, ar_overdue = [], quotes = {} } = data || {};
  const todayProd = production.today || {};
  const monthProd = production.month || {};
  const dailyData = production.daily || [];

  const winRate = quotes.total > 0 && (quotes.won + quotes.lost) > 0
    ? Math.round(quotes.won / (quotes.won + quotes.lost) * 100)
    : null;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-400">{now.format('YYYY年MM月DD日')}</div>
          <h1 className="text-2xl font-bold text-slate-800">管理總覽</h1>
        </div>
        <button onClick={() => refetch()} className="text-xs text-slate-400 hover:text-brand-600 mt-1">更新</button>
      </div>

      {/* 緊急警示 */}
      {(alerts.overdue_orders > 0 || alerts.open_anomalies?.cnt > 0 || ar.overdue > 0 || alerts.overrun_wos?.length > 0) && (
        <div className="space-y-2">
          {alerts.overdue_orders > 0 && (
            <div className="card p-3 bg-red-50 border-red-200 flex items-center justify-between cursor-pointer" onClick={() => navigate('/orders')}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-semibold text-red-800">逾期訂單 {alerts.overdue_orders} 張</span>
              </div>
              <span className="text-xs text-red-500">查看</span>
            </div>
          )}
          {alerts.open_anomalies?.cnt > 0 && (
            <div className="card p-3 bg-amber-50 border-amber-200 flex items-center justify-between cursor-pointer" onClick={() => navigate('/anomalies')}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm font-semibold text-amber-800">
                  未解決異常 {alerts.open_anomalies.cnt} 件
                  {alerts.open_anomalies.high_cnt > 0 && <span className="text-red-700">（高嚴重 {alerts.open_anomalies.high_cnt}）</span>}
                </span>
              </div>
              <span className="text-xs text-amber-500">查看</span>
            </div>
          )}
          {alerts.overrun_wos?.length > 0 && (
            <div className="card p-3 bg-orange-50 border-orange-200">
              <div className="text-xs font-bold text-orange-700 uppercase mb-1.5">工時超時工單</div>
              {alerts.overrun_wos.map(wo => (
                <div key={wo.wo_no} className="flex items-center justify-between text-sm py-0.5">
                  <span className="text-orange-700 truncate">{wo.wo_no} · {wo.product_name}</span>
                  <span className="font-bold text-orange-800 shrink-0 ml-2">{wo.actual_hrs}h / {wo.std_hrs}h 標準</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 財務 KPI */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">財務</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="本月收入" value={revenue.month ? `${(revenue.month / 1000).toFixed(0)}K` : '-'} color="text-green-600" onClick={() => navigate('/profit')} />
          <KPI label="應收帳款" value={ar.outstanding ? `${(ar.outstanding / 1000).toFixed(0)}K` : '-'} color="text-slate-800" onClick={() => navigate('/invoices')} />
          <KPI label="逾期帳款" value={ar.overdue ? `${(ar.overdue / 1000).toFixed(0)}K` : '0'} color={ar.overdue > 0 ? 'text-red-600' : 'text-green-600'} warn={ar.overdue > 50000} onClick={() => navigate('/invoices')} />
          <KPI label="報價勝率" value={winRate !== null ? `${winRate}%` : '-'} sub={`本月 ${quotes.won || 0} 勝 / ${quotes.lost || 0} 敗`} color={winRate >= 60 ? 'text-green-600' : winRate >= 40 ? 'text-amber-600' : 'text-red-500'} onClick={() => navigate('/quotes')} />
        </div>
      </div>

      {/* 生產 KPI */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">今日生產</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="今日良品" value={(todayProd.ok_qty || 0).toLocaleString()} color="text-brand-600" />
          <KPI label="今日不良" value={todayProd.defect_qty || 0} color={todayProd.defect_qty > 0 ? 'text-red-500' : 'text-slate-400'} />
          <KPI label="今日良率" value={
            (todayProd.ok_qty || 0) + (todayProd.defect_qty || 0) > 0
              ? `${Math.round((todayProd.ok_qty || 0) / ((todayProd.ok_qty || 0) + (todayProd.defect_qty || 0)) * 100)}%`
              : '-'
          } color="text-indigo-600" />
          <KPI label="本月累計良品" value={(monthProd.ok_qty || 0).toLocaleString()} sub="件" />
        </div>
      </div>

      {/* 7日產量趨勢 */}
      <div className="card p-4">
        <div className="font-semibold text-slate-700 mb-3">近7日產量趨勢</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} margin={{ left: -20, right: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => `${v} 件`} />
              <Bar dataKey="qty" name="良品" fill="#0e7de8" radius={[3,3,0,0]} />
              <Bar dataKey="defect" name="不良" fill="#ef4444" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 逾期帳款 */}
      {ar_overdue.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-700">逾期未收款（前5大）</div>
            <button onClick={() => navigate('/invoices')} className="text-xs text-brand-600 hover:underline">全部</button>
          </div>
          <div className="space-y-2">
            {ar_overdue.map(inv => (
              <div key={inv.invoice_no} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{inv.customer_name}</div>
                  <div className="text-xs text-slate-400">{inv.invoice_no} · 到期 {inv.due_date}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-red-600">{(inv.outstanding || 0).toLocaleString()} 元</div>
                  <div className="text-xs text-red-400">逾期 {inv.overdue_days} 天</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 快速入口 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">快速入口</div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {[
            { label: '訂單利潤', path: '/profit', color: 'bg-green-50 text-green-700' },
            { label: '應收帳款', path: '/invoices', color: 'bg-blue-50 text-blue-700' },
            { label: '報價管理', path: '/quotes', color: 'bg-indigo-50 text-indigo-700' },
            { label: '師傅績效', path: '/performance', color: 'bg-brand-50 text-brand-700' },
            { label: '產能規劃', path: '/capacity-plan', color: 'bg-amber-50 text-amber-700' },
            { label: '異常通報', path: '/anomalies', color: 'bg-red-50 text-red-700' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`card p-3 text-center active:scale-95 transition-transform ${item.color} border-transparent`}
            >
              <div className="text-xs font-semibold leading-tight">{item.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
