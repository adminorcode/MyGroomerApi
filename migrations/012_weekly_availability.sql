ALTER TABLE public.providers
    ADD COLUMN travel_gap_minutes smallint,
    ADD COLUMN manual_fit boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT providers_travel_gap_minutes_check
        CHECK (travel_gap_minutes IS NULL OR travel_gap_minutes IN (15, 30, 45));

CREATE TABLE public.provider_weekdays (
    provider_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_minute smallint NOT NULL,
    end_minute smallint NOT NULL,
    break_start_minute smallint,
    break_end_minute smallint,
    CONSTRAINT provider_weekdays_pkey PRIMARY KEY (provider_id, weekday),
    CONSTRAINT provider_weekdays_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE,
    CONSTRAINT provider_weekdays_weekday_check CHECK (weekday BETWEEN 0 AND 6),
    CONSTRAINT provider_weekdays_start_check CHECK (start_minute BETWEEN 0 AND 1439),
    CONSTRAINT provider_weekdays_end_check CHECK (end_minute BETWEEN 1 AND 1440),
    CONSTRAINT provider_weekdays_order_check CHECK (end_minute > start_minute),
    CONSTRAINT provider_weekdays_break_check CHECK (
        (break_start_minute IS NULL AND break_end_minute IS NULL)
        OR (
            break_start_minute IS NOT NULL
            AND break_end_minute IS NOT NULL
            AND break_end_minute > break_start_minute
            AND break_start_minute >= start_minute
            AND break_end_minute <= end_minute
        )
    )
);

CREATE TABLE public.provider_manual_appointments (
    id uuid NOT NULL,
    provider_id uuid NOT NULL,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    CONSTRAINT provider_manual_appointments_pkey PRIMARY KEY (id),
    CONSTRAINT provider_manual_appointments_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE,
    CONSTRAINT provider_manual_appointments_order_check CHECK (ends_at > starts_at)
);

CREATE INDEX provider_manual_appointments_provider_starts_idx
    ON public.provider_manual_appointments (provider_id, starts_at);
