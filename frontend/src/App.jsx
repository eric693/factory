import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
// 登入頁不 lazy（首屏即需）
import Login from './pages/Login';

// 其餘頁面全部 lazy load — 各自獨立 chunk,用到才下載
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const Schedule = lazy(() => import('./pages/Schedule'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const Shipments = lazy(() => import('./pages/Shipments'));
const Analytics = lazy(() => import('./pages/Analytics'));
const MRP = lazy(() => import('./pages/MRP'));
const QRScan = lazy(() => import('./pages/QRScan'));
const CustomerPortal = lazy(() => import('./pages/CustomerPortal'));
const Anomalies = lazy(() => import('./pages/Anomalies'));
const Handovers = lazy(() => import('./pages/Handovers'));
const Quotes = lazy(() => import('./pages/Quotes'));
const FinishedGoods = lazy(() => import('./pages/FinishedGoods'));
const CostAnalysis = lazy(() => import('./pages/CostAnalysis'));
const MorningReport = lazy(() => import('./pages/MorningReport'));
const InquiryPublic = lazy(() => import('./pages/InquiryPublic'));
const Users = lazy(() => import('./pages/Users'));
const Settings = lazy(() => import('./pages/Settings'));
const Kanban = lazy(() => import('./pages/Kanban'));
const Purchase = lazy(() => import('./pages/Purchase'));
const Customers = lazy(() => import('./pages/Customers'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Traceability = lazy(() => import('./pages/Traceability'));
const SPC = lazy(() => import('./pages/SPC'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Molds = lazy(() => import('./pages/Molds'));
const Outsource = lazy(() => import('./pages/Outsource'));
const Complaints = lazy(() => import('./pages/Complaints'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const AISchedule = lazy(() => import('./pages/AISchedule'));
const SOPPage = lazy(() => import('./pages/SOP'));
const FAI = lazy(() => import('./pages/FAI'));
const NCR = lazy(() => import('./pages/NCR'));
const Performance = lazy(() => import('./pages/Performance'));
const YieldAlert = lazy(() => import('./pages/YieldAlert'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Profit = lazy(() => import('./pages/Profit'));
const BossDashboard = lazy(() => import('./pages/BossDashboard'));
const CapacityPlan = lazy(() => import('./pages/CapacityPlan'));
const Skills = lazy(() => import('./pages/Skills'));
const WorkerCenter = lazy(() => import('./pages/WorkerCenter'));
const LaborMap = lazy(() => import('./pages/LaborMap'));
const TodayJobs = lazy(() => import('./pages/TodayJobs'));
const LaborPayroll = lazy(() => import('./pages/LaborPayroll'));
const ProjectFinance = lazy(() => import('./pages/ProjectFinance'));
const LaborHome = lazy(() => import('./pages/LaborHome'));
const LaborCalendar = lazy(() => import('./pages/LaborCalendar'));
const LaborDashboard = lazy(() => import('./pages/LaborDashboard'));
const LaborAttendance = lazy(() => import('./pages/LaborAttendance'));

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30000 } } });

// 頁面載入中的 fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">載入中...</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/mrp" element={<MRP />} />
        <Route path="/anomalies" element={<Anomalies />} />
        <Route path="/handovers" element={<Handovers />} />
        <Route path="/quotes" element={<Quotes />} />
        <Route path="/finished-goods" element={<FinishedGoods />} />
        <Route path="/cost" element={<CostAnalysis />} />
        <Route path="/morning-report" element={<MorningReport />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/kanban" element={<Kanban />} />
        <Route path="/purchase" element={<Purchase />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/traceability" element={<Traceability />} />
        <Route path="/spc" element={<SPC />} />
        <Route path="/payroll" element={<Payroll />} />
        <Route path="/molds" element={<Molds />} />
        <Route path="/outsource" element={<Outsource />} />
        <Route path="/complaints" element={<Complaints />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/ai-schedule" element={<AISchedule />} />
        <Route path="/sop" element={<SOPPage />} />
        <Route path="/fai" element={<FAI />} />
        <Route path="/ncr" element={<NCR />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/yield-alert" element={<YieldAlert />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/profit" element={<Profit />} />
        <Route path="/boss" element={<BossDashboard />} />
        <Route path="/capacity-plan" element={<CapacityPlan />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/labor-map" element={<LaborMap />} />
        <Route path="/worker-center" element={<WorkerCenter />} />
        <Route path="/today-jobs" element={<TodayJobs />} />
        <Route path="/labor-payroll" element={<LaborPayroll />} />
        <Route path="/project-finance" element={<ProjectFinance />} />
        <Route path="/labor-home" element={<LaborHome />} />
        <Route path="/labor-calendar" element={<LaborCalendar />} />
        <Route path="/labor-dashboard" element={<LaborDashboard />} />
        <Route path="/labor-attendance" element={<LaborAttendance />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* 公開頁面（無需登入） */}
            <Route path="/login" element={<Login />} />
            <Route path="/scan/:id" element={<QRScan />} />
            <Route path="/customer/:token" element={<CustomerPortal />} />
            <Route path="/inquiry" element={<InquiryPublic />} />
            {/* 主系統（需登入） */}
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
