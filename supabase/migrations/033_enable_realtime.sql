-- ============================================================
-- MIGRATION 033: Habilitar Realtime para que el panel del PC se actualice
-- solo cuando los celulares suben cobros, préstamos, gastos o cierres.
--
-- Idempotente: solo agrega las tablas que aún no están en la publicación.
-- Realtime respeta las políticas RLS del usuario conectado (cada empresa ve lo suyo).
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'La publicación supabase_realtime no existe; activa Realtime en el proyecto y vuelve a ejecutar.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['payments', 'loans', 'loan_installments', 'clients', 'expenses', 'daily_closings']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t)
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
       )
    THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
