import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getGantt, autoSchedule, getOrders } from '../api';
import { STATUS_WO } from '../utils';
import axios from 'axios';
import dayjs from 'dayjs';

const BASE = '/api';

const STATUS_COLORS = {
  pending: 'bg-amber-400',
  scheduled: 'bg-blue-400',
  in_progress: 'bg-indigo-500',
  completed: 'bg-green-500',
  cancelled: 'bg-slate-300',
};

function GanttBar({ wo, startDay, cellWidth, onDragEnd }) {
  const woStart = dayjs(wo.planned_start);
  const woEnd = dayjs(wo.planned_end);
  const offsetDays = woStart.diff(startDay, 'day');
  const durationDays = Math.max(1, woEnd.diff(woStart, 'day'));
  const left = offsetDays * cellWidth;
  const width = durationDays * cellWidth;
  const color = STATUS_COLORS[wo.status] || 'bg-slate-400';
  const pct = wo.planned_qty > 0 ? Math.round((wo.completed_qty / wo.planned_qty) * 100) : 0;
  const isDraggable = !['completed', 'in_progress', 'cancelled'].includes(wo.status);

  const handleMouseDown = (e) => {
    if (!isDraggable) return;
    e.preventDefault();
    const startX = e.clientX;
    let deltaX = 0;

    const onMouseMove = (me) => {
      deltaX = me.clientX - startX;
      const el = e.currentTarget;
      if (el) el.style.transform = `translateX(${deltaX}px)`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const el = e.currentTarget;
      if (el) el.style.transform = '';
      const daysDelta = Math.round(deltaX / cellWidth);
      if (daysDelta !== 0) {
        const newStart = woStart.add(daysDelta, 'day').format('YYYY-MM-DD');
        const newEnd = woEnd.add(daysDelta, 'day').format('YYYY-MM-DD');
        onDragEnd(wo.id, newStart, newEnd);
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute inset-y-1.5 ${color} rounded-md shadow-sm ring-1 ring-black/5 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} hover:brightness-105 overflow-hidden select-none flex flex-col justify-center`}
      style={{ left: `${left}px`, width: `${Math.max(width - 3, 18)}px`, transition: 'none' }}
      title={`${wo.wo_no}\n${wo.product_name}\n${wo.planned_start} → ${wo.planned_end}\n${wo.completed_qty}/${wo.planned_qty}${isDraggable ? '\n（拖動可重新排程）' : ''}`}
    >
      {width > 56 && (
        <div className="px-2 text-white text-xs font-medium truncate leading-tight">
          {wo.product_name}
        </div>
      )}
      {pct > 0 && (
        <div className="absolute bottom-0 left-0 h-1 bg-white/45" style={{ width: `${pct}%` }} />
      )}
    </div>
  );
}

function UrgentModal({ onClose }) {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({
    queryKey: ['orders', 'pending_or_scheduled'],
    queryFn: () => getOrders({ status: 'pending' }),
  });
  const [orderId, setOrderId] = useState('');
  const mut = useMutation({
    mutationFn: () => axios.post(`${BASE}/schedule/urgent`, { order_id: orderId }),
    onSuccess: (data) => {
      qc.invalidateQueries(['gantt']);
      qc.invalidateQueries(['orders']);
      const d = data.data;
      if (d.conflicts?.length > 0) {
        alert(`已插單排程。\n衝突警告：\n${d.conflicts.map(c => `${c.machine}: ${c.conflicting.join(', ')}`).join('\n')}`);
      } else {
        alert(`插單成功，已排 ${d.workOrders?.length} 張工單`);
      }
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">急件插單重排</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="card p-3 bg-amber-50 border-amber-200 mb-4">
          <div className="text-sm text-amber-800">系統將此訂單設為最高優先，立即從今天開始排入最早可用機台，並偵測衝突工單。</div>
        </div>
        <div className="mb-4">
          <label className="label">選擇訂單</label>
          <select className="select" value={orderId} onChange={e => setOrderId(e.target.value)}>
            <option value="">-- 選擇要插單的訂單 --</option>
            {orders.map(o => <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}</option>)}
          </select>
        </div>
        <button className="btn-danger w-full py-3" disabled={!orderId || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? '重排中...' : '確認插單重排'}
        </button>
      </div>
    </div>
  );
}

export default function Schedule() {
  const qc = useQueryClient();
  const today = dayjs().startOf('day');
  const [viewStart, setViewStart] = useState(today.subtract(2, 'day'));
  const [showUrgent, setShowUrgent] = useState(false);
  const totalDays = 28;
  const cellWidth = 48;
  const ROW_H = 60;
  const LABEL_W = 180;

  const { data, isLoading } = useQuery({
    queryKey: ['gantt', viewStart.format('YYYY-MM-DD')],
    queryFn: () => getGantt({
      start: viewStart.format('YYYY-MM-DD'),
      end: viewStart.add(totalDays, 'day').format('YYYY-MM-DD'),
    }),
  });

  const { data: pendingOrders = [] } = useQuery({
    queryKey: ['orders', 'pending'],
    queryFn: () => getOrders({ status: 'pending' }),
  });

  const { data: bottlenecks = [] } = useQuery({
    queryKey: ['bottleneck'],
    queryFn: () => axios.get(`${BASE}/schedule/bottleneck`).then(r => r.data),
  });

  const scheduleMut = useMutation({
    mutationFn: () => autoSchedule([]),
    onSuccess: (d) => { qc.invalidateQueries(['gantt']); qc.invalidateQueries(['orders']); alert(`已自動排產 ${d.scheduled} 張工單`); },
  });

  const dragMut = useMutation({
    mutationFn: ({ id, planned_start, planned_end }) => axios.patch(`${BASE}/work-orders/${id}`, { planned_start, planned_end }),
    onSuccess: () => qc.invalidateQueries(['gantt']),
    onError: () => alert('排程更新失敗'),
  });

  const handleDragEnd = (woId, newStart, newEnd) => {
    dragMut.mutate({ id: woId, planned_start: newStart, planned_end: newEnd });
  };

  const days = Array.from({ length: totalDays }, (_, i) => viewStart.add(i, 'day'));
  const machines = data?.machines || [];
  const workOrders = data?.workOrders || [];
  const bottleneckId = bottlenecks.find(b => b.is_bottleneck)?.machine_id;

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">生產排程</h1>
          <div className="text-xs text-slate-400 mt-0.5">拖動工單方塊可重新排程（完工/生產中除外）</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary text-sm" onClick={() => setViewStart(v => v.subtract(7, 'day'))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button className="btn-secondary text-sm" onClick={() => setViewStart(today.subtract(2, 'day'))}>今天</button>
          <button className="btn-secondary text-sm" onClick={() => setViewStart(v => v.add(7, 'day'))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowUrgent(true)}>急件插單</button>
          {pendingOrders.length > 0 && (
            <button className="btn-primary text-sm" onClick={() => scheduleMut.mutate()} disabled={scheduleMut.isPending}>
              {scheduleMut.isPending ? '排產中...' : `自動排產 (${pendingOrders.length})`}
            </button>
          )}
        </div>
      </div>

      {/* 瓶頸提示 */}
      {bottlenecks.filter(b => b.is_bottleneck).length > 0 && (
        <div className="card p-3 bg-red-50 border-red-200">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth={2} className="w-4 h-4 shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span className="text-sm text-red-700 font-medium">
              瓶頸機台：{bottlenecks.filter(b => b.is_bottleneck).map(b => `${b.machine_name}（${b.total_load_hours}h 積壓）`).join('、')}
            </span>
          </div>
        </div>
      )}

      {pendingOrders.length > 0 && (
        <div className="card p-3 bg-amber-50 border-amber-200">
          <div className="text-sm text-amber-800 font-medium">有 {pendingOrders.length} 張訂單待排產，點擊「自動排產」即可一鍵安排（已考慮換模時間）</div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(STATUS_WO).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${STATUS_COLORS[k]}`} />
            <span className="text-xs text-slate-500">{v.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-3 h-3 rounded-sm bg-red-200 border border-red-400" />
          <span className="text-xs text-slate-500">瓶頸機台</span>
        </div>
      </div>

      {/* Gantt */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" /></div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <div style={{ minWidth: `${LABEL_W + totalDays * cellWidth}px` }}>
              {/* Header */}
              <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
                <div style={{ width: LABEL_W, height: 44 }} className="shrink-0 px-4 flex items-center text-xs font-semibold text-slate-500 border-r border-slate-200">機台</div>
                <div className="flex">
                  {days.map((d, i) => {
                    const isToday = d.isSame(today, 'day');
                    const isWeekend = d.day() === 0 || d.day() === 6;
                    return (
                      <div key={i} style={{ width: cellWidth, height: 44 }} className={`flex flex-col items-center justify-center border-r border-slate-100 last:border-0 ${isToday ? 'bg-brand-100/70' : isWeekend ? 'bg-slate-100/60' : ''}`}>
                        <div className={`text-xs font-bold leading-none ${isToday ? 'text-brand-700' : isWeekend ? 'text-slate-300' : 'text-slate-600'}`}>{d.format('D')}</div>
                        <div className={`text-[10px] leading-none mt-0.5 ${isToday ? 'text-brand-500' : 'text-slate-300'}`}>{['日','一','二','三','四','五','六'][d.day()]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rows */}
              {machines.map(machine => {
                const machineWOs = workOrders.filter(w => w.machine_id === machine.id);
                const isBottleneck = machine.id === bottleneckId;
                return (
                  <div key={machine.id} style={{ height: ROW_H }} className={`flex border-b border-slate-100 last:border-0 ${isBottleneck ? 'bg-red-50/40' : 'hover:bg-slate-50/60'}`}>
                    {/* 機台名稱（垂直置中,與甘特條同高）*/}
                    <div style={{ width: LABEL_W }} className={`shrink-0 px-4 flex flex-col justify-center border-r ${isBottleneck ? 'border-r-red-200 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-slate-700 truncate">{machine.name}</span>
                        {isBottleneck && <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">瓶頸</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{machine.code}</div>
                    </div>
                    {/* 甘特區（cells + bars 同高）*/}
                    <div className="relative flex" style={{ height: ROW_H }}>
                      {days.map((d, i) => {
                        const isToday = d.isSame(today, 'day');
                        const isWeekend = d.day() === 0 || d.day() === 6;
                        return (
                          <div key={i} style={{ width: cellWidth }} className={`h-full border-r border-slate-100 last:border-0 ${isToday ? 'bg-brand-50' : isWeekend ? 'bg-slate-50/70' : ''}`} />
                        );
                      })}
                      {machineWOs.map(wo => (
                        <GanttBar key={wo.id} wo={wo} startDay={viewStart} totalDays={totalDays} cellWidth={cellWidth} onDragEnd={handleDragEnd} />
                      ))}
                    </div>
                  </div>
                );
              })}

              {machines.length === 0 && (
                <div className="text-center py-12 text-slate-400">暫無機台資料</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showUrgent && <UrgentModal onClose={() => setShowUrgent(false)} />}
    </div>
  );
}
