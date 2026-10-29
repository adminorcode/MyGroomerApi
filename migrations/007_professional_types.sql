CREATE TABLE public.professional_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(80) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT professional_types_pkey PRIMARY KEY (id),
    CONSTRAINT professional_types_name_not_blank CHECK ((btrim(name) <> ''))
);

CREATE UNIQUE INDEX professional_types_name_lower_idx
    ON public.professional_types (lower(btrim(name)));

CREATE TABLE public.provider_professional_types (
    provider_id uuid NOT NULL,
    professional_type_id uuid NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT provider_professional_types_pkey PRIMARY KEY (provider_id, professional_type_id),
    CONSTRAINT provider_professional_types_provider_id_fkey
        FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE,
    CONSTRAINT provider_professional_types_type_id_fkey
        FOREIGN KEY (professional_type_id) REFERENCES public.professional_types(id) ON DELETE RESTRICT
);

CREATE INDEX provider_professional_types_type_idx
    ON public.provider_professional_types (professional_type_id);

ALTER TABLE public.provider_services
    ADD COLUMN professional_type_id uuid,
    ADD CONSTRAINT provider_services_professional_type_id_fkey
        FOREIGN KEY (professional_type_id) REFERENCES public.professional_types(id) ON DELETE RESTRICT;

CREATE INDEX provider_services_professional_type_id_idx
    ON public.provider_services (professional_type_id);
