import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getLaborDashboard } from '../api/laborPayroll';
import { exportElementToPDF } from '../utils/exportUtils';

const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;

function Stat({ label, value, sub, color = 'text-slate-800', onClick }) {
  return (
    <div className={`card p-4 ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`} onClick={onClick}>
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function LaborDashboard() {
  const navigate = useNavigate();
  const reportRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['labor-dashboard'], queryFn: getLaborDashboard, refetchInterval: 60000 });

  const exportPDFFn = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try { await exportElementToPDF(reportRef.current, `營運儀表板_${data?.month || ''}`); }
    finally { setExporting(false); }
  };

  if (isError) return (
    <div className="card p-8 text-center mt-6">
      <div className="text-red-500 font-medium">載入失敗</div>
      <button className="btn-secondary text-sm mt-3" onClick={() => refetch()}>重新載入</button>
    </div>
  );
  if (isLoading || !data) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent" /></div>;

  const { workers, matching, finance, top_work_types = [], top_areas = [], top_workers = [], trend = [], todos } = data;
  const maxWT = Math.max(...top_work_types.map(t => t.count), 1);

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">營運儀表板</h1>
          <div className="text-sm text-slate-500">{data.month} 點工媒合平台總覽</div>
        </div>
        <button onClick={exportPDFFn} disabled={exporting} className="btn-secondary text-sm shrink-0">{exporting ? '產生中...' : '匯出 PDF'}</button>
      </div>

      <div ref={reportRef} className="space-y-4 bg-white">
      {/* 待辦提醒 */}
      {(todos.pending_invitations > 0 || todos.active_jobs > 0) && (
        <div className="flex gap-2 flex-wrap">
          {todos.pending_invitations > 0 && (
            <button onClick={() => navigate('/worker-center')} className="card px-4 py-2 bg-amber-50 border-amber-200 text-sm text-amber-700 font-medium">
              {todos.pending_invitations} 則邀約待回覆
            </button>
          )}
          {todos.active_jobs > 0 && (
            <button onClick={() => navigate('/today-jobs')} className="card px-4 py-2 bg-green-50 border-green-200 text-sm text-green-700 font-medium">
              {todos.active_jobs} 件工作進行中
            </button>
          )}
        </div>
      )}

      {/* 媒合漏斗 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">本月媒合</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="邀約數" value={matching.invitations} color="text-blue-600" onClick={() => navigate('/labor-map')} />
          <Stat label="已接受" value={matching.accepted} color="text-indigo-600" />
          <Stat label="已完工" value={matching.completed} color="text-green-600" onClick={() => navigate('/today-jobs')} />
          <Stat label="接受率" value={`${matching.accept_rate}%`} color={matching.accept_rate >= 60 ? 'text-green-600' : 'text-amber-600'} />
        </div>
      </div>

      {/* 點工 + 財務 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="上架點工" value={`${workers.listed}/${workers.total}`} sub="已上架/總數" onClick={() => navigate('/labor-map')} />
        <Stat label="本月收款" value={fmt(finance.received)} color="text-green-600" onClick={() => navigate('/project-finance')} />
        <Stat label="本月成本" value={fmt(finance.cost)} color="text-orange-600" />
        <Stat label="本月盈虧" value={fmt(finance.profit)} color={finance.profit >= 0 ? 'text-green-600' : 'text-red-600'} />
      </div>

      {/* 7日趨勢 */}
      <div className="card p-4">
        <div className="font-semibold text-slate-700 mb-3">近 7 日媒合趨勢</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ left: -20, right: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="invitations" name="邀約" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="completed" name="完工" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 熱門工種 */}
        <div className="card p-4">
          <div className="font-semibold text-slate-700 mb-3">點工工種分布</div>
          {top_work_types.length === 0 ? <div className="text-sm text-slate-400 py-4 text-center">尚無資料</div> : (
            <div className="space-y-2">
              {top_work_types.map(t => (
                <div key={t.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600">{t.name}</span>
                    <span className="text-slate-400">{t.count} 位</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${t.count / maxWT * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 點工排行 */}
        <div className="card p-4">
          <div className="font-semibold text-slate-700 mb-3">點工排行（完工 + 評分）</div>
          {top_workers.length === 0 ? <div className="text-sm text-slate-400 py-4 text-center">尚無資料</div> : (
            <div className="space-y-2">
              {top_workers.map((w, i) => (
                <div key={w.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i < 3 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{w.name}</div>
                    <div className="text-xs text-amber-500">{'★'.repeat(Math.round(w.rating || 0))}{w.rating_count > 0 ? ` ${w.rating}` : ' 尚無評價'}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-700">{w.completed_jobs}</div>
                    <div className="text-xs text-slate-400">完工</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 區域分布 */}
      {top_areas.length > 0 && (
        <div className="card p-4">
          <div className="font-semibold text-slate-700 mb-3">服務區域分布</div>
          <div className="flex flex-wrap gap-2">
            {top_areas.map(a => (
              <span key={a.name} className="text-sm bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">{a.name} <strong className="text-slate-800">{a.count}</strong></span>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
