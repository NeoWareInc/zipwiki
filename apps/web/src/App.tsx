import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing";
import { TermsPage, PrivacyPage } from "./pages/LegalPages";
import { MarketingLayout } from "./components/MarketingLayout";
import ProductPage from "./pages/marketing/ProductPage";
import HowItWorksPage from "./pages/marketing/HowItWorksPage";
import PricingPage from "./pages/marketing/PricingPage";
import RoadmapPage from "./pages/marketing/RoadmapPage";

export default function App() {
  return (
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
