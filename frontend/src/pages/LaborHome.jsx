import { useNavigate } from 'react-router-dom';

function EntryCard({ title, desc, items, to, accent, icon }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="card p-5 text-left hover:shadow-lg transition-all active:scale-[0.98] w-full"
    >
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${accent}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-slate-800 text-lg">{title}</div>
          <div className="text-sm text-slate-500 mb-2">{desc}</div>
          <div className="flex flex-wrap gap-1.5">
            {items.map(i => <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{i}</span>)}
          </div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-slate-300 shrink-0 mt-1"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </button>
  );
}

export default function LaborHome() {
  return (
    <div className="pb-24 md:pb-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">點工媒合中心</h1>
        <div className="text-sm text-slate-500">選擇您的角色入口</div>
      </div>

      {/* 發案方 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">我要找點工（發案方）</div>
        <div className="space-y-3">
          <EntryCard
            title="點工地圖" desc="地圖找人、發送接案邀約、完工後評價" to="/labor-map"
            items={['地圖搜尋', '發送邀約', '評價點工']}
            accent="bg-blue-100 text-blue-600"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>}
          />
          <EntryCard
            title="專案財務" desc="合約收款、成本記錄、盈虧分析" to="/project-finance"
            items={['合約收款', '成本記錄', '毛利分析']}
            accent="bg-indigo-100 text-indigo-600"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
          />
        </div>
      </div>

      {/* 點工 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">我要接案（點工 / 工班）</div>
        <div className="space-y-3">
          <EntryCard
            title="接案中心" desc="邀約管理、可接案時段、我的檔案、請假與薪資" to="/worker-center"
            items={['邀約', '可接案時段', '我的檔案']}
            accent="bg-green-100 text-green-600"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>}
          />
          <EntryCard
            title="今日工作" desc="上傳完工照片、完工簽名" to="/today-jobs"
            items={['上傳照片', '完工簽名']}
            accent="bg-amber-100 text-amber-600"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>}
          />
          <EntryCard
            title="派工行事曆" desc="可接案時段、邀約、工作 月曆總覽" to="/labor-calendar"
            items={['月曆視圖', '時段', '邀約']}
            accent="bg-purple-100 text-purple-600"
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>}
          />
        </div>
      </div>

      {/* 管理 */}
      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">管理</div>
        <EntryCard
          title="薪資中心" desc="級距日薪、期別結算、薪資紀錄與薪資條" to="/labor-payroll"
          items={['薪資結算', '薪資結構', '列印薪資條']}
          accent="bg-slate-100 text-slate-600"
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>}
        />
      </div>
    </div>
  );
}
