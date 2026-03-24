-- ============================================================
-- RentFlow - Storage Bucket Setup
-- Run this in Supabase SQL Editor AFTER creating the bucket
-- in the Supabase Dashboard (Storage → New Bucket)
-- Bucket name: tenant-documents | Public: OFF
-- ============================================================

-- Allow owners to upload/read/delete documents for their buildings
CREATE POLICY "Owner manages tenant documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'tenant-documents'
  AND EXISTS (
    SELECT 1 FROM public.buildings b
    WHERE b.owner_id = auth.uid()
    AND (storage.foldername(name))[1] = b.id::text
  )
);

-- Allow tenants to upload their own ID proofs
CREATE POLICY "Tenant uploads own id proof"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tenant-documents'
  AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.user_id = auth.uid()
    AND t.is_active = TRUE
    AND (storage.foldername(name))[1] = t.building_id::text
    AND (storage.foldername(name))[2] = t.id::text
  )
  -- Tenants can only upload id_proof, not rent_agreement
  AND name NOT LIKE '%rent_agreement%'
);

-- Allow tenants to read their own documents
CREATE POLICY "Tenant reads own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'tenant-documents'
  AND EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.user_id = auth.uid()
    AND t.is_active = TRUE
    AND (storage.foldername(name))[2] = t.id::text
  )
);
