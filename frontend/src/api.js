import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const dashboard = () => api.get('/dashboard').then(r => r.data);
export const getOrders = (params) => api.get('/orders', { params }).then(r => r.data);
export const getOrder = (id) => api.get(`/orders/${id}`).then(r => r.data);
export const createOrder = (data) => api.post('/orders', data).then(r => r.data);
export const updateOrderStatus = (id, status) => api.patch(`/orders/${id}/status`, { status }).then(r => r.data);
export const deleteOrder = (id) => api.delete(`/orders/${id}`).then(r => r.data);

export const getCustomers = () => api.get('/customers').then(r => r.data);
export const createCustomer = (data) => api.post('/customers', data).then(r => r.data);
export const getProducts = () => api.get('/products').then(r => r.data);
export const createProduct = (data) => api.post('/products', data).then(r => r.data);
export const getMachines = () => api.get('/machines').then(r => r.data);

export const autoSchedule = (order_ids) => api.post('/schedule/auto', { order_ids }).then(r => r.data);
export const getGantt = (params) => api.get('/schedule/gantt', { params }).then(r => r.data);

export const getWorkOrders = (params) => api.get('/work-orders', { params }).then(r => r.data);
export const getWorkOrder = (id) => api.get(`/work-orders/${id}`).then(r => r.data);
export const updateWorkOrder = (id, data) => api.patch(`/work-orders/${id}`, data).then(r => r.data);
export const addProgress = (id, data) => api.post(`/work-orders/${id}/progress`, data).then(r => r.data);

export const getShipments = (params) => api.get('/shipments', { params }).then(r => r.data);
export const createShipment = (data) => api.post('/shipments', data).then(r => r.data);
export const shipOrder = (id, data) => api.patch(`/shipments/${id}/ship`, data).then(r => r.data);

export const getMorningReport = (date) => api.get('/morning-report', { params: { date } }).then(r => r.data);
export const getAnomalies = (status) => api.get('/anomalies', { params: { status } }).then(r => r.data);
export const getHandovers = (date) => api.get('/handovers', { params: date ? { date } : {} }).then(r => r.data);
export const getQuotes = () => api.get('/quotes').then(r => r.data);
export const getInquiries = () => api.get('/quotes/inquiries').then(r => r.data);
export const getFinishedGoods = (status) => api.get('/finished-goods', { params: { status } }).then(r => r.data);
export const getCostOrders = (month) => api.get('/cost/orders', { params: { month } }).then(r => r.data);
