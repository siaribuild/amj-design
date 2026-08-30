-- The opening counter cannot advance while the parser performs page-wide
-- preparation. Persist the real subphase so the customer sees forward motion
-- without pretending an opening has already been read.
ALTER TABLE ai_job_claim ADD COLUMN drawings_phase TEXT
  CHECK (drawings_phase IS NULL OR drawings_phase IN (
    'inventory',
    'elevation_inventory',
    'floorplan_location',
    'orientation',
    'render_crops',
    'opening_read'
  ));
