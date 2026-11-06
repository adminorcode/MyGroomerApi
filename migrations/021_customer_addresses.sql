CREATE TABLE public.customer_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    label character varying(16) NOT NULL,
    address character varying(200) NOT NULL,
    complement character varying(120),
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT customer_addresses_pkey PRIMARY KEY (id),
    CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT customer_addresses_label_check CHECK (label IN ('home', 'work', 'other')),
    CONSTRAINT customer_addresses_address_not_blank CHECK (btrim(address) <> ''),
    CONSTRAINT customer_addresses_latitude_check CHECK (latitude >= -34 AND latitude <= 6),
    CONSTRAINT customer_addresses_longitude_check CHECK (longitude >= -74 AND longitude <= -34)
);

CREATE INDEX customer_addresses_customer_id_idx ON public.customer_addresses USING btree (customer_id);

CREATE UNIQUE INDEX customer_addresses_one_default_idx
    ON public.customer_addresses (customer_id)
    WHERE is_default;
