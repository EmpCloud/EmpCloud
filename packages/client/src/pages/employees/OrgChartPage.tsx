import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Network } from "lucide-react";
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

function TreeNode({ node, level = 0 }: { node: OrgChartNode; level?: number }) {
  const [expanded, setExpanded] = useState(level < 2);
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;

  return (
    <div className={level > 0 ? "ml-6 md:ml-10" : ""}>
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
            <TreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// Desktop horizontal card tree
function HorizontalTreeNode({ node, level = 0 }: { node: OrgChartNode; level?: number }) {
  const [expanded, setExpanded] = useState(level < 2);
  const navigate = useNavigate();
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => navigate(`/employees/${node.id}`)}
        className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm hover:shadow-md hover:border-brand-300 transition-all text-center min-w-[160px]"
      >
        <div className="h-10 w-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-semibold text-brand-700 mx-auto mb-2">
          {getInitials(node.name)}
        </div>
        <p className="text-sm font-medium text-gray-900">{node.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{node.designation || "No designation"}</p>
        {node.department && (
          <p className="text-xs text-gray-400">{node.department}</p>
        )}
      </button>

      {hasChildren && (
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-gray-300" />
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1"
          >
            {expanded ? "Collapse" : `${node.children.length} reports`}
          </button>
          {expanded && (
            <>
              <div className="w-px h-2 bg-gray-300" />
              <div className="flex gap-6 relative">
                {node.children.length > 1 && (
                  <div
                    className="absolute top-0 h-px bg-gray-300"
                    style={{
                      left: "50%",
                      right: "50%",
                      marginLeft: `-${(node.children.length - 1) * 50}%`,
                      marginRight: `-${(node.children.length - 1) * 50}%`,
                    }}
                  />
                )}
                {node.children.map((child) => (
                  <div key={child.id} className="flex flex-col items-center">
                    <div className="w-px h-4 bg-gray-300" />
                    <HorizontalTreeNode node={child} level={level + 1} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["org-chart"],
    queryFn: () => api.get("/users/org-chart").then((r) => r.data.data),
  });

  const nodes: OrgChartNode[] = data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Chart</h1>
          <p className="text-gray-500 mt-1">
            Visualize reporting structure across your organization.
          </p>
        </div>
        <Network className="h-6 w-6 text-gray-400" />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading org chart...</div>
      ) : nodes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No employees found. Add employees to see the org chart.
        </div>
      ) : (
        <>
          {/* Desktop: horizontal tree */}
          <div className="hidden lg:block overflow-x-auto pb-8">
            <div className="flex flex-col items-center gap-2 min-w-max">
              {nodes.map((root) => (
                <HorizontalTreeNode key={root.id} node={root} />
              ))}
            </div>
          </div>

          {/* Mobile / Tablet: vertical list tree */}
          <div className="lg:hidden bg-white rounded-xl border border-gray-200 p-4">
            {nodes.map((root) => (
              <TreeNode key={root.id} node={root} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
