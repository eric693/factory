import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getWorkers, getWorkerMeta, createInvitation, getAllInvitations, addReview } from '../api/workers';
import { getProjects, getRecommendations } from '../api/laborPayroll';
import { exportSimpleExcel } from '../utils/exportUtils';

// 修正 Leaflet 預設 marker icon 路徑問題
const greenIcon = new L.DivIcon({
  className: 'custom-marker',
  html: `<div style="background:#16a34a;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

function StarRow({ rating, count }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-amber-400">{'★'.repeat(Math.round(rating || 0))}{'☆'.repeat(5 - Math.round(rating || 0))}</span>
      <span className="text-slate-400">{count > 0 ? `${rating} (${count})` : '尚無評價'}</span>
    </div>
  );
}

function MapAutoFit({ workers }) {
  const map = useMap();
  useMemo(() => {
    const pts = workers.filter(w => w.map_lat && w.map_lng).map(w => [w.map_lat, w.map_lng]);
    if (pts.length === 1) map.setView(pts[0], 13);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [50, 50], maxZoom: 13 });
  }, [workers, map]);
  return null;
}

function InviteModal({ worker, onClose }) {
  const qc = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [form, setForm] = useState({
    project_name: '', project_id: '', client_name: '', client_phone: '', location: '',
    city: worker.service_areas?.[0] || '', work_date: '', description: '', offer_price: '',
  });
  const mut = useMutation({
    mutationFn: () => createInvitation(worker.id, { ...form, work_types: worker.work_types, offer_price: +form.offer_price || 0 }),
    onSuccess: () => { qc.invalidateQueries(['all-invitations']); onClose(true); },
  });

  const pickProject = (pid) => {
    const p = projects.find(p => p.id === pid);
    setForm(f => ({ ...f, project_id: pid, project_name: p ? p.name : f.project_name }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" onClick={() => onClose(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="font-bold text-slate-800">發送接案邀約</div>
            <div className="text-sm text-slate-500">{worker.name}</div>
          </div>
          <button onClick={() => onClose(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {projects.length > 0 && (
            <div>
              <label className="label">關聯專案（選填,完工後自動計入人工成本）</label>
              <select className="select" value={form.project_id} onChange={e => pickProject(e.target.value)}>
                <option value="">不關聯專案</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">專案名稱 *</label>
            <input className="input" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} placeholder="例：老屋翻新水電" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">發案方姓名</label>
              <input className="input" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">聯絡電話</label>
              <input className="input" value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">工地地點</label>
            <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="例：台北市信義區○○路" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">需求日期</label>
              <input type="date" className="input" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">出價（元）</label>
              <input type="number" className="input" value={form.offer_price} onChange={e => setForm(f => ({ ...f, offer_price: e.target.value }))} placeholder={`${worker.price_min}~${worker.price_max}`} />
            </div>
          </div>
          <div>
            <label className="label">工作描述</label>
            <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="說明工作內容..." />
          </div>
          <button className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700" disabled={!form.project_name || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? '送出中...' : '發送邀約'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewModal({ invitation, onClose }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [hover, setHover] = useState(0);
  const mut = useMutation({
    mutationFn: () => addReview(invitation.worker_id, { rating, comment, reviewer_name: invitation.client_name || '發案方', invitation_id: invitation.id }),
    onSuccess: () => { qc.invalidateQueries(['all-invitations']); qc.invalidateQueries(['map-workers']); onClose(true); },
  });
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" onClick={() => onClose(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="font-bold text-slate-800">評價點工</div>
          <div className="text-sm text-slate-500">{invitation.worker_name} · {invitation.project_name}</div>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(i => (
              <button key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(0)} onClick={() => setRating(i)}
                className="text-4xl transition-transform active:scale-90" style={{ color: i <= (hover || rating) ? '#fbbf24' : '#e2e8f0' }}>★</button>
            ))}
          </div>
          <div className="text-center text-sm text-slate-500">{['','很差','普通','尚可','良好','優異'][hover || rating]}</div>
          <textarea className="input" rows={3} value={comment} onChange={e => setComment(e.target.value)} placeholder="留下評語（選填）..." />
          <button className="btn-primary w-full py-3 bg-green-600 hover:bg-green-700" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? '送出中...' : '送出評價'}
          </button>
        </div>
      </div>
    </div>
  );
}

// 智慧推薦面板
function RecommendPanel({ meta, onInvite }) {
  const [criteria, setCriteria] = useState({ work_type: '', city: '', date: '', budget: '' });
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['recommend', criteria],
    queryFn: () => getRecommendations({
      work_type: criteria.work_type || undefined, city: criteria.city || undefined,
      date: criteria.date || undefined, budget: criteria.budget || undefined,
    }),
  });
  const recs = data?.recommendations || [];

  const scoreColor = (s) => s >= 80 ? 'text-green-600 bg-green-100' : s >= 60 ? 'text-blue-600 bg-blue-100' : 'text-amber-600 bg-amber-100';

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-700">輸入需求,系統自動推薦最適點工</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">需要工種</label>
            <select className="select" value={criteria.work_type} onChange={e => setCriteria(c => ({ ...c, work_type: e.target.value }))}>
              <option value="">不限</option>
              {meta?.work_types.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className="label">工地區域</label>
            <select className="select" value={criteria.city} onChange={e => setCriteria(c => ({ ...c, city: e.target.value }))}>
              <option value="">不限</option>
              {meta?.cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">需求日期</label>
            <input type="date" className="input" value={criteria.date} onChange={e => setCriteria(c => ({ ...c, date: e.target.value }))} />
          </div>
          <div>
            <label className="label">預算（元）</label>
            <input type="number" className="input" value={criteria.budget} onChange={e => setCriteria(c => ({ ...c, budget: e.target.value }))} placeholder="不限" />
          </div>
        </div>
      </div>

      {isLoading || isFetching ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-green-600 border-t-transparent" /></div>
      ) : recs.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">尚無上架點工</div>
      ) : (
        <div className="space-y-2">
          {recs.map((r, i) => (
            <div key={r.id} className={`card p-4 ${i === 0 ? 'ring-2 ring-green-400' : ''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 font-bold ${scoreColor(r.score)}`}>
                  <span className="text-lg leading-none">{r.score}</span>
                  <span className="text-[10px]">分</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{r.name}</span>
                    {i === 0 && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-600 text-white">最推薦</span>}
                    {r.rating_count > 0 && <span className="text-xs text-amber-500">★ {r.rating}</span>}
                  </div>
                  {r.intro && <div className="text-xs text-slate-500 mt-0.5">{r.intro}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.reasons.map((reason, j) => (
                      <span key={j} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{reason}</span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-400 mt-1.5">{r.pricing_method}：{r.price_min?.toLocaleString()}~{r.price_max?.toLocaleString()} 元 · 完工 {r.completed_jobs} 件</div>
                </div>
                <button onClick={() => onInvite(r)} className="bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 shrink-0 self-center">邀約</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TABS = [{ key: 'map', label: '地圖搜尋' }, { key: 'recommend', label: '智慧推薦' }, { key: 'invitations', label: '我的邀約' }];

export default function LaborMap() {
  const [tab, setTab] = useState('map');
  const [filters, setFilters] = useState({ keyword: '', city: '', work_type: '', min_rating: '', max_price: '', date: '' });
  const [inviting, setInviting] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [toast, setToast] = useState('');

  const { data: meta } = useQuery({ queryKey: ['worker-meta'], queryFn: getWorkerMeta });
  const { data: workers = [], isLoading } = useQuery({
    queryKey: ['map-workers', filters],
    queryFn: () => getWorkers({
      keyword: filters.keyword || undefined, city: filters.city || undefined,
      work_type: filters.work_type || undefined, min_rating: filters.min_rating || undefined,
      max_price: filters.max_price || undefined, date: filters.date || undefined,
    }),
  });
  const { data: invitations = [] } = useQuery({ queryKey: ['all-invitations'], queryFn: () => getAllInvitations('all'), enabled: tab === 'invitations' });

  const located = workers.filter(w => w.map_lat && w.map_lng);

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] bg-green-600 text-white px-5 py-2.5 rounded-full shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">點工地圖</h1>
          <div className="text-sm text-slate-500">共 {workers.length} 位點工（{located.length} 位已定位）</div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'map' && workers.length > 0 && (
            <button
              onClick={() => exportSimpleExcel('點工名單', '點工名單', [
                { header: '隊名', accessor: w => w.name },
                { header: '工種', accessor: w => (w.work_types || []).join('、') },
                { header: '計價', accessor: w => w.pricing_method },
                { header: '最低價', accessor: w => w.price_min },
                { header: '最高價', accessor: w => w.price_max },
                { header: '服務區域', accessor: w => (w.service_areas || []).join('、') },
                { header: '評分', accessor: w => w.rating || 0 },
                { header: '電話', accessor: w => w.phone || '' },
              ], workers)}
              className="btn-secondary text-xs"
            >匯出名單</button>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'map' && (
        <>
          {/* 搜尋篩選 */}
          <div className="card p-4 space-y-3">
            <input className="input" placeholder="搜尋隊名、介紹關鍵字" value={filters.keyword} onChange={e => setFilters(f => ({ ...f, keyword: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">服務區域</label>
                <select className="select" value={filters.city} onChange={e => setFilters(f => ({ ...f, city: e.target.value }))}>
                  <option value="">不限區域</option>
                  {meta?.cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="label">工種</label>
                <select className="select" value={filters.work_type} onChange={e => setFilters(f => ({ ...f, work_type: e.target.value }))}>
                  <option value="">不限工種</option>
                  {meta?.work_types.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">可接案日期</label>
                <input type="date" className="input" value={filters.date} onChange={e => setFilters(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label className="label">最低評分</label>
                <select className="select" value={filters.min_rating} onChange={e => setFilters(f => ({ ...f, min_rating: e.target.value }))}>
                  <option value="">不限</option>
                  {[3,4,4.5].map(r => <option key={r} value={r}>{r} 星以上</option>)}
                </select>
              </div>
              <div>
                <label className="label">價格上限</label>
                <input type="number" className="input" value={filters.max_price} onChange={e => setFilters(f => ({ ...f, max_price: e.target.value }))} placeholder="元" />
              </div>
            </div>
          </div>

          {/* 地圖 */}
          <div className="card overflow-hidden p-0" style={{ height: 420 }}>
            <MapContainer center={[25.0330, 121.5654]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapAutoFit workers={located} />
              {located.map(w => (
                <Marker key={w.id} position={[w.map_lat, w.map_lng]} icon={greenIcon}>
                  <Popup>
                    <div style={{ minWidth: 180 }}>
                      <div className="font-bold text-slate-800 text-sm">{w.name}</div>
                      {w.intro && <div className="text-xs text-slate-500 mt-0.5">{w.intro}</div>}
                      <div className="mt-1"><StarRow rating={w.rating} count={w.rating_count} /></div>
                      <div className="text-xs text-slate-600 mt-1">{w.pricing_method}：{w.price_min?.toLocaleString()}~{w.price_max?.toLocaleString()} 元</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {w.work_types.map(wt => <span key={wt} className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{wt}</span>)}
                      </div>
                      <button onClick={() => setInviting(w)} className="mt-2 w-full bg-green-600 text-white text-xs font-semibold py-1.5 rounded-lg hover:bg-green-700">發送邀約</button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* 列表 */}
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-green-600 border-t-transparent" /></div>
          ) : workers.length === 0 ? (
            <div className="card p-8 text-center text-slate-400">找不到符合條件的點工</div>
          ) : (
            <div className="space-y-2">
              {workers.map(w => (
                <div key={w.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-800">{w.name}</div>
                      {w.intro && <div className="text-sm text-slate-500">{w.intro}</div>}
                      <div className="mt-1"><StarRow rating={w.rating} count={w.rating_count} /></div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {w.work_types.map(wt => <span key={wt} className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{wt}</span>)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5">服務區域：{w.service_areas.join('、')}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-green-600">{w.price_min?.toLocaleString()}~{w.price_max?.toLocaleString()}</div>
                      <div className="text-xs text-slate-400">{w.pricing_method}</div>
                      <button onClick={() => setInviting(w)} className="mt-2 bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700">邀約</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'recommend' && <RecommendPanel meta={meta} onInvite={setInviting} />}

      {tab === 'invitations' && (
        <div className="space-y-2">
          {invitations.length === 0 ? (
            <div className="card p-12 text-center text-slate-400">尚未發送任何邀約</div>
          ) : invitations.map(inv => {
            const st = { pending: ['待回覆', 'bg-amber-100 text-amber-700'], accepted: ['已接受', 'bg-green-100 text-green-700'], rejected: ['已婉拒', 'bg-slate-100 text-slate-500'], completed: ['已完工', 'bg-blue-100 text-blue-700'] }[inv.status] || ['', ''];
            return (
              <div key={inv.id} className="card p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-xs text-slate-400">{inv.invitation_no}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st[1]}`}>{st[0]}</span>
                </div>
                <div className="font-semibold text-slate-800">{inv.project_name}</div>
                <div className="text-sm text-slate-500">點工：{inv.worker_name} · {inv.location}</div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
                  {inv.work_date && <span>{inv.work_date}</span>}
                  {inv.offer_price > 0 && <span className="text-green-600 font-semibold">出價 {inv.offer_price.toLocaleString()} 元</span>}
                  {inv.status === 'accepted' && inv.worker_phone && <span>聯絡：{inv.worker_phone}</span>}
                </div>
                {inv.status === 'completed' && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <button onClick={() => setReviewing(inv)} className="text-sm font-semibold text-amber-600 hover:text-amber-700">
                      ★ 評價這次合作
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {inviting && <InviteModal worker={inviting} onClose={(sent) => { setInviting(null); if (sent) { setToast('邀約已發送'); setTimeout(() => setToast(''), 2000); } }} />}
      {reviewing && <ReviewModal invitation={reviewing} onClose={(done) => { setReviewing(null); if (done) { setToast('評價已送出'); setTimeout(() => setToast(''), 2000); } }} />}
    </div>
  );
}
