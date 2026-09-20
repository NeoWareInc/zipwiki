import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Landing from "./pages/Landing";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import { TermsPage, PrivacyPage } from "./pages/LegalPages";
import { MarketingLayout } from "./components/MarketingLayout";
import ProductPage from "./pages/marketing/ProductPage";
import HowItWorksPage from "./pages/marketing/HowItWorksPage";
import PricingPage from "./pages/marketing/PricingPage";
import RoadmapPage from "./pages/marketing/RoadmapPage";
import DashboardPage from "./pages/DashboardPage";
import KeysPage from "./pages/KeysPage";
import BillingPage from "./pages/BillingPage";
import AdminPage from "./pages/AdminPage";
import AdminAccountPage from "./pages/AdminAccountPage";
import SettingsPage from "./pages/SettingsPage";
import KnowledgePage from "./pages/KnowledgePage";
import CreateKnowledgePage from "./pages/CreateKnowledgePage";
import CliSetupPage from "./pages/CliSetupPage";
import DeviceApprovePage from "./pages/DeviceApprovePage";
import { DashboardLayout } from "./components/DashboardLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AuthCallbackPage } from "./components/AuthSession";

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/product" element={<ProductPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/plugin" element={<Navigate to="/#plugin" replace />} />
            <Route path="/format" element={<Navigate to="/how-it-works" replace />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/signed-in" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/cli/device" element={<DeviceApprovePage />} />
            <Route path="/cli/setup" element={<CliSetupPage />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dashboard/knowledge" element={<KnowledgePage />} />
              <Route
                path="/dashboard/knowledge/create"
                element={<CreateKnowledgePage />}
              />
              <Route path="/dashboard/settings" element={<SettingsPage />} />
              <Route path="/dashboard/keys" element={<KeysPage />} />
              <Route path="/dashboard/billing" element={<BillingPage />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute admin />}>
            <Route element={<DashboardLayout />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/accounts/:id" element={<AdminAccountPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
