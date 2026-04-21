import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/auth/ProtectedRoute";

import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import TechHome from "./pages/tech/TechHome.tsx";
import TechReport from "./pages/tech/TechReport.tsx";
import AdminHome from "./pages/admin/AdminHome.tsx";
import AdminReport from "./pages/admin/AdminReport.tsx";
import AdminAreas from "./pages/admin/AdminAreas.tsx";
import AdminUsers from "./pages/admin/AdminUsers.tsx";
import ManagerHome from "./pages/manager/ManagerHome.tsx";
import ManagerReport from "./pages/manager/ManagerReport.tsx";

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

            <Route
              path="/tech"
              element={<ProtectedRoute allow={["technician"]}><TechHome /></ProtectedRoute>}
            />
            <Route
              path="/tech/report/:id"
              element={<ProtectedRoute allow={["technician"]}><TechReport /></ProtectedRoute>}
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
              path="/manager"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerHome /></ProtectedRoute>}
            />
            <Route
              path="/manager/report/:id"
              element={<ProtectedRoute allow={["area_manager"]}><ManagerReport /></ProtectedRoute>}
            />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
