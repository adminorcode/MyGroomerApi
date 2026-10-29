ALTER TABLE public.providers
    ADD COLUMN base_address character varying(200),
    ADD COLUMN base_latitude numeric,
    ADD COLUMN base_longitude numeric,
    ADD COLUMN radius_km numeric,
    ADD CONSTRAINT providers_base_latitude_check CHECK (base_latitude IS NULL OR (base_latitude >= -90 AND base_latitude <= 90)),
    ADD CONSTRAINT providers_base_longitude_check CHECK (base_longitude IS NULL OR (base_longitude >= -180 AND base_longitude <= 180)),
    ADD CONSTRAINT providers_radius_km_check CHECK (radius_km IS NULL OR radius_km IN (3, 5, 8, 10));
