ALTER TABLE public.providers
    ADD COLUMN attendance_rules text,
    ADD CONSTRAINT providers_attendance_rules_length
        CHECK (attendance_rules IS NULL OR char_length(attendance_rules) <= 1000);
