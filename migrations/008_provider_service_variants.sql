ALTER TABLE public.provider_services
    ADD COLUMN description text,
    ADD COLUMN is_active boolean DEFAULT true NOT NULL,
    ADD COLUMN custom_name character varying(80),
    ADD COLUMN category_id uuid,
    ADD COLUMN price_small numeric,
    ADD COLUMN price_medium numeric,
    ADD COLUMN price_large numeric,
    ADD COLUMN duration_small_minutes integer,
    ADD COLUMN duration_medium_minutes integer,
    ADD COLUMN duration_large_minutes integer,
    ADD CONSTRAINT provider_services_category_id_fkey
        FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT,
    ADD CONSTRAINT provider_services_custom_name_not_blank
        CHECK (custom_name IS NULL OR btrim(custom_name) <> ''),
    ADD CONSTRAINT provider_services_price_small_check
        CHECK (price_small IS NULL OR price_small > 0),
    ADD CONSTRAINT provider_services_price_medium_check
        CHECK (price_medium IS NULL OR price_medium > 0),
    ADD CONSTRAINT provider_services_price_large_check
        CHECK (price_large IS NULL OR price_large > 0),
    ADD CONSTRAINT provider_services_duration_small_check
        CHECK (duration_small_minutes IS NULL OR (duration_small_minutes >= 1 AND duration_small_minutes <= 600)),
    ADD CONSTRAINT provider_services_duration_medium_check
        CHECK (duration_medium_minutes IS NULL OR (duration_medium_minutes >= 1 AND duration_medium_minutes <= 600)),
    ADD CONSTRAINT provider_services_duration_large_check
        CHECK (duration_large_minutes IS NULL OR (duration_large_minutes >= 1 AND duration_large_minutes <= 600));

CREATE UNIQUE INDEX provider_services_custom_name_idx
    ON public.provider_services (provider_id, lower(btrim(custom_name)))
    WHERE custom_name IS NOT NULL;

UPDATE public.provider_services
SET price_small = COALESCE(price_small, price),
    price_medium = COALESCE(price_medium, price),
    price_large = COALESCE(price_large, price)
WHERE price IS NOT NULL AND price > 0;

UPDATE public.provider_services AS offer
SET description = services.description
FROM public.services
WHERE offer.service_id = services.id
  AND services.description IS NOT NULL
  AND btrim(services.description) <> ''
  AND (offer.description IS NULL OR btrim(offer.description) = '');

UPDATE public.provider_services AS offer
SET professional_type_id = only_type.professional_type_id
FROM (
    SELECT link.provider_id, MIN(link.professional_type_id::text)::uuid AS professional_type_id
    FROM public.provider_professional_types AS link
    INNER JOIN public.professional_types AS type
        ON type.id = link.professional_type_id AND type.is_active
    GROUP BY link.provider_id
    HAVING COUNT(*) = 1
) AS only_type
WHERE offer.provider_id = only_type.provider_id
  AND offer.professional_type_id IS NULL;
