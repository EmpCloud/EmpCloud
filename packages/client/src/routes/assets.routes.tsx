import { lazy } from "react";
import { Route } from "react-router-dom";

const AssetDashboardPage = lazy(() => import("@/pages/assets/AssetDashboardPage"));
const AssetListPage = lazy(() => import("@/pages/assets/AssetListPage"));
const AssetDetailPage = lazy(() => import("@/pages/assets/AssetDetailPage"));
const MyAssetsPage = lazy(() => import("@/pages/assets/MyAssetsPage"));
const AssetCategoriesPage = lazy(() => import("@/pages/assets/AssetCategoriesPage"));

export const assetRoutes = (
  <>
    <Route path="/assets/dashboard" element={<AssetDashboardPage />} />
    <Route path="/assets/my" element={<MyAssetsPage />} />
    <Route path="/assets/categories" element={<AssetCategoriesPage />} />
    <Route path="/assets/:id" element={<AssetDetailPage />} />
    <Route path="/assets" element={<AssetListPage />} />
  </>
);
