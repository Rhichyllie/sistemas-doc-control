import { docStatusLabels } from "./labels";

// Chart-friendly hex color mapping for charts (used in status badges (tailwind colors converted to hex
export const statusColorMap: Record<string, string> = {
  "in_analysis": "#ffd739ff", // Yellow 400
  "rejected": "#991b1b", // Dark Red
  "approved": "#06a13fff", // Green 500
  "approved_with_comments": "#91ffdaff", // Emerald 500
  "awaiting_revision": "#2f7cf8ff", // Blue 500
  "cancelled": "#9CA3AF", // Gray 400
};

// Additional colors for other chart series
export const chartColors = {
  "in_analysis": "#FACC15",
  "rejected": "#991b1b",
  "approved": "#22C55E",
  "approved_with_comments": "#10B981",
  "awaiting_revision": "#3B82F6",
  "cancelled": "#9CA3AF",
  "atrasados": "#EF4444",
  "aguardando_retorno": "#3B82F6",
  "no_prazo": "#22C55E"
};

export function getStatusClassName(status: string) {
  let className = "px-2 py-1 rounded-full text-xs font-medium";
  
  switch (status) {
    case "in_analysis":
      className += " bg-yellow-100 text-yellow-800";
      break;
    case "rejected":
      className += " bg-red-100 text-red-800";
      break;
    case "approved":
      className += " bg-green-100 text-green-800";
      break;
    case "approved_with_comments":
      className += " bg-emerald-100 text-emerald-800";
      break;
    case "awaiting_revision":
      className += " bg-blue-100 text-blue-800";
      break;
    case "cancelled":
      className += " bg-gray-100 text-gray-800";
      break;
    default:
      className += " bg-gray-100 text-gray-800";
      break;
  }
  
  return className;
}

export function StatusBadge({ status }: { status: string }) {
  const className = getStatusClassName(status);
  return (
    <span className={className}>
      {docStatusLabels[status as keyof typeof docStatusLabels] || status}
    </span>
  );
}
