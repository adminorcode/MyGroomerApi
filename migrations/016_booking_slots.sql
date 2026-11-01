ALTER TABLE public.bookings
    ADD COLUMN duration_minutes integer,
    ADD COLUMN service_price numeric,
    ADD CONSTRAINT bookings_duration_minutes_check CHECK (duration_minutes BETWEEN 1 AND 600),
    ADD CONSTRAINT bookings_service_price_check CHECK (service_price >= 0);

CREATE INDEX bookings_offer_schedule_idx
    ON public.bookings (provider_service_id, scheduled_at)
    WHERE booking_status IS DISTINCT FROM 'cancelled';

CREATE TABLE public.provider_agenda_blocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT provider_agenda_blocks_order_check CHECK (ends_at > starts_at)
);

CREATE INDEX provider_agenda_blocks_schedule_idx
    ON public.provider_agenda_blocks (provider_id, starts_at);
