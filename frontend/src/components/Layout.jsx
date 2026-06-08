import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';

const getNotifications = () => axios.get('/api/notifications').then(r => r.data);

const NOTIF_SEVERITY = {
  high:   'text-red-600 bg-red-50',
  medium: 'text-amber-600 bg-amber-50',
  low:    'text-blue-600 bg-blue-50',
};
// 通知類型 → SVG path（不用 emoji）
const NOTIF_ICON = {
  overdue:     <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 3h6v4H9z" />,
  anomaly:     <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  capacity:    <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  shortage:    <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/></>,
  maintenance: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />,
};
function NotifIcon({ type, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className || 'w-4 h-4'}>
      {NOTIF_ICON[type] || <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

const navItems = [
  { to: '/', label: '總覽', icon: GridIcon },
  { to: '/orders', label: '訂單', icon: ClipboardIcon },
  { to: '/work-orders', label: '工單', icon: WrenchIcon },
  { to: '/kanban', label: '看板', icon: MonitorIcon },
  { to: '/anomalies', label: '異常', icon: AlertIcon },
];

const moreNavItems = [
  { to: '/kanban', label: '生產看板', icon: MonitorIcon },
  { to: '/schedule', label: '排程甘特圖', icon: CalendarIcon },
  { to: '/shipments', label: '出貨管理', icon: TruckIcon },
  { to: '/morning-report', label: '每日晨報', icon: SunIcon },
  { to: '/anomalies', label: '異常通報', icon: AlertIcon },
  { to: '/finished-goods', label: '成品庫存', icon: BoxIcon },
  { to: '/quotes', label: '報價管理', icon: DollarIcon },
  { to: '/handovers', label: '換班交接', icon: TransferIcon },
];

const analysisNavItems = [
  { to: '/boss', label: '管理總覽', icon: GridIcon },
  { to: '/analytics', label: '分析報表', icon: ChartIcon },
  { to: '/capacity-plan', label: '產能規劃', icon: CalendarIcon },
  { to: '/mrp', label: '物料 MRP', icon: LayersIcon },
  { to: '/cost', label: '成本分析', icon: CoinIcon },
];

const qualityNavItems = [
  { to: '/sop', label: '作業標準書 SOP', icon: TraceIcon },
  { to: '/fai', label: '首件確認 FAI', icon: GearIcon },
  { to: '/ncr', label: '不合格品 NCR', icon: AlertIcon },
  { to: '/spc', label: 'SPC 品質管制', icon: ChartIcon },
  { to: '/traceability', label: '全程追溯', icon: LayersIcon },
  { to: '/molds', label: '模具管理', icon: SettingsIcon },
  { to: '/complaints', label: '8D 客訴管理', icon: ClipboardIcon },
  { to: '/yield-alert', label: '良率預警', icon: GaugeIcon },
];

const supplyNavItems = [
  { to: '/suppliers', label: '供應商管理', icon: TruckIcon },
  { to: '/purchase', label: '採購申請單', icon: LayersIcon },
  { to: '/outsource', label: '外發加工', icon: TransferIcon },
  { to: '/traceability', label: '批號追溯', icon: TraceIcon },
];

const laborNavItems = [
  { to: '/labor-home', label: '角色入口', icon: GridIcon },
  { to: '/labor-dashboard', label: '營運儀表板', icon: GaugeIcon },
  { to: '/labor-map', label: '點工地圖', icon: MapPinIcon },
  { to: '/worker-center', label: '接案中心', icon: BriefcaseIcon },
  { to: '/today-jobs', label: '今日工作', icon: ClipboardIcon },
  { to: '/labor-calendar', label: '派工行事曆', icon: CalendarIcon },
  { to: '/labor-attendance', label: '出勤報表', icon: ChartIcon },
  { to: '/labor-payroll', label: '薪資中心', icon: CoinIcon },
  { to: '/project-finance', label: '專案財務', icon: DollarIcon },
];

const crmNavItems = [
  { to: '/customers', label: '客戶管理', icon: UsersIcon },
  { to: '/invoices', label: '應收帳款', icon: CoinIcon },
  { to: '/profit', label: '訂單利潤分析', icon: ChartIcon },
  { to: '/performance', label: '師傅績效', icon: GaugeIcon },
  { to: '/skills', label: '技能矩陣', icon: GridIcon },
  { to: '/payroll', label: '計件薪資', icon: LayersIcon },
  { to: '/maintenance', label: '計劃性保養', icon: WrenchIcon },
  { to: '/ai-schedule', label: 'AI 排程建議', icon: AIIcon },
];

const adminNavItems = [
  { to: '/users', label: '使用者管理', icon: UsersIcon },
  { to: '/settings', label: '系統設定', icon: SettingsIcon },
];

function GridIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>;
}
function ClipboardIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/>
  </svg>;
}
function CalendarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/>
  </svg>;
}
function WrenchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
  </svg>;
}
function TruckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
  </svg>;
}
function ChartIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>;
}
function GaugeIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/><path d="M12 12l-4-4"/><circle cx="12" cy="12" r="1"/>
  </svg>;
}
function BoxIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>;
}
function AlertIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>;
}
function SunIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>;
}
function DollarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <line x1="12" y1="1" x2="12" y2="23"/>
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
  </svg>;
}
function TraceIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
  </svg>;
}
function MapPinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>;
}
function BriefcaseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>
  </svg>;
}
function GearIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>;
}
function AIIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M12 2a2 2 0 012 2v2a2 2 0 01-4 0V4a2 2 0 012-2z"/>
    <path d="M12 18a2 2 0 012 2v2a2 2 0 01-4 0v-2a2 2 0 012-2z"/>
    <path d="M4 12a2 2 0 012-2h2a2 2 0 010 4H6a2 2 0 01-2-2z"/>
    <path d="M18 12a2 2 0 012-2h2a2 2 0 010 4h-2a2 2 0 01-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>;
}
function MonitorIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
  </svg>;
}
function TransferIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/>
    <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
  </svg>;
}
function LayersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
  </svg>;
}
function CoinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="12" cy="12" r="10"/>
    <path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/>
    <line x1="12" y1="6" x2="12" y2="8"/><line x1="12" y1="16" x2="12" y2="18"/>
  </svg>;
}
function UsersIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>;
}
function SettingsIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>;
}
function LogoutIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, refetchInterval: 60000 });
  const count = data?.count || 0;
  const items = data?.items || [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-8 h-8 flex items-center justify-center rounded-full text-brand-300 hover:text-white hover:bg-brand-800/60 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-800">通知中心</span>
              {count > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{count} 則</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-8">目前沒有通知</div>
              ) : (
                items.map((n, i) => (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0 ${NOTIF_SEVERITY[n.severity] || ''}`}>
                    <span className="shrink-0 mt-0.5"><NotifIcon type={n.type} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold leading-tight">{n.title}</div>
                      {n.body && <div className="text-xs opacity-70 mt-0.5 truncate">{n.body}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MobileNotifBell() {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: getNotifications, refetchInterval: 60000 });
  const count = data?.count || 0;
  const items = data?.items || [];

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white w-full rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-800">通知中心</span>
              <button onClick={() => setOpen(false)} className="text-slate-400 text-sm">關閉</button>
            </div>
            <div className="overflow-y-auto flex-1">
              {items.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-8">目前沒有通知</div>
              ) : (
                items.map((n, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-slate-50 last:border-0">
                    <span className={`shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center ${NOTIF_SEVERITY[n.severity] || 'text-slate-500 bg-slate-50'}`}><NotifIcon type={n.type} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 leading-tight">{n.title}</div>
                      {n.body && <div className="text-xs text-slate-400 mt-0.5">{n.body}</div>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${n.severity === 'high' ? 'bg-red-100 text-red-600' : n.severity === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                      {n.severity === 'high' ? '緊急' : n.severity === 'medium' ? '注意' : '提醒'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NavSection({ title, items }) {
  return (
    <div className="mt-4 pt-4 border-t border-brand-800/60">
      {title && <div className="text-xs font-semibold text-brand-500 uppercase tracking-widest px-3 mb-2">{title}</div>}
      <div className="space-y-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to + label}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive ? 'bg-brand-600 text-white' : 'text-brand-300 hover:bg-brand-800/60 hover:text-white'
              }`
            }
          >
            <Icon />{label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Cmd/Ctrl + K 開啟全域搜尋
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex flex-col min-h-screen md:flex-row">
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-brand-950 text-white min-h-screen sticky top-0">
        <div className="px-6 py-5 border-b border-brand-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-0.5">製造管理</div>
            <div className="text-lg font-bold text-white">FactoryOS</div>
          </div>
          <NotificationBell />
        </div>
        <div className="px-3 pt-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-900/60 text-brand-300 hover:bg-brand-800 hover:text-white text-sm transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span className="flex-1 text-left">搜尋...</span>
            <kbd className="text-xs text-brand-500 bg-brand-950 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive ? 'bg-brand-600 text-white' : 'text-brand-300 hover:bg-brand-800/60 hover:text-white'
                  }`
                }
              >
                <Icon />{label}
              </NavLink>
            ))}
          </div>
          <NavSection title="生產管理" items={moreNavItems} />
          <NavSection title="分析 / 報表" items={analysisNavItems} />
          <NavSection title="品質 / 追溯" items={qualityNavItems} />
          <NavSection title="供應 / 外發" items={supplyNavItems} />
          <NavSection title="人資 / 工具" items={crmNavItems} />
          <NavSection title="點工媒合" items={laborNavItems} />
          {(user?.role === 'admin' || user?.role === 'boss') && <NavSection title="系統設定" items={adminNavItems} />}
        </nav>
        <div className="px-4 py-4 border-t border-brand-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold">
              {user?.name?.[0] || user?.username?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name || user?.username}</div>
              <div className="text-xs text-brand-400">{user?.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-brand-400 hover:text-white text-sm transition-colors w-full">
            <LogoutIcon />登出
          </button>
          <div className="text-xs text-brand-600 mt-2">v3.0.0</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="font-bold text-slate-900">FactoryOS</div>
          <div className="flex items-center gap-3">
            <button onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-slate-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <MobileNotifBell />
            <button onClick={handleLogout} className="text-slate-400 hover:text-slate-600">
              <LogoutIcon />
            </button>
          </div>
        </div>
        <div className="flex-1 px-4 py-5 md:px-8 md:py-6 max-w-screen-xl w-full mx-auto">
          {children}
        </div>
      </main>

      {/* Bottom nav - mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50">
        <div className="flex">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2.5 text-xs font-medium transition-colors ${
                  isActive ? 'text-brand-600' : 'text-slate-400'
                }`
              }
            >
              <Icon />
              <span className="mt-0.5">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
