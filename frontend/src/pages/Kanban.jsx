import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorkOrders } from '../api';
import { progressPct } from '../utils';
import dayjs from 'dayjs';

const STATUS_COLOR = {
  pending:     { bg: 'bg-slate-100',  text: 'text-slate-500',  bar: 'bg-slate-300',  label: '待開工' },
  scheduled:   { bg: 'bg-indigo-50',  text: 'text-indigo-600', bar: 'bg-indigo-400', label: '已排程' },
  in_progress: { bg: 'bg-green-50',   text: 'text-green-700',  bar: 'bg-green-500',  label: '生產中' },
  completed:   { bg: 'bg-sky-50',     text: 'text-sky-600',    bar: 'bg-sky-400',    label: '完成' },
};

function WOCard({ wo }) {
  const pct = progressPct(wo.completed_qty, wo.planned_qty);
  const s = STATUS_COLOR[wo.status] || STATUS_COLOR.pending;
  const remaining = (wo.planned_qty || 0) - (wo.completed_qty || 0);
  const isOverdue = wo.planned_end && dayjs(wo.planned_end).isBefore(dayjs(), 'day') && wo.status !== 'completed';

  return (
    <div className={`rounded-xl border ${isOverdue ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'} p-3.5 shadow-sm`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-slate-400 mb-0.5">{wo.wo_no}</div>
          <div className="font-semibold text-slate-800 text-sm leading-tight truncate">{wo.product_name}</div>
          {wo.product_code && <div className="text-xs text-slate-400">{wo.product_code}</div>}
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
          {s.label}
        </span>
      </div>

      {/* 進度條 */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{wo.completed_qty} / {wo.planned_qty} 件</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${wo.status === 'completed' ? 'bg-sky-400' : wo.status === 'in_progress' ? 'bg-green-500' : 'bg-indigo-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="truncate">{wo.operator || '未指派'}</span>
        <div className="flex items-center gap-2 shrink-0">
          {wo.defect_qty > 0 && <span className="text-red-500 font-medium">不良 {wo.defect_qty}</span>}
          {isOverdue ? (
            <span className="text-red-600 font-semibold">逾期</span>
          ) : wo.planned_end ? (
            <span>{dayjs(wo.planned_end).format('MM/DD')}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MachineColumn({ machine, wos }) {
  const active = wos.filter(w => w.status === 'in_progress').length;
  const total = wos.length;
  const totalPlanned = wos.reduce((s, w) => s + (w.planned_qty || 0), 0);
  const totalDone = wos.reduce((s, w) => s + (w.completed_qty || 0), 0);
  const overallPct = totalPlanned > 0 ? Math.round(totalDone / totalPlanned * 100) : 0;

  return (
    <div className="flex flex-col min-w-[260px] max-w-[300px] bg-slate-50 rounded-2xl overflow-hidden flex-shrink-0">
      {/* 機台標頭 */}
      <div className={`px-4 py-3 ${active > 0 ? 'bg-green-600' : 'bg-slate-400'} text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">{machine.name}</div>
            <div className="text-xs opacity-80">{machine.code}</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{active > 0 ? '生產中' : '閒置'}</div>
            <div className="text-xs opacity-80">{total} 件待工</div>
          </div>
        </div>
        {total > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs opacity-80 mb-1">
              <span>總進度</span>
              <span>{overallPct}%</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${overallPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* 工單列表 */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
        {wos.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">目前無工單</div>
        ) : (
          wos.map(wo => <WOCard key={wo.id} wo={wo} />)
        )}
      </div>
    </div>
  );
}

export default function Kanban() {
  const [now, setNow] = useState(dayjs());
  const [tvMode, setTvMode] = useState(false);

  const { data: wos = [], isLoading } = useQuery({
    queryKey: ['work-orders'],
    queryFn: getWorkOrders,
    refetchInterval: 15000,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(t);
  }, []);

  // 取得所有機台（從工單中提取，並包含無工單的）
  const machineMap = {};
  wos.forEach(wo => {
    if (wo.machine_id && wo.status !== 'completed' && wo.status !== 'cancelled') {
      if (!machineMap[wo.machine_id]) {
        machineMap[wo.machine_id] = {
          id: wo.machine_id,
          name: wo.machine_name || wo.machine_id,
          code: wo.machine_code || '',
          wos: [],
        };
      }
      machineMap[wo.machine_id].wos.push(wo);
    }
  });

  const machines = Object.values(machineMap).sort((a, b) => a.name.localeCompare(b.name));

  const inProgressCount = wos.filter(w => w.status === 'in_progress').length;
  const pendingCount = wos.filter(w => w.status === 'scheduled' || w.status === 'pending').length;
  const overdueCount = wos.filter(w => w.planned_end && dayjs(w.planned_end).isBefore(dayjs(), 'day') && w.status !== 'completed').length;

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );

  return (
    <div className={`${tvMode ? 'fixed inset-0 bg-slate-900 z-50 flex flex-col p-4' : 'space-y-4 pb-20 md:pb-0'}`}>
      {/* 標頭 */}
      <div className={`flex items-center justify-between ${tvMode ? 'text-white' : ''}`}>
        <div>
          <h1 className={`text-2xl font-bold ${tvMode ? 'text-white' : 'text-slate-800'}`}>生產看板</h1>
          <div className={`text-sm ${tvMode ? 'text-slate-300' : 'text-slate-400'}`}>
            {now.format('YYYY年MM月DD日 HH:mm:ss')} · 每15秒自動更新
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 狀態摘要 */}
          <div className="hidden md:flex items-center gap-4 text-sm">
            <div className={`text-center ${tvMode ? 'text-white' : ''}`}>
              <div className="text-xl font-bold text-green-500">{inProgressCount}</div>
              <div className={`text-xs ${tvMode ? 'text-slate-400' : 'text-slate-400'}`}>生產中</div>
            </div>
            <div className={`text-center ${tvMode ? 'text-white' : ''}`}>
              <div className="text-xl font-bold text-indigo-500">{pendingCount}</div>
              <div className="text-xs text-slate-400">待開工</div>
            </div>
            {overdueCount > 0 && (
              <div className="text-center">
                <div className="text-xl font-bold text-red-500">{overdueCount}</div>
                <div className="text-xs text-slate-400">逾期</div>
              </div>
            )}
          </div>
          <button
            onClick={() => setTvMode(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tvMode ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {tvMode ? '離開全螢幕' : '電視模式'}
          </button>
        </div>
      </div>

      {/* 機台看板欄 */}
      <div className={`${tvMode ? 'flex-1 overflow-x-auto' : 'overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0'}`}>
        <div className="flex gap-3 pb-4" style={{ minWidth: 'max-content' }}>
          {machines.length === 0 ? (
            <div className={`flex-1 text-center py-20 ${tvMode ? 'text-slate-400' : 'text-slate-400'}`}>
              目前沒有進行中的工單
            </div>
          ) : (
            machines.map(m => (
              <MachineColumn key={m.id} machine={m} wos={m.wos} />
            ))
          )}
        </div>
      </div>

      {/* 電視模式底部統計 */}
      {tvMode && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: '生產中工單', value: inProgressCount, color: 'text-green-400' },
            { label: '待開工工單', value: pendingCount, color: 'text-indigo-400' },
            { label: '逾期工單', value: overdueCount, color: 'text-red-400' },
            { label: '活躍機台', value: machines.length, color: 'text-sky-400' },
          ].map(item => (
            <div key={item.label} className="bg-slate-800 rounded-xl p-4 text-center">
              <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-slate-400 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
