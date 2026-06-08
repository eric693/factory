import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getAttendanceReport } from '../api/laborPayroll';
import { exportSimpleExcel, exportElementToPDF } from '../utils/exportUtils';

const SKILL_COLOR = {
  師傅: 'bg-indigo-100 text-indigo-700',
  半技: 'bg-green-100 text-green-700',
  學徒: 'bg-amber-100 text-amber-700',
};

export default function LaborAttendance() {
  const [range, setRange] = useState({
    start: dayjs().startOf('month').format('YYYY-MM-DD'),
    end: dayjs().endOf('month').format('YYYY-MM-DD'),
  });
  const [view, setView] = useState('worker'); // worker | daily
  const [expanded, setExpanded] = useState(null);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['attendance-report', range],
    queryFn: () => getAttendanceReport(range),
  });

  const exportExcelFn = () => {
    if (!data) return;
    exportSimpleExcel(
      `出勤報表_${range.start}_${range.end}`, '出勤明細',
      [
        { header: '完工日期', accessor: r => r.completed_at?.slice(0, 10) },
        { header: '點工', accessor: r => r.worker_name },
        { header: '級距', accessor: r => r.skill_level || '' },
        { header: '專案', accessor: r => r.project_name },
        { header: '地點', accessor: r => r.location || '' },
        { header: '金額', accessor: r => r.offer_price || 0 },
      ],
      data.records
    );
  };

  const exportPDFFn = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try { await exportElementToPDF(reportRef.current, `出勤報表_${range.start}_${range.end}`); }
    finally { setExporting(false); }
  };

  // 依日期分組
  const byDate = {};
  (data?.records || []).forEach(r => {
    const d = r.completed_at?.slice(0, 10);
    (byDate[d] = byDate[d] || []).push(r);
  });

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">出勤報表</h1>
          <div className="text-sm text-slate-500">完工出勤統計與匯出</div>
        </div>
        {data?.records?.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-secondary text-sm" onClick={exportExcelFn}>匯出 Excel</button>
            <button className="btn-secondary text-sm" onClick={exportPDFFn} disabled={exporting}>{exporting ? '產生中...' : '匯出 PDF'}</button>
          </div>
        )}
      </div>

      {/* 日期 + 檢視切換 */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <input type="date" className="input w-auto text-sm py-1.5" value={range.start} onChange={e => setRange(r => ({ ...r, start: e.target.value }))} />
        <span className="text-slate-400">至</span>
        <input type="date" className="input w-auto text-sm py-1.5" value={range.end} onChange={e => setRange(r => ({ ...r, end: e.target.value }))} />
        <div className="flex rounded-xl overflow-hidden border border-slate-200 ml-auto">
          {[['worker', '依點工'], ['daily', '依日期']].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 text-xs font-medium ${view === k ? 'bg-indigo-600 text-white' : 'text-slate-600'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div ref={reportRef} className="space-y-4 bg-white">
      {/* 摘要 */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-slate-800">{data.total_days}</div>
            <div className="text-xs text-slate-400">總出勤工日</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{(data.total_income || 0).toLocaleString()}</div>
            <div className="text-xs text-slate-400">總工資（元）</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-indigo-600">{data.by_worker?.length || 0}</div>
            <div className="text-xs text-slate-400">出勤人數</div>
          </div>
        </div>
      )}

      {isError ? (
        <div className="card p-8 text-center"><div className="text-red-500">載入失敗</div><button className="btn-secondary text-sm mt-3" onClick={() => refetch()}>重新載入</button></div>
      ) : isLoading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-7 w-7 border-2 border-indigo-600 border-t-transparent" /></div>
      ) : data?.records?.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">此期間無完工出勤記錄</div>
      ) : view === 'worker' ? (
        <div className="space-y-2">
          {data.by_worker.map(w => (
            <div key={w.worker_id} className="card overflow-hidden">
              <div className="p-4 cursor-pointer" onClick={() => setExpanded(expanded === w.worker_id ? null : w.worker_id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">{w.worker_name?.[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{w.worker_name}</span>
                      {w.skill_level && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SKILL_COLOR[w.skill_level] || ''}`}>{w.skill_level}</span>}
                    </div>
                    <div className="text-xs text-slate-400">{w.days} 個工日</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-green-600">{w.income.toLocaleString()} 元</div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-4 h-4 text-slate-300 inline transition-transform ${expanded === w.worker_id ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                </div>
              </div>
              {expanded === w.worker_id && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {w.jobs.map(j => (
                    <div key={j.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <div className="text-slate-700">{j.project_name}</div>
                        <div className="text-xs text-slate-400">{j.completed_at?.slice(0, 10)}{j.location && ` · ${j.location}`}</div>
                      </div>
                      {j.offer_price > 0 && <span className="text-green-600 font-medium">{j.offer_price.toLocaleString()}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).map(([date, jobs]) => (
            <div key={date} className="card overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 flex items-center justify-between">
                <span className="font-semibold text-slate-700 text-sm">{dayjs(date).format('M月D日 ddd')}</span>
                <span className="text-xs text-slate-400">{jobs.length} 工日 · {jobs.reduce((s, j) => s + (j.offer_price || 0), 0).toLocaleString()} 元</span>
              </div>
              <div className="divide-y divide-slate-50">
                {jobs.map(j => (
                  <div key={j.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{j.worker_name}</span>
                      <span className="text-slate-500"> · {j.project_name}</span>
                      {j.location && <div className="text-xs text-slate-400">{j.location}</div>}
                    </div>
                    {j.offer_price > 0 && <span className="text-green-600 font-medium">{j.offer_price.toLocaleString()}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
