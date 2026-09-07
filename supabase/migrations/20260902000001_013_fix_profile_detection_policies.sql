-- Make the helper independent of search_path and avoid profiles policy recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
DROP POLICY IF EXISTS "delete_own_profile" ON public.profiles;

CREATE POLICY "select_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "insert_own_profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (auth.uid() = id OR public.is_admin());
CREATE POLICY "delete_own_profile" ON public.profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "select_own_detections" ON public.detections;
DROP POLICY IF EXISTS "insert_own_detections" ON public.detections;
DROP POLICY IF EXISTS "update_own_detections" ON public.detections;
DROP POLICY IF EXISTS "delete_own_detections" ON public.detections;

CREATE POLICY "select_own_detections" ON public.detections
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "insert_own_detections" ON public.detections
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update_own_detections" ON public.detections
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "delete_own_detections" ON public.detections
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());
