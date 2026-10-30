ALTER TABLE public.providers
    ADD COLUMN base_postal_code character varying(8),
    ADD COLUMN base_complement character varying(120),
    ADD COLUMN travel_fee_mode character varying(20),
    ADD COLUMN travel_fee_per_km numeric(10,2),
    ADD CONSTRAINT providers_base_postal_code_check CHECK (base_postal_code IS NULL OR base_postal_code ~ '^[0-9]{8}$'),
    ADD CONSTRAINT providers_travel_fee_mode_check CHECK (travel_fee_mode IS NULL OR travel_fee_mode IN ('included', 'on_request', 'per_km')),
    ADD CONSTRAINT providers_travel_fee_per_km_check CHECK (
        (travel_fee_mode = 'per_km' AND travel_fee_per_km IS NOT NULL AND travel_fee_per_km > 0)
        OR (travel_fee_mode IS DISTINCT FROM 'per_km' AND travel_fee_per_km IS NULL)
    );
