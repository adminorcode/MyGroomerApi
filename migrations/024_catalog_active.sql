ALTER TABLE public.categories
    ADD COLUMN is_active boolean NOT NULL DEFAULT true,
    ADD CONSTRAINT categories_name_not_blank CHECK ((btrim(name) <> ''));

ALTER TABLE public.services
    ADD COLUMN is_active boolean NOT NULL DEFAULT true,
    ADD CONSTRAINT services_name_not_blank CHECK ((btrim(name) <> ''));

CREATE UNIQUE INDEX categories_name_lower_idx
    ON public.categories (lower(btrim(name)));

CREATE UNIQUE INDEX services_name_lower_idx
    ON public.services (lower(btrim(name)));

ALTER TABLE public.categories DROP CONSTRAINT categories_name_key;
ALTER TABLE public.services DROP CONSTRAINT services_name_key;

ALTER TABLE public.provider_services DROP CONSTRAINT provider_services_service_id_fkey;
ALTER TABLE public.provider_services
    ADD CONSTRAINT provider_services_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE RESTRICT;
