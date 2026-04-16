import type { MediaAttachment } from "@empcloud/shared";
import { FileText } from "lucide-react";

type Props = {
  media: MediaAttachment[];
};

// Render up to 4 image tiles in a mosaic; the 4th tile shows a "+N" overlay
// when the post has more than 4 images. Files fall back to a named pill row.
// Phase 1 doesn't upload — this component only renders existing URLs, so we
// can re-use it verbatim once the phase 2 upload endpoint lands.
export function MediaGrid({ media }: Props) {
  if (!media || media.length === 0) return null;

  const images = media.filter((m) => m.kind === "image");
  const files = media.filter((m) => m.kind === "file");

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 && <ImageMosaic images={images} />}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full hover:bg-gray-200"
            >
              <FileText className="h-3.5 w-3.5" />
              {f.name || "Attachment"}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageMosaic({ images }: { images: MediaAttachment[] }) {
  const visible = images.slice(0, 4);
  const remainder = images.length - visible.length;

  // Grid template adapts to image count so a single image isn't stretched
  const cls =
    visible.length === 1
      ? "grid grid-cols-1"
      : visible.length === 2
        ? "grid grid-cols-2"
        : visible.length === 3
          ? "grid grid-cols-2 [&>*:first-child]:row-span-2"
          : "grid grid-cols-2";

  return (
    <div className={`${cls} gap-1 rounded-lg overflow-hidden border border-gray-100`}>
      {visible.map((img, i) => (
        <div
          key={i}
          className="relative bg-gray-50 aspect-[4/3]"
          style={visible.length === 1 ? { aspectRatio: "16/9" } : undefined}
        >
          <img src={img.url} alt="" className="h-full w-full object-cover" />
          {i === 3 && remainder > 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-lg font-semibold">
              +{remainder}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
