// The ONE home of the drawing-progress vocabulary: the six phase names the
// Worker persists (migration 0062's CHECK constraint, written by
// worker/lib/ai/jobs.ts) and the browser reads off the extraction-status poll.
// It lives in src/data/ for the reason src/data/abn.ts does: the Worker
// re-exports it (worker/lib/drawing/contract.ts) and the client types its
// payload by it, and the only way the two can never drift is for them to be
// the same tuple. A rename here fails to compile on both sides.
export const DRAWING_PROGRESS_PHASES = ["inventory", "elevation_inventory", "floorplan_location", "orientation", "render_crops", "opening_read"] as const;
export type DrawingProgressPhase = (typeof DRAWING_PROGRESS_PHASES)[number];
