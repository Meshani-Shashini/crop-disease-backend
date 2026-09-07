-- Ensure scan results can store localized AI treatment recommendations.
ALTER TABLE public.detections
  ADD COLUMN IF NOT EXISTS sinhala_treatment TEXT,
  ADD COLUMN IF NOT EXISTS english_treatment TEXT;

-- Ask PostgREST to reload its table schema cache after the DDL change.
NOTIFY pgrst, 'reload schema';
