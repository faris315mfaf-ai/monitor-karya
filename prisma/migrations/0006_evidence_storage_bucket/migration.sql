-- Private bucket for supporting evidence (photos, scanned documents, reports).
-- Private on purpose: the app hands out short-lived signed URLs instead of
-- exposing permanent public links to operational records.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  20971520, -- 20 MB per file
  array[
    'image/jpeg','image/png','image/webp','image/heic','image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No RLS policies are created for storage.objects on this bucket. The app
-- reaches Storage only from the server with the service role, exactly as it
-- reaches Postgres only through Prisma.
