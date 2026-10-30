CREATE TABLE public.geocode_cache (
    postal_code character varying(8) NOT NULL,
    address_key character varying(200) NOT NULL,
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    PRIMARY KEY (postal_code, address_key),
    CONSTRAINT geocode_cache_postal_code_check CHECK (postal_code ~ '^[0-9]{8}$'),
    CONSTRAINT geocode_cache_latitude_check CHECK (latitude >= -90 AND latitude <= 90),
    CONSTRAINT geocode_cache_longitude_check CHECK (longitude >= -180 AND longitude <= 180)
);
