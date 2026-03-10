import { type EdgeProps, type Edge, BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { WorkflowEdgeData } from '@/lib/graph-layout';

/**
 * Edge component that follows dagre's computed waypoints.
 * Dagre handles all routing — including back-edges around nodes —
 * so we just draw a smooth curve through the points it gives us.
 */
export function DagreEdge({
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps<Edge<WorkflowEdgeData>>) {
  const points = data?.points;
  if (!points || points.length < 2) return null;

  // Build a smooth SVG path through dagre's waypoints
  const [first, ...rest] = points;
  let path = `M ${first.x} ${first.y}`;

  if (rest.length === 1) {
    path += ` L ${rest[0].x} ${rest[0].y}`;
  } else {
    // Use catmull-rom-like smoothing: for each segment, use the midpoints
    // as control points for quadratic curves
    for (let i = 0; i < rest.length; i++) {
      const curr = rest[i];
      if (i === 0) {
        // First segment: straight to midpoint, then curve
        const next = rest[i + 1];
        if (next) {
          const midX = (curr.x + next.x) / 2;
          const midY = (curr.y + next.y) / 2;
          path += ` L ${curr.x} ${curr.y}`;
        } else {
          path += ` L ${curr.x} ${curr.y}`;
        }
      } else {
        // Subsequent segments: quadratic curve using previous point as control
        const prev = rest[i - 1];
        path += ` Q ${prev.x} ${prev.y}, ${(prev.x + curr.x) / 2} ${(prev.y + curr.y) / 2}`;
      }
    }
    // Final segment to last point
    const last = rest[rest.length - 1];
    const secondLast = rest[rest.length - 2];
    if (secondLast) {
      path += ` Q ${secondLast.x} ${secondLast.y}, ${last.x} ${last.y}`;
    }
  }

  // Label at the middle waypoint
  const midIdx = Math.floor(points.length / 2);
  const labelX = points[midIdx].x;
  const labelY = points[midIdx].y;

  return (
    <>
      <BaseEdge path={path} style={style} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              ...labelBgStyle,
              padding: '2px 4px',
              borderRadius: 4,
              fontSize: 10,
              ...(labelStyle as React.CSSProperties),
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
