-- This fresh local environment stored legacy timestamps as UTC without a zone.
-- Preserve those instants and accept future ISO timestamps with explicit offsets.
DO $$
DECLARE column_record record;
BEGIN
    FOR column_record IN
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'
    LOOP
        EXECUTE format(
            'ALTER TABLE public.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
            column_record.table_name, column_record.column_name, column_record.column_name
        );
    END LOOP;
END $$;
