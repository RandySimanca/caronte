DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'route_order'
  ) THEN
    ALTER TABLE clients ADD COLUMN route_order integer NOT NULL DEFAULT 0;
  END IF;
END $$;
