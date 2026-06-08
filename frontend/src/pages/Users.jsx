import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const api = axios.create({ baseURL: '/api' });

const ROLES = {
  admin: { label: '最高管理員', color: 'bg-red-100 text-red-700' },
  boss: { label: '老闆', color: 'bg-purple-100 text-purple-700' },
  manager: { label: '廠長', color: 'bg-blue-100 text-blue-700' },
  sales: { label: '業務', color: 'bg-green-100 text-green-700' },
  worker: { label: '作業員', color: 'bg-slate-100 text-slate-600' },
};

export default function Users() {
  const { token, user: me } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [pwModal, setPwModal] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users', { headers }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/users', data, { headers }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/toggle`, {}, { headers }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const pwMutation = useMutation({
    mutationFn: ({ id, password }) => api.patch(`/users/${id}/password`, { password }, { headers }).then(r => r.data),
    onSuccess: () => setPwModal(null),
  });

  if (me?.role !== 'admin') {
    return <div className="card text-center py-12 text-slate-400">僅管理員可存取此頁面</div>;
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">使用者管理</h1>
          <p className="text-sm text-slate-500 mt-1">管理系統帳號與權限</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>新增帳號</button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">載入中...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                <th className="pb-3">帳號</th><th className="pb-3">姓名</th><th className="pb-3">角色</th>
                <th className="pb-3">狀態</th><th className="pb-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map(u => (
                <tr key={u.id}>
                  <td className="py-3 font-medium">{u.username}</td>
                  <td className="py-3 text-slate-700">{u.name}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLES[u.role]?.color}`}>
                      {ROLES[u.role]?.label || u.role}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {u.is_active ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="btn-ghost text-xs px-2 py-1" onClick={() => setPwModal(u)}>改密碼</button>
                      {u.id !== me.id && (
                        <button className="btn-ghost text-xs px-2 py-1" onClick={() => toggleMutation.mutate(u.id)}>
                          {u.is_active ? '停用' : '啟用'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSubmit={createMutation.mutate} loading={createMutation.isPending} error={createMutation.error?.response?.data?.error} />}
      {pwModal && <PasswordModal user={pwModal} onClose={() => setPwModal(null)} onSubmit={(pw) => pwMutation.mutate({ id: pwModal.id, password: pw })} loading={pwMutation.isPending} />}
    </div>
  );
}

function CreateModal({ onClose, onSubmit, loading, error }) {
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'worker' });
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100"><h3 className="text-lg font-bold">新增帳號</h3></div>
        <div className="p-5 space-y-4">
          <div><label className="label">帳號</label><input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div><label className="label">姓名</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">密碼</label><input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
          <div>
            <label className="label">角色</label>
            <select className="select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">最高管理員</option>
              <option value="boss">老闆</option>
              <option value="manager">廠長</option>
              <option value="sales">業務</option>
              <option value="worker">作業員</option>
            </select>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={() => onSubmit(form)} disabled={!form.username || !form.password || loading}>
            {loading ? '建立中...' : '建立帳號'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ user, onClose, onSubmit, loading }) {
  const [pw, setPw] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl">
        <div className="p-5 border-b border-slate-100">
          <h3 className="text-lg font-bold">修改密碼</h3>
          <p className="text-sm text-slate-500">{user.name} ({user.username})</p>
        </div>
        <div className="p-5">
          <label className="label">新密碼（至少 6 字元）</label>
          <input type="password" className="input" value={pw} onChange={e => setPw(e.target.value)} />
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3">
          <button className="btn-ghost flex-1" onClick={onClose}>取消</button>
          <button className="btn-primary flex-1" onClick={() => onSubmit(pw)} disabled={pw.length < 6 || loading}>
            {loading ? '修改中...' : '確認修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
