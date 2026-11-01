ALTER TABLE public.providers
    ADD COLUMN public_photo bytea,
    ADD COLUMN public_photo_mime text,
    ADD COLUMN public_photo_id uuid,
    ADD CONSTRAINT providers_public_photo_pair CHECK (
        (public_photo IS NULL AND public_photo_mime IS NULL AND public_photo_id IS NULL)
        OR (
            public_photo IS NOT NULL
            AND public_photo_mime IN ('image/jpeg', 'image/png')
            AND public_photo_id IS NOT NULL
        )
    ),
    ADD CONSTRAINT providers_public_photo_size CHECK (
        public_photo IS NULL OR (octet_length(public_photo) > 0 AND octet_length(public_photo) <= 10485760)
    );

CREATE TABLE public.provider_gallery_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
    size integer NOT NULL CHECK (size > 0 AND size <= 10485760),
    content bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (octet_length(content) = size)
);

CREATE INDEX provider_gallery_photos_owner_idx
    ON public.provider_gallery_photos(provider_id, created_at, id);
