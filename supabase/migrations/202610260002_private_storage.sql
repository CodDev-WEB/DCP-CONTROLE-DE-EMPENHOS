-- Bucket privado para comprovantes e documentos dos pagamentos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dcp-payment-attachments',
  'dcp-payment-attachments',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Primeira versão: apenas usuários autenticados podem acessar o bucket privado.
-- Refinar as permissões por perfil e órgão antes de abrir o sistema a equipes maiores.
create policy "authenticated users can view DCP attachments"
on storage.objects for select to authenticated
using (bucket_id = 'dcp-payment-attachments');

create policy "authenticated users can upload DCP attachments"
on storage.objects for insert to authenticated
with check (bucket_id = 'dcp-payment-attachments');

create policy "authenticated users can update DCP attachments"
on storage.objects for update to authenticated
using (bucket_id = 'dcp-payment-attachments')
with check (bucket_id = 'dcp-payment-attachments');

create policy "authenticated users can delete DCP attachments"
on storage.objects for delete to authenticated
using (bucket_id = 'dcp-payment-attachments');
