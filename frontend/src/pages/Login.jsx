import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 to-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xs font-semibold text-brand-400 uppercase tracking-widest mb-1">製造管理系統</div>
          <div className="text-3xl font-bold text-white">FactoryOS</div>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-bold text-slate-800 mb-6">登入帳號</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">帳號</label>
              <input
                className="input"
                placeholder="請輸入帳號"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="label">密碼</label>
              <input
                type="password"
                className="input"
                placeholder="請輸入密碼"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="btn-primary w-full py-3 text-base"
              disabled={loading}
            >
              {loading ? '登入中...' : '登入'}
            </button>
          </form>
          <div className="mt-6 p-3 bg-slate-50 rounded-xl">
            <div className="text-xs text-slate-500 mb-2 font-semibold">測試帳號</div>
            <div className="text-xs text-slate-600 space-y-1">
              <div>admin / admin123 （最高管理員）</div>
              <div>manager / manager123 （廠長）</div>
              <div>worker / worker123 （作業員）</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
