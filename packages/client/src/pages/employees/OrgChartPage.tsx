import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Network,
  Plus,
  Minus,
  Maximize2,
  ChevronDown,
  ChevronRight,
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

/* ------------------------------------------------------------------ */
/*  Compact card for each person                                      */
/* ------------------------------------------------------------------ */
function NodeCard({
  node,
  onNavigate,
}: {
  node: OrgChartNode;
  onNavigate: (id: number) => void;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(node.id);
      }}
      className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm hover:shadow-md hover:border-brand-300 transition-all text-center w-[172px] cursor-pointer select-none"
    >
      <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700 mx-auto mb-1.5">
        {getInitials(node.name)}
      </div>
      <p className="text-sm font-medium text-gray-900 truncate">{node.name}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
        {node.designation || "No designation"}
      </p>
      {node.department && (
        <p className="text-[11px] text-gray-400 truncate">{node.department}</p>
      )}
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
}: {
  node: OrgChartNode;
  onNavigate: (id: number) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* The card itself */}
      <div className="relative">
        <NodeCard node={node} onNavigate={onNavigate} />
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 h-5 w-5 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-500"
          >
            {expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="flex flex-col items-center">
          {/* Vertical line from parent */}
          <div className="w-px h-6 bg-gray-300" />

          {/* Horizontal connector bar + children */}
          <div className="relative flex gap-8">
            {/* Horizontal bar across all children */}
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-px bg-gray-300"
                style={{
                  left: `calc(50% / ${node.children.length})`,
                  right: `calc(50% / ${node.children.length})`,
                }}
              />
            )}

            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* Vertical stub into child */}
                <div className="w-px h-5 bg-gray-300" />
                <ChartNode
                  node={child}
                  onNavigate={onNavigate}
                  level={level + 1}
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

  // Fit-to-screen: measure content, compute ideal scale & offset
  const fitToScreen = useCallback(() => {
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
  }, [scale]);

  // Auto-fit once data loads
  const didAutoFit = useRef(false);
  useEffect(() => {
    if (nodes.length > 0 && !didAutoFit.current) {
      // Wait a tick for the DOM to render
      const id = setTimeout(() => {
        fitToScreen();
        didAutoFit.current = true;
      }, 200);
      return () => clearTimeout(id);
    }
  }, [nodes.length, fitToScreen]);

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
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Organization Chart
          </h1>
          <p className="text-gray-500 mt-1">
            Visualize reporting structure across your organization.
          </p>
        </div>
        <Network className="h-6 w-6 text-gray-400" />
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
            className="hidden lg:block relative flex-1 h-[calc(100vh-11rem)] overflow-hidden rounded-xl border border-gray-200 bg-gray-50/70"
            style={{ cursor: isDragging ? "grabbing" : "grab" }}
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
                onClick={fitToScreen}
                className="h-9 w-9 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50 text-gray-600 mt-1"
                title="Fit to screen"
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
