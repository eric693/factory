import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkerJobs, addJobPhoto, deleteJobPhoto, completeJob } from '../api/workers';
import { useCurrentWorker } from '../hooks/useCurrentWorker';

// 將圖片壓縮為較小的 base64（避免上傳過大）
function compressImage(file, maxW = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function SignaturePad({ onSave, onClose }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
  }, []);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0];
    const cx = t ? t.clientX : e.clientX;
    const cy = t ? t.clientY : e.clientY;
    return { x: (cx - r.left) * (canvasRef.current.width / r.width), y: (cy - r.top) * (canvasRef.current.height / r.height) };
  };
  const start = (e) => { e.preventDefault(); drawing.current = true; const ctx = canvasRef.current.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing.current = false; };
  const clear = () => { const ctx = canvasRef.current.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height); };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="font-bold text-slate-800">完工簽名</div>
          <div className="text-sm text-slate-500">請在下方簽名確認完工</div>
        </div>
        <div className="p-5">
          <canvas
            ref={canvasRef}
            width={500}
            height={250}
            className="w-full border-2 border-dashed border-slate-300 rounded-xl touch-none bg-white"
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
          <div className="flex gap-2 mt-4">
            <button className="btn-ghost flex-1" onClick={clear}>清除重簽</button>
            <button className="btn-primary flex-1 bg-green-600 hover:bg-green-700" onClick={() => onSave(canvasRef.current.toDataURL('image/png'))}>確認完工</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TodayJobs() {
  const qc = useQueryClient();
  const [signingJob, setSigningJob] = useState(null);
  const [uploading, setUploading] = useState(null);
  const fileRef = useRef(null);

  const { worker, workers, setWorker } = useCurrentWorker();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['my-jobs', worker?.id],
    queryFn: () => getWorkerJobs(worker.id),
    enabled: !!worker,
  });

  const photoMut = useMutation({
    mutationFn: ({ jobId, photo }) => addJobPhoto(jobId, photo),
    onSuccess: () => { qc.invalidateQueries(['my-jobs']); setUploading(null); },
    onError: () => setUploading(null),
  });
  const delPhotoMut = useMutation({
    mutationFn: ({ jobId, idx }) => deleteJobPhoto(jobId, idx),
    onSuccess: () => qc.invalidateQueries(['my-jobs']),
  });
  const completeMut = useMutation({
    mutationFn: ({ jobId, signature }) => completeJob(jobId, { signature }),
    onSuccess: () => { qc.invalidateQueries(['my-jobs']); qc.invalidateQueries(['my-invitations']); setSigningJob(null); },
  });

  const handleFile = async (e, jobId) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(jobId);
    const compressed = await compressImage(file);
    photoMut.mutate({ jobId, photo: compressed });
    e.target.value = '';
  };

  if (!worker) return (
    <div className="card p-12 text-center text-slate-400 mt-6">請先於「接案中心」建立檔案並接受邀約</div>
  );

  const active = jobs.filter(j => j.status === 'in_progress');
  const done = jobs.filter(j => j.status === 'completed');

  return (
    <div className="pb-24 md:pb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">今日工作</h1>
          <div className="text-sm text-slate-500">{worker?.name} · {active.length} 件進行中 · {done.length} 件已完工</div>
        </div>
        {workers.length > 1 && (
          <select value={worker?.id || ''} onChange={(e) => setWorker(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white shrink-0">
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : jobs.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">目前沒有工作，請至「接案中心」接受邀約</div>
      ) : (
        <>
          {active.map(job => (
            <div key={job.id} className="card p-4 border-green-200">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-slate-400">{job.invitation_no}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">進行中</span>
                  </div>
                  <div className="font-semibold text-slate-800">{job.project_name}</div>
                  <div className="text-sm text-slate-500">{job.location} {job.work_date && `· ${job.work_date}`}</div>
                  {job.client_name && <div className="text-xs text-slate-400">發案：{job.client_name}</div>}
                </div>
                {job.offer_price > 0 && <div className="text-green-600 font-bold shrink-0">{job.offer_price.toLocaleString()} 元</div>}
              </div>

              {/* 照片 */}
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-500 mb-2">完工照片（{job.photos.length}）</div>
                <div className="grid grid-cols-4 gap-2">
                  {job.photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p.data} alt="" className="w-full h-full object-cover rounded-lg" />
                      <button onClick={() => delPhotoMut.mutate({ jobId: job.id, idx: i })} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center shadow">×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => { fileRef.current.dataset.jobId = job.id; fileRef.current.click(); }}
                    disabled={uploading === job.id}
                    className="aspect-square border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 hover:border-green-400 hover:text-green-600"
                  >
                    {uploading === job.id ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent" />
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        <span className="text-xs mt-0.5">上傳</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <button className="btn-primary w-full py-2.5 bg-green-600 hover:bg-green-700" onClick={() => setSigningJob(job)}>
                完工簽名
              </button>
            </div>
          ))}

          {done.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-6">已完工</div>
              <div className="space-y-2">
                {done.map(job => (
                  <div key={job.id} className="card p-4 opacity-90">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-xs text-slate-400">{job.invitation_no}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">已完工</span>
                        </div>
                        <div className="font-semibold text-slate-800">{job.project_name}</div>
                        <div className="text-xs text-slate-400">{job.location} · 完工 {job.completed_at?.slice(0, 16)}</div>
                      </div>
                      {job.signature && <img src={job.signature} alt="簽名" className="w-16 h-10 object-contain border border-slate-200 rounded shrink-0" />}
                    </div>
                    {job.photos.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-x-auto">
                        {job.photos.map((p, i) => <img key={i} src={p.data} alt="" className="w-14 h-14 object-cover rounded-lg shrink-0" />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFile(e, fileRef.current.dataset.jobId)} />
      {signingJob && (
        <SignaturePad
          onClose={() => setSigningJob(null)}
          onSave={(sig) => completeMut.mutate({ jobId: signingJob.id, signature: sig })}
        />
      )}
    </div>
  );
}
