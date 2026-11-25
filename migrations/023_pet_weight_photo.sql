ALTER TABLE public.pets
    ADD COLUMN weight_kg numeric(6, 2),
    ADD COLUMN photo bytea,
    ADD COLUMN photo_mime varchar(32),
    ADD COLUMN photo_id uuid;

ALTER TABLE public.pets
    ADD CONSTRAINT pets_weight_kg_check CHECK (
        weight_kg IS NULL OR (weight_kg > 0 AND weight_kg <= 999.99)
    ),
    ADD CONSTRAINT pets_photo_pair CHECK (
        (photo IS NULL AND photo_mime IS NULL AND photo_id IS NULL)
        OR (photo IS NOT NULL AND photo_mime IN ('image/jpeg', 'image/png') AND photo_id IS NOT NULL)
    );
