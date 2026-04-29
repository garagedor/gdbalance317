import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";

import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import PendingApproval from "./pages/PendingApproval.tsx";
import NotFound from "./pages/NotFound.tsx";
import TechHome from "./pages/tech/TechHome.tsx";
import TechReport from "./pages/tech/TechReport.tsx";
import AdminHome from "./pages/admin/AdminHome.tsx";
import AdminReport from "./pages/admin/AdminReport.tsx";
import AdminAreas from "./pages/admin/AdminAreas.tsx";
import AdminUsers from "./pages/admin/AdminUsers.tsx";
import AdminTechnicians from "./pages/admin/AdminTechnicians.tsx";
import AdminManagers from "./pages/admin/AdminManagers.tsx";
import AdminProviders from "./pages/admin/AdminProviders.tsx";
import AdminCompany from "./pages/admin/AdminCompany.tsx";
import AdminSettings from "./pages/admin/AdminSettings.tsx";
import AdminNotifications from "./pages/admin/AdminNotifications.tsx";
import ManagerHome from "./pages/manager/ManagerHome.tsx";
import ManagerReport from "./pages/manager/ManagerReport.tsx";
import OfficeJobs from "./pages/office/OfficeJobs.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/pending" element={<PendingApproval />} />

            <Route
              path="/tech"
              element={<ProtectedRoute allow={["technician", "area_manager"]}><TechHome /></ProtectedRoute>}
            />
            <Route
              path="/tech/report/:id"
              element={<ProtectedRoute allow={["technician", "area_manager"]}><TechReport /></ProtectedRoute>}
            />

            <Route
              path="/admin"
              element={<ProtectedRoute allow={["management"]}><AdminHome /></ProtectedRoute>}
            />
            <Route
              path="/admin/report/:id"
              element={<ProtectedRoute allow={["management"]}><AdminReport /></ProtectedRoute>}
            />
            <Route
              path="/admin/areas"
              element={<ProtectedRoute allow={["management"]}><AdminAreas /></ProtectedRoute>}
            />
            <Route
              path="/admin/users"
              element={<ProtectedRoute allow={["management"]}><AdminUsers /></ProtectedRoute>}
            />
            <Route
              path="/admin/reports"
              element={<ProtectedRoute allow={["management"]}><AdminHome /></ProtectedRoute>}
            />
            <Route
              path="/admin/technicians"
              element={<ProtectedRoute allow={["management"]}><AdminTechnicians /></ProtectedRoute>}
            />
            <Route
              path="/admin/managers"
              element={<ProtectedRoute allow={["management"]}><AdminManagers /></ProtectedRoute>}
            />
            <Route
              path="/admin/providers"
              element={<ProtectedRoute allow={["management"]}><AdminProviders /></ProtectedRoute>}
            />
            <Route
              path="/admin/company"
              element={<ProtectedRoute allow={["management"]}><AdminCompany /></ProtectedRoute>}
            />
            <Route
              path="/admin/settings"
              element={<ProtectedRoute allow={["management"]}><AdminSettings /></ProtectedRoute>}
            />
            <Route
              path="/admin/notifications"
              element={<ProtectedRoute allow={["management"]}><AdminNotifications /></ProtectedRoute>}
            />

            <Route
              path="/manager"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/team"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/mine"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/balance"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/technicians"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/areas"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/report/:id"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerReport /></ProtectedRoute>}
            />

            {/* Aliases — accept /area-manager/* paths so any external link or
                bookmark using that prefix still routes the AM correctly. */}
            <Route
              path="/area-manager"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/area-manager/team-reports"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/area-manager/my-reports"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/area-manager/my-weekly-balance"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/area-manager/technicians"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/area-manager/areas"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/area-manager/report/:id"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerReport /></ProtectedRoute>}
            />

            <Route
              path="/office"
              element={<ProtectedRoute allow={["office_staff", "management"]}><OfficeJobs /></ProtectedRoute>}
            />
            <Route
              path="/admin/office-jobs"
              element={<ProtectedRoute allow={["management"]}><OfficeJobs /></ProtectedRoute>}
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
