CREATE UNIQUE INDEX bookings_open_request_idx
    ON public.bookings (customer_id, pet_id, provider_service_id, scheduled_at)
    WHERE booking_status IS DISTINCT FROM 'cancelled';
