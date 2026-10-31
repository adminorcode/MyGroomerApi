ALTER TABLE public.providers DROP CONSTRAINT providers_travel_gap_minutes_check;

ALTER TABLE public.providers
    ADD CONSTRAINT providers_travel_gap_minutes_check
        CHECK (
            travel_gap_minutes IS NULL
            OR (travel_gap_minutes BETWEEN 15 AND 120 AND travel_gap_minutes % 15 = 0)
        );
