import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const getCapacity = (weeks) => axios.get('/api/capacity/weekly', { params: { weeks } }).then(r => r.data);

const LOAD_COLOR = {
  ok:         { bar: 'bg-green-500', text: 'text-green-700', badge: 'bg-green-100 text-green-700' },
  warning:    { bar: 'bg-amber-400', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  overloaded: { bar: 'bg-red-500',   text: 'text-red-700',   badge: 'bg-red-100 text-red-700' },
};

export default function CapacityPlan() {
  const [weeks, setWeeks] = useState(13);
  const [viewMode, setViewMode] = useState('heatmap'); // heatmap | table

  const { data, isLoading } = useQuery({
    queryKey: ['capacity-weekly', weeks],
    queryFn: () => getCapacity(weeks),
  });

  const { weeks: weekData = [], machines: machineList = [] } = data || {};

  // 找出超載周次
  const overloadedWeeks = weekData.filter(w => w.machines.some(m => m.status === 'overloaded')).length;
  const warningWeeks = weekData.filter(w => w.machines.some(m => m.status === 'warning')).length;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">產能規劃</h1>
          <div className="text-xs text-slate-400 mt-0.5">滾動式週產能視圖，紅色=超載，橘色=預警</div>
        </div>
        <div className="flex gap-2 items-center">
          <select className="select w-auto text-sm py-1.5" value={weeks} onChange={e => setWeeks(+e.target.value)}>
            <option value={8}>8 週</option>
            <option value={13}>13 週</option>
            <option value={26}>26 週</option>
          </select>
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            {['heatmap', 'table'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 text-xs font-medium ${viewMode === m ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {m === 'heatmap' ? '熱力圖' : '表格'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 摘要 */}
      {(overloadedWeeks > 0 || warningWeeks > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {overloadedWeeks > 0 && (
            <div className="card p-3 bg-red-50 border-red-200 text-center">
              <div className="text-2xl font-bold text-red-600">{overloadedWeeks}</div>
              <div className="text-xs text-red-500">週超載</div>
            </div>
          )}
          {warningWeeks > 0 && (
            <div className="card p-3 bg-amber-50 border-amber-200 text-center">
              <div className="text-2xl font-bold text-amber-600">{warningWeeks}</div>
              <div className="text-xs text-amber-500">週預警 (&gt;80%)</div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : (
        <>
          {viewMode === 'heatmap' ? (
            /* 熱力圖：機台為列，週為欄 */
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: `${200 + weeks * 60}px` }}>
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left px-3 py-2 w-[160px] font-semibold text-slate-500 sticky left-0 bg-slate-50">機台</th>
                      {weekData.map(w => (
                        <th key={w.week} className="px-1 py-2 text-center font-medium text-slate-500 w-[56px]">
                          <div>{w.label}</div>
                          <div className="text-slate-300">{`W${w.week}`}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {machineList.map(machine => (
                      <tr key={machine.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-2 sticky left-0 bg-white">
                          <div className="font-medium text-slate-700 truncate">{machine.name}</div>
                          <div className="text-slate-400">{machine.code}</div>
                        </td>
                        {weekData.map(w => {
                          const mData = w.machines.find(m => m.machine_id === machine.id);
                          if (!mData) return <td key={w.week} className="px-1 py-2"><div className="w-10 h-8 rounded bg-slate-50 mx-auto" /></td>;
                          const c = LOAD_COLOR[mData.status] || LOAD_COLOR.ok;
                          const pct = Math.min(100, mData.load_pct);
                          return (
                            <td key={w.week} className="px-1 py-2 text-center">
                              <div className="relative w-10 h-8 mx-auto bg-slate-100 rounded overflow-hidden" title={`${mData.load_hours}h / ${mData.capacity_hours}h (${mData.load_pct}%)`}>
                                <div className={`absolute bottom-0 left-0 right-0 ${mData.status === 'overloaded' ? 'bg-red-500' : mData.status === 'warning' ? 'bg-amber-400' : 'bg-green-400'} transition-all`}
                                  style={{ height: `${pct}%` }} />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className={`text-xs font-bold ${pct > 50 ? 'text-white' : 'text-slate-600'}`}>
                                    {mData.load_pct > 0 ? `${mData.load_pct}%` : ''}
                                  </span>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-4 px-3 py-2 bg-slate-50 border-t border-slate-100">
                {[{ c: 'bg-green-400', l: '正常 (<80%)' }, { c: 'bg-amber-400', l: '預警 (80-99%)' }, { c: 'bg-red-500', l: '超載 (≥100%)' }].map(item => (
                  <div key={item.l} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded ${item.c}`} />
                    <span className="text-xs text-slate-500">{item.l}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* 表格模式 */
            <div className="space-y-3">
              {weekData.map(w => {
                const hasIssue = w.machines.some(m => m.status !== 'ok');
                return (
                  <div key={w.week} className={`card overflow-hidden ${hasIssue ? '' : 'opacity-80'}`}>
                    <div className={`px-4 py-2 flex items-center justify-between ${w.machines.some(m => m.status === 'overloaded') ? 'bg-red-50' : w.machines.some(m => m.status === 'warning') ? 'bg-amber-50' : 'bg-slate-50'}`}>
                      <div className="font-semibold text-slate-700 text-sm">第 {w.week} 週 · {w.label}</div>
                      <div className="text-xs text-slate-400">{w.start} ~ {w.end}</div>
                    </div>
                    <div className="px-4 py-3 space-y-2">
                      {w.machines.filter(m => m.load_hours > 0).map(m => {
                        const c = LOAD_COLOR[m.status] || LOAD_COLOR.ok;
                        return (
                          <div key={m.machine_id}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm text-slate-700">{m.machine_name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{m.load_hours}h / {m.capacity_hours}h</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${c.badge}`}>{m.load_pct}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.min(m.load_pct, 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      {w.machines.every(m => m.load_hours === 0) && (
                        <div className="text-xs text-slate-400 py-2">此週無排程工單</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
