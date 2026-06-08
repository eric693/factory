import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { getWorkers } from '../api/workers';

const STORAGE_KEY = 'taskgo_current_worker';

// 目前身分（點工）管理 — 取代各頁 workers[0] 寫法
export function useCurrentWorker() {
  const { data: workers = [], isLoading } = useQuery({ queryKey: ['my-worker'], queryFn: () => getWorkers({ status: 'all' }) });
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(STORAGE_KEY) || '');

  // 若無選擇或選擇已不存在,預設第一個
  useEffect(() => {
    if (workers.length === 0) return;
    const exists = workers.some(w => w.id === selectedId);
    if (!selectedId || !exists) {
      const id = workers[0].id;
      setSelectedId(id);
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, [workers, selectedId]);

  const setWorker = (id) => { setSelectedId(id); localStorage.setItem(STORAGE_KEY, id); };
  const worker = workers.find(w => w.id === selectedId) || workers[0] || null;

  return { worker, workers, setWorker, isLoading };
}
