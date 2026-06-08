import axios from 'axios';
const api = axios.create({ baseURL: '/api' });

export const getPayrollMeta = () => api.get('/labor-payroll/meta').then(r => r.data);
export const getPreview = (params) => api.get('/labor-payroll/preview', { params }).then(r => r.data);
export const settlePayroll = (data) => api.post('/labor-payroll/settle', data).then(r => r.data);
export const reverseSettle = (data) => api.delete('/labor-payroll/settle', { data }).then(r => r.data);
export const getPeriodStatus = (params) => api.get('/labor-payroll/period-status', { params }).then(r => r.data);
export const getRecords = (params) => api.get('/labor-payroll/records', { params }).then(r => r.data);
export const getRates = (workerId) => api.get(`/labor-payroll/rates/${workerId}`).then(r => r.data);
export const addRate = (workerId, data) => api.post(`/labor-payroll/rates/${workerId}`, data).then(r => r.data);
export const deleteRate = (rateId) => api.delete(`/labor-payroll/rates/${rateId}`).then(r => r.data);
export const getLeave = (workerId, year) => api.get(`/labor-payroll/leave/${workerId}`, { params: { year } }).then(r => r.data);
export const addLeave = (workerId, data) => api.post(`/labor-payroll/leave/${workerId}`, data).then(r => r.data);
export const getSalaryHistory = (workerId) => api.get(`/labor-payroll/history/${workerId}`).then(r => r.data);

// 專案財務
export const getProjects = () => api.get('/labor-finance').then(r => r.data);
export const createProject = (data) => api.post('/labor-finance', data).then(r => r.data);
export const getProjectDetail = (id) => api.get(`/labor-finance/${id}/detail`).then(r => r.data);
export const addReceipt = (id, data) => api.post(`/labor-finance/${id}/receipts`, data).then(r => r.data);
export const addCost = (id, data) => api.post(`/labor-finance/${id}/costs`, data).then(r => r.data);
export const returnCost = (id, data) => api.post(`/labor-finance/${id}/costs/return`, data).then(r => r.data);
export const deleteCost = (cid) => api.delete(`/labor-finance/costs/${cid}`).then(r => r.data);
export const deleteProject = (id) => api.delete(`/labor-finance/${id}`).then(r => r.data);

// 營運儀表板 / 推薦 / 出勤
export const getLaborDashboard = () => api.get('/labor-dashboard').then(r => r.data);
export const getRecommendations = (params) => api.get('/labor-dashboard/recommend', { params }).then(r => r.data);
export const getAttendanceReport = (params) => api.get('/labor-dashboard/attendance', { params }).then(r => r.data);
