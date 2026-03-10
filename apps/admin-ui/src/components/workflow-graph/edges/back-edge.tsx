import { type EdgeProps, type Edge, BaseEdge, EdgeLabelRenderer } from '@xyflow/react';
import type { WorkflowEdgeData } from '@/lib/graph-layout';

/**
 * Custom edge that routes back-edges (target above source) in a wide arc
 * to the right of the graph, avoiding overlap with forward-flow edges.
 */
export function BackEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps<Edge<WorkflowEdgeData>>) {
  // Route right: go out to the right, then up, then back left to the target
  const offset = 80; // how far right to swing
  const rightX = Math.max(sourceX, targetX) + offset;

  const path = [
    `M ${sourceX} ${sourceY}`,
    `C ${rightX} ${sourceY}, ${rightX} ${targetY}, ${targetX} ${targetY}`,
  ].join(' ');

  const labelX = rightX - 10;
  const labelY = (sourceY + targetY) / 2;

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
