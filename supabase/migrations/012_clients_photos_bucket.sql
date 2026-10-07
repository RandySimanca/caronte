-- Crear bucket para fotos de clientes
INSERT INTO storage.buckets (id, name, public)
VALUES ('clients_photos', 'clients_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de RLS para el bucket (Permitir lectura y subida)
DROP POLICY IF EXISTS "Permitir acceso público a leer fotos de clientes" ON storage.objects;
CREATE POLICY "Permitir acceso público a leer fotos de clientes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'clients_photos');

DROP POLICY IF EXISTS "Permitir a usuarios autenticados subir fotos de clientes" ON storage.objects;
CREATE POLICY "Permitir a usuarios autenticados subir fotos de clientes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'clients_photos' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Permitir a usuarios autenticados actualizar fotos de clientes" ON storage.objects;
CREATE POLICY "Permitir a usuarios autenticados actualizar fotos de clientes"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'clients_photos' AND auth.role() = 'authenticated');
