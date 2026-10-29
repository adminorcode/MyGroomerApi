CREATE TYPE public.pet_species AS ENUM (
    'dog',
    'cat',
    'other'
);

CREATE TYPE public.pet_size AS ENUM (
    'small',
    'medium',
    'large'
);

CREATE TABLE public.pets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    name character varying(60) NOT NULL,
    species public.pet_species NOT NULL,
    breed character varying(80) NOT NULL,
    size public.pet_size NOT NULL,
    age_years integer NOT NULL,
    notes character varying(500),
    photo_url character varying(2048),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT pets_pkey PRIMARY KEY (id),
    CONSTRAINT pets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT pets_age_years_check CHECK ((age_years >= 0) AND (age_years <= 40)),
    CONSTRAINT pets_name_not_blank CHECK ((btrim(name) <> '')),
    CONSTRAINT pets_breed_not_blank CHECK ((btrim(breed) <> ''))
);

CREATE INDEX pets_owner_id_idx ON public.pets USING btree (owner_id);

ALTER TABLE public.bookings
    ADD COLUMN pet_id uuid,
    ADD CONSTRAINT bookings_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id);
