import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const getWorkers = (params) => api.get('/workers', { params }).then(r => r.data);
export const getWorker = (id) => api.get(`/workers/${id}`).then(r => r.data);
export const saveWorker = (data) => api.post('/workers', data).then(r => r.data);
export const setWorkerStatus = (id, status) => api.patch(`/workers/${id}/status`, { status }).then(r => r.data);
export const deleteWorker = (id) => api.delete(`/workers/${id}`).then(r => r.data);
export const getWorkerMeta = () => api.get('/workers/meta/options').then(r => r.data);

export const getSlots = (id) => api.get(`/workers/${id}/slots`).then(r => r.data);
export const addSlot = (id, data) => api.post(`/workers/${id}/slots`, data).then(r => r.data);
export const deleteSlot = (slotId) => api.delete(`/workers/slots/${slotId}`).then(r => r.data);

export const getWorkerInvitations = (id) => api.get(`/workers/${id}/invitations`).then(r => r.data);
export const getAllInvitations = (status) => api.get('/workers/invitations/all', { params: { status } }).then(r => r.data);
export const createInvitation = (workerId, data) => api.post(`/workers/${workerId}/invitations`, data).then(r => r.data);
export const respondInvitation = (invId, status) => api.patch(`/workers/invitations/${invId}/respond`, { status }).then(r => r.data);

export const getWorkerJobs = (id) => api.get(`/workers/${id}/jobs`).then(r => r.data);
export const addJobPhoto = (jobId, photo) => api.post(`/workers/jobs/${jobId}/photos`, { photo }).then(r => r.data);
export const deleteJobPhoto = (jobId, idx) => api.delete(`/workers/jobs/${jobId}/photos/${idx}`).then(r => r.data);
export const completeJob = (jobId, data) => api.post(`/workers/jobs/${jobId}/complete`, data).then(r => r.data);

export const addReview = (id, data) => api.post(`/workers/${id}/reviews`, data).then(r => r.data);
export const getAttendance = (id, start, end) => api.get(`/workers/${id}/attendance`, { params: { start, end } }).then(r => r.data);
export const getCalendar = (id, month) => api.get(`/workers/${id}/calendar`, { params: { month } }).then(r => r.data);
