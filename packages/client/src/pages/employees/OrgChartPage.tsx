import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Network,
  Plus,
  Minus,
  Maximize2,
  ChevronDown,
  ChevronRight,
  Users,
  Briefcase,
  Building2,
  Search,
  X,
} from "lucide-react";
import api from "@/api/client";

interface OrgChartNode {
  id: number;
  name: string;
  designation: string | null;
  department: string | null;
  photo: string | null;
  children: OrgChartNode[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Deterministic gradient picker — so each department has a consistent hue.
// Using pastel 200/300 range for a softer, lighter feel.
const DEPT_GRADIENTS = [
  "from-indigo-200 to-violet-200",
  "from-sky-200 to-cyan-200",
  "from-emerald-200 to-teal-200",
  "from-amber-200 to-orange-200",
  "from-rose-200 to-pink-200",
  "from-purple-200 to-fuchsia-200",
];

// Slightly more saturated for the avatar bg (so white initials still read clearly).
const DEPT_AVATAR_GRADIENTS = [
  "from-indigo-300 to-violet-400",
  "from-sky-300 to-cyan-400",
  "from-emerald-300 to-teal-400",
  "from-amber-300 to-orange-400",
  "from-rose-300 to-pink-400",
  "from-purple-300 to-fuchsia-400",
];

function deptIndex(dept: string | null): number {
  if (!dept) return -1;
  let hash = 0;
  for (let i = 0; i < dept.length; i++) hash = (hash * 31 + dept.charCodeAt(i)) | 0;
  return Math.abs(hash) % DEPT_GRADIENTS.length;
}

function deptGradient(dept: string | null): string {
  const idx = deptIndex(dept);
  return idx === -1 ? "from-gray-200 to-gray-300" : DEPT_GRADIENTS[idx];
}

function deptAvatarGradient(dept: string | null): string {
  const idx = deptIndex(dept);
  return idx === -1 ? "from-gray-300 to-gray-400" : DEPT_AVATAR_GRADIENTS[idx];
}

/* ------------------------------------------------------------------ */
/*  Rich card for each person                                         */
/* ------------------------------------------------------------------ */
function NodeCard({
  node,
  onNavigate,
  isHighlighted = false,
  hasChildren = false,
}: {
  node: OrgChartNode;
  onNavigate: (id: number) => void;
  isHighlighted?: boolean;
  hasChildren?: boolean;
}) {
  const stripGradient = deptGradient(node.department);
  const avatarGradient = deptAvatarGradient(node.department);
  // Track image-load failures so we fall back to initials instead of showing
  // a broken <img>. Some users have photo set to an invalid path or to a
  // URL that 404s — previous behaviour was a broken-image icon.
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = Boolean(node.photo) && !imageFailed;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(node.id);
      }}
      className={`group relative w-[200px] overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isHighlighted
          ? "border-brand-300 ring-2 ring-brand-100"
          : "border-gray-200 hover:border-brand-200"
      }`}
    >
      {/* Colored top strip (department-based, pastel) */}
      <div className={`h-1 w-full bg-gradient-to-r ${stripGradient}`} />

      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          {/* Avatar with colored ring for managers */}
          <div className="relative shrink-0">
            {showPhoto ? (
              <img
                src={node.photo!}
                alt={node.name}
                onError={() => setImageFailed(true)}
                className={`h-11 w-11 rounded-full object-cover ring-2 ${
                  hasChildren ? "ring-brand-100" : "ring-gray-100"
                }`}
              />
            ) : (
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient} text-xs font-semibold text-white ring-2 ${
                  hasChildren ? "ring-brand-100" : "ring-white"
                }`}
              >
                {getInitials(node.name)}
              </div>
            )}
            {hasChildren && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white ring-2 ring-white">
                {node.children.length}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand-600">
              {node.name}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-medium text-gray-600">
              {node.designation || "No designation"}
            </p>
            {node.department && (
              <span className="mt-1 inline-block truncate rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                {node.department}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Recursive tree node (top-down with SVG-like CSS connector lines)  */
/* ------------------------------------------------------------------ */
function ChartNode({
  node,
  onNavigate,
  level = 0,
  highlightedId = null,
}: {
  node: OrgChartNode;
  onNavigate: (id: number) => void;
  level?: number;
  highlightedId?: number | null;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const isHighlighted = highlightedId === node.id;

  return (
    <div className="flex flex-col items-center">
      {/* The card itself */}
      <div className="relative">
        <NodeCard
          node={node}
          onNavigate={onNavigate}
          isHighlighted={isHighlighted}
          hasChildren={hasChildren}
        />
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="absolute -bottom-3 left-1/2 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600"
            title={expanded ? "Collapse team" : `Expand ${node.children.length} report${node.children.length === 1 ? "" : "s"}`}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="flex flex-col items-center">
          {/* Vertical line from parent */}
          <div className="h-7 w-0.5 bg-gradient-to-b from-gray-200 to-gray-300" />

          {/* Horizontal connector bar + children */}
          <div className="relative flex gap-10">
            {/* Horizontal bar across all children */}
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-0.5 bg-gray-300"
                style={{
                  left: `calc(50% / ${node.children.length})`,
                  right: `calc(50% / ${node.children.length})`,
                }}
              />
            )}

            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* Vertical stub into child */}
                <div className="h-5 w-0.5 bg-gray-300" />
                <ChartNode
                  node={child}
                  onNavigate={onNavigate}
                  level={level + 1}
                  highlightedId={highlightedId}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile vertical list tree (unchanged from original)               */
/* ------------------------------------------------------------------ */
function MobileTreeNode({
  node,
  level = 0,
}: {
  node: OrgChartNode;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;

  return (
    <div className={level > 0 ? "ml-6" : ""}>
      <div className="flex items-center gap-2 py-1">
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-center h-6 w-6 rounded hover:bg-gray-100 text-gray-400"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="w-6" />
        )}
        <button
          onClick={() => navigate(`/employees/${node.id}`)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
        >
          <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700 shrink-0">
            {getInitials(node.name)}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900 group-hover:text-brand-600">
              {node.name}
            </p>
            <p className="text-xs text-gray-500">
              {node.designation || "No designation"}
              {node.department ? ` - ${node.department}` : ""}
            </p>
          </div>
          {hasChildren && (
            <span className="text-xs text-gray-400 ml-2">
              ({node.children.length})
            </span>
          )}
        </button>
      </div>
      {expanded && hasChildren && (
        <div className="border-l-2 border-gray-200 ml-3">
          {node.children.map((child) => (
            <MobileTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page — pannable / zoomable viewport                          */
/* ------------------------------------------------------------------ */
export default function OrgChartPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["org-chart"],
    queryFn: () => api.get("/users/org-chart").then((r) => r.data.data),
  });

  const nodes: OrgChartNode[] = data || [];

  // Search state — flatten the tree once for quick matching
  const [search, setSearch] = useState("");
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const flatPeople = useMemo(() => {
    const out: OrgChartNode[] = [];
    const walk = (n: OrgChartNode) => {
      out.push(n);
      n.children.forEach(walk);
    };
    nodes.forEach(walk);
    return out;
  }, [nodes]);

  const stats = useMemo(() => {
    const managers = flatPeople.filter((p) => p.children.length > 0).length;
    const depts = new Set(flatPeople.map((p) => p.department).filter(Boolean)).size;
    return {
      total: flatPeople.length,
      managers,
      departments: depts,
    };
  }, [flatPeople]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return flatPeople
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.designation || "").toLowerCase().includes(q) ||
          (p.department || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [flatPeople, search]);

  // --- pan / zoom state ---
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(0.85);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateAtDragStart = useRef({ x: 0, y: 0 });

  // Wheel zoom — anchored to cursor
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setScale((prev) => {
        const next = Math.max(0.15, Math.min(2.5, prev + delta));
        // Keep the point under the cursor stable
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          const ratio = next / prev;
          setTranslate((t) => ({
            x: cx - ratio * (cx - t.x),
            y: cy - ratio * (cy - t.y),
          }));
        }
        return next;
      });
    },
    [],
  );

  // Attach wheel listener with { passive: false } so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Drag-to-pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Ignore if the user clicked a button / link inside the chart
      if ((e.target as HTMLElement).closest("button, a")) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateAtDragStart.current = { ...translate };
    },
    [translate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setTranslate({
        x: translateAtDragStart.current.x + (e.clientX - dragStart.current.x),
        y: translateAtDragStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch support for mobile pan
  const touchStart = useRef({ x: 0, y: 0 });
  const translateAtTouchStart = useRef({ x: 0, y: 0 });
  const [isTouching, setIsTouching] = useState(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      setIsTouching(true);
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      translateAtTouchStart.current = { ...translate };
    },
    [translate],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isTouching || e.touches.length !== 1) return;
      setTranslate({
        x:
          translateAtTouchStart.current.x +
          (e.touches[0].clientX - touchStart.current.x),
        y:
          translateAtTouchStart.current.y +
          (e.touches[0].clientY - touchStart.current.y),
      });
    },
    [isTouching],
  );

  const handleTouchEnd = useCallback(() => {
    setIsTouching(false);
  }, []);

  // #1556 — Maximize button now does what the icon implies: enter browser
  // fullscreen on the chart container, then re-fit so the chart fills the
  // newly-larger viewport. Toggle exits fullscreen if already in it.
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const inFullscreen = !!document.fullscreenElement;
    const after = () => setTimeout(() => fitToScreenInternal(), 100);
    if (inFullscreen) {
      void document.exitFullscreen().then(after);
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().then(after);
    } else {
      // Browser doesn't support Fullscreen API — at least re-fit.
      fitToScreenInternal();
    }
  }, []);

  // Fit-to-screen: measure content, compute ideal scale & offset.
  // Extracted to a ref-stable inner so toggleFullscreen can call it.
  const fitToScreenInternal = () => {
    if (!containerRef.current || !contentRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const content = contentRef.current.getBoundingClientRect();

    // content bbox in un-scaled space
    const contentW = content.width / scale;
    const contentH = content.height / scale;

    const padding = 60; // px breathing room
    const fitScale = Math.min(
      (container.width - padding) / contentW,
      (container.height - padding) / contentH,
      1.2, // don't zoom in too much
    );

    const scaledW = contentW * fitScale;
    const scaledH = contentH * fitScale;

    setScale(fitScale);
    setTranslate({
      x: (container.width - scaledW) / 2,
      y: (container.height - scaledH) / 2,
    });
  };

  // Auto-fit once data loads
  const didAutoFit = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !didAutoFit.current) {
      // Wait a tick for the DOM to render
      const id = setTimeout(() => {
        fitToScreenInternal();
        didAutoFit.current = true;
      }, 200);
      return () => clearTimeout(id);
    }
  }, [nodes.length]);

  const zoomPercent = Math.round(scale * 100);

  const handleNavigate = useCallback(
    (id: number) => {
      navigate(`/employees/${id}`);
    },
    [navigate],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-4 shrink-0 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-600">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Organization Chart</h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Visualize reporting structure across your organization.
              </p>
            </div>
          </div>

          {/* Stats pills */}
          {!isLoading && nodes.length > 0 && (
            <div className="hidden items-center gap-2 md:flex">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <Users className="h-4 w-4 text-indigo-500" />
                <div>
                  <p className="text-xs text-gray-500">People</p>
                  <p className="text-sm font-semibold text-gray-900">{stats.total}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <Briefcase className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xs text-gray-500">Managers</p>
                  <p className="text-sm font-semibold text-gray-900">{stats.managers}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
                <Building2 className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-xs text-gray-500">Departments</p>
                  <p className="text-sm font-semibold text-gray-900">{stats.departments}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Search bar */}
        {!isLoading && nodes.length > 0 && (
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, designation, or department..."
              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
            />
            {search && (
              <button
                onClick={() => {
                  setSearch("");
                  setHighlightedId(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {searchResults.length > 0 && (
              <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setHighlightedId(p.id);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-300 to-violet-400 text-[10px] font-semibold text-white">
                      {getInitials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {p.designation || "No designation"}
                        {p.department ? ` · ${p.department}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Loading org chart...
        </div>
      ) : nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          No employees found. Add employees to see the org chart.
        </div>
      ) : (
        <>
          {/* ====== Desktop: pannable / zoomable viewport ====== */}
          <div
            ref={containerRef}
            className="hidden lg:block relative flex-1 h-[calc(100vh-16rem)] overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-slate-100"
            style={{
              cursor: isDragging ? "grabbing" : "grab",
              backgroundImage:
                "radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Zoom controls */}
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-1.5">
              <button
                onClick={() =>
                  setScale((s) => Math.min(2.5, s + 0.15))
                }
                className="h-9 w-9 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-600"
                title="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </button>
              <div className="text-[10px] text-center text-gray-400 font-medium select-none">
                {zoomPercent}%
              </div>
              <button
                onClick={() =>
                  setScale((s) => Math.max(0.15, s - 0.15))
                }
                className="h-9 w-9 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-600"
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="h-9 w-9 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-600 mt-1"
                title="Toggle fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>

            {/* Hint text */}
            <div className="absolute bottom-3 left-3 z-20 text-[11px] text-gray-400 select-none pointer-events-none">
              Scroll to zoom &middot; Drag to pan
            </div>

            {/* Transformable content layer */}
            <div
              ref={contentRef}
              style={{
                transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
                transformOrigin: "0 0",
              }}
              className="inline-flex flex-col items-center gap-4 p-12 select-none"
            >
              {nodes.map((root) => (
                <ChartNode
                  key={root.id}
                  node={root}
                  onNavigate={handleNavigate}
                  highlightedId={highlightedId}
                />
              ))}
            </div>
          </div>

          {/* ====== Mobile / Tablet: vertical list tree ====== */}
          <div
            className="lg:hidden bg-white rounded-xl border border-gray-200 p-4 overflow-auto"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {nodes.map((root) => (
              <MobileTreeNode key={root.id} node={root} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
