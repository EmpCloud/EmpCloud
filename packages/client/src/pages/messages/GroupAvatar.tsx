// =============================================================================
// EMP CLOUD — Group avatar
// =============================================================================
//
// The group avatar is served from an authenticated route (/api/v1/.../avatar),
// so a raw <img src> would 404 — it can't send the Bearer token. Fetch the photo
// as an authenticated blob (same pattern as message attachments / employee
// photos) and fall back to the Users icon when there's no photo.

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import api from "@/api/client";

export function GroupAvatar({
  url,
  size = "h-10 w-10",
  iconSize = "h-5 w-5",
}: {
  url: string | null | undefined;
  size?: string;
  iconSize?: string;
}) {
  const { data: blobUrl, isError } = useQuery({
    queryKey: ["chat-group-avatar", url],
    queryFn: async () => {
      const relative = (url ?? "").replace(/^\/api\/v1/, "");
      const res = await api.get(relative, { responseType: "blob" });
      return URL.createObjectURL(res.data);
    },
    enabled: !!url,
    retry: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    throwOnError: false,
    refetchOnWindowFocus: false,
  });

  if (url && blobUrl && !isError) {
    return (
      <img src={blobUrl} alt="" className={`${size} flex-shrink-0 rounded-full object-cover`} />
    );
  }
  return (
    <div
      className={`${size} flex flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700`}
    >
      <Users className={iconSize} />
    </div>
  );
}
