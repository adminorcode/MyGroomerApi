ALTER TABLE public.pets
    ADD COLUMN allergies varchar(500),
    ADD COLUMN medications varchar(500),
    ADD COLUMN health_conditions varchar(500),
    ADD COLUMN vaccination_up_to_date boolean,
    ADD COLUMN behavior varchar(500),
    ADD COLUMN special_care varchar(500);

CREATE TABLE public.pet_anamnesis_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
    provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
    note varchar(1000) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pet_anamnesis_notes_not_blank CHECK (btrim(note) <> '')
);

CREATE INDEX pet_anamnesis_notes_pet_provider_idx
    ON public.pet_anamnesis_notes (pet_id, provider_id, created_at DESC);
