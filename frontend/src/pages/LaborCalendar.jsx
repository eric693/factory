import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { getCalendar } from '../api/workers';
import { useCurrentWorker } from '../hooks/useCurrentWorker';

const TYPE_STYLE = {
  slot: { label: '可接案', dot: 'bg-blue-400', text: 'text-blue-700', bg: 'bg-blue-50' },
  invitation: { label: '邀約', dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
  job: { label: '完工', dot: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' },
};

export default function LaborCalendar() {
  const { worker, workers, setWorker } = useCurrentWorker();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [selectedDate, setSelectedDate] = useState(null);

  const { data } = useQuery({
    queryKey: ['labor-calendar', worker?.id, month],
    queryFn: () => getCalendar(worker.id, month),
    enabled: !!worker,
  });

  const events = data?.events || [];

  // 將事件依日期分組（slot 跨日展開）
  const byDate = {};
  events.forEach(e => {
    if (e.type === 'slot' && e.end_date) {
      let d = dayjs(e.date);
      const end = dayjs(e.end_date);
      while (d.isBefore(end) || d.isSame(end, 'day')) {
        const key = d.format('YYYY-MM-DD');
        (byDate[key] = byDate[key] || []).push(e);
        d = d.add(1, 'day');
      }
    } else if (e.date) {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    }
  });

  // 月曆格子
  const first = dayjs(month + '-01');
  const daysInMonth = first.daysInMonth();
  const startWeekday = first.day();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(first.date(d));

  const today = dayjs().format('YYYY-MM-DD');

  if (!worker) return <div className="card p-12 text-center text-slate-400 mt-6">請先於「接案中心」建立檔案</div>;

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">派工行事曆</h1>
          <div className="text-sm text-slate-500">{worker.name} · 時段 / 邀約 / 完工 月曆總覽</div>
        </div>
        <div className="flex items-center gap-2">
          {workers.length > 1 && (
            <select value={worker.id} onChange={e => setWorker(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white">
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <input type="month" className="input w-auto text-sm py-1.5" value={month} onChange={e => { setMonth(e.target.value); setSelectedDate(null); }} />
        </div>
      </div>

      {/* 圖例 */}
      <div className="flex gap-4">
        {Object.values(TYPE_STYLE).map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
            <span className="text-xs text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* 月曆 */}
      <div className="card p-3">
        <div className="grid grid-cols-7 mb-1">
          {['日','一','二','三','四','五','六'].map((w, i) => (
            <div key={w} className={`text-center text-xs font-medium py-1 ${i === 0 || i === 6 ? 'text-slate-300' : 'text-slate-400'}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = d.format('YYYY-MM-DD');
            const evs = byDate[key] || [];
            const types = [...new Set(evs.map(e => e.type))];
            const isToday = key === today;
            const isSelected = key === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : key)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-start py-1 transition-all ${isSelected ? 'bg-indigo-600 text-white' : isToday ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
              >
                <span className={`text-sm ${isSelected ? 'text-white font-bold' : isToday ? 'text-indigo-600 font-bold' : 'text-slate-700'}`}>{d.date()}</span>
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {types.map(t => <div key={t} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : TYPE_STYLE[t].dot}`} />)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 選取日明細 */}
      {selectedDate && (
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">{dayjs(selectedDate).format('M月D日')} 行程</div>
          {(byDate[selectedDate] || []).length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-4">此日無行程</div>
          ) : (
            <div className="space-y-2">
              {(byDate[selectedDate] || []).map((e, i) => {
                const s = TYPE_STYLE[e.type];
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${s.bg}`}>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full bg-white ${s.text}`}>{s.label}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{e.title}</div>
                      {e.area && <div className="text-xs text-slate-400">{e.area}</div>}
                    </div>
                    {e.price > 0 && <span className="text-sm font-semibold text-green-600 shrink-0">{e.price.toLocaleString()} 元</span>}
                    {e.type === 'slot' && <span className="text-xs text-slate-400 shrink-0">{e.status === 'booked' ? '已預約' : '可接'}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 本月摘要 */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(TYPE_STYLE).map(([type, s]) => {
          const count = type === 'slot'
            ? events.filter(e => e.type === 'slot').length
            : events.filter(e => e.type === type).length;
          return (
            <div key={type} className="card p-3 text-center">
              <div className={`text-2xl font-bold ${s.text}`}>{count}</div>
              <div className="text-xs text-slate-400">本月{s.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
