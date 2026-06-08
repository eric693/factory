import dayjs from 'dayjs';

export const STATUS_ORDER = {
  pending: { label: '待排產', color: 'bg-amber-100 text-amber-700' },
  scheduled: { label: '已排產', color: 'bg-blue-100 text-blue-700' },
  in_production: { label: '生產中', color: 'bg-indigo-100 text-indigo-700' },
  shipped: { label: '已出貨', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-500' },
};

export const STATUS_WO = {
  pending: { label: '待開工', color: 'bg-amber-100 text-amber-700' },
  scheduled: { label: '已排程', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: '生產中', color: 'bg-indigo-100 text-indigo-700' },
  completed: { label: '完工', color: 'bg-green-100 text-green-700' },
  cancelled: { label: '已取消', color: 'bg-slate-100 text-slate-500' },
};

export const STATUS_SHIP = {
  preparing: { label: '備料中', color: 'bg-amber-100 text-amber-700' },
  shipped: { label: '已出貨', color: 'bg-green-100 text-green-700' },
};

export const PRIORITY = {
  1: { label: '急件', color: 'bg-red-100 text-red-700' },
  2: { label: '一般', color: 'bg-slate-100 text-slate-600' },
  3: { label: '低優先', color: 'bg-slate-50 text-slate-400' },
};

export function formatDate(d) {
  if (!d) return '-';
  return dayjs(d).format('MM/DD');
}

export function formatDateTime(d) {
  if (!d) return '-';
  return dayjs(d).format('MM/DD HH:mm');
}

export function isOverdue(date, status) {
  if (!date || ['shipped', 'cancelled'].includes(status)) return false;
  return dayjs(date).isBefore(dayjs(), 'day');
}

export function progressPct(completed, planned) {
  if (!planned) return 0;
  return Math.min(100, Math.round((completed / planned) * 100));
}
