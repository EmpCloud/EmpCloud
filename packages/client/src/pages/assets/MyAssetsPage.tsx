import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/api/client";
import {
  Package,
  Calendar,
  Shield,
  AlertTriangle,
  Hash,
} from "lucide-react";

const CONDITION_COLORS: Record<string, string> = {
  new: "bg-emerald-100 text-emerald-700",
  good: "bg-green-100 text-green-700",
  fair: "bg-yellow-100 text-yellow-700",
  poor: "bg-red-100 text-red-700",
};

export default function MyAssetsPage() {
  const { data: assets, isLoading } = useQuery({
    queryKey: ["my-assets"],
    queryFn: () => api.get("/assets/my").then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Assets</h1>
          <p className="text-sm text-gray-500 mt-1">Equipment and assets assigned to you</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="h-4 w-32 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-20 bg-gray-200 rounded" />
                </div>
                <div className="h-5 w-14 bg-gray-200 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-3 w-36 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assets</h1>
        <p className="text-sm text-gray-500 mt-1">Equipment and assets assigned to you</p>
      </div>

      {!assets || assets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-500 mb-1">No assets assigned to you</p>
          <p className="text-sm text-gray-400">When your organization assigns equipment to you, it will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset: any) => {
            const warrantyExpired = asset.warranty_expiry && new Date(asset.warranty_expiry) < new Date();
            return (
              <Link
                key={asset.id}
                to={`/assets/${asset.id}`}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{asset.name}</h3>
                    <div className="flex items-center gap-1 mt-1">
                      <Hash className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-500">{asset.asset_tag}</span>
                    </div>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${CONDITION_COLORS[asset.condition_status] || "bg-gray-100"}`}>
                    {asset.condition_status}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  {asset.category_name && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Package className="h-4 w-4 text-gray-400" />
                      {asset.category_name}
                    </div>
                  )}
                  {asset.brand && (
                    <div className="text-gray-600">
                      {asset.brand} {asset.model && `- ${asset.model}`}
                    </div>
                  )}
                  {asset.serial_number && (
                    <div className="text-xs text-gray-400">S/N: {asset.serial_number}</div>
                  )}
                  {asset.assigned_at && (
                    <div className="flex items-center gap-2 text-gray-500 text-xs">
                      <Calendar className="h-3 w-3" />
                      Assigned {new Date(asset.assigned_at).toLocaleDateString()}
                    </div>
                  )}
                  {asset.warranty_expiry && (
                    <div className={`flex items-center gap-2 text-xs ${warrantyExpired ? "text-red-600" : "text-gray-500"}`}>
                      {warrantyExpired ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : (
                        <Shield className="h-3 w-3" />
                      )}
                      Warranty: {new Date(asset.warranty_expiry).toLocaleDateString()}
                      {warrantyExpired && " (Expired)"}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
