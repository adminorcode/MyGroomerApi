ALTER TABLE public.messages ALTER COLUMN is_seen SET DEFAULT false;
UPDATE public.messages SET is_seen = false WHERE is_seen IS NULL;
ALTER TABLE public.messages ALTER COLUMN is_seen SET NOT NULL;
ALTER TABLE public.messages ADD COLUMN is_edited boolean NOT NULL DEFAULT false;
CREATE INDEX messages_conversation_history_idx ON public.messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX bookings_customer_idx ON public.bookings (customer_id, created_at DESC);
CREATE INDEX bookings_provider_service_idx ON public.bookings (provider_service_id);
CREATE UNIQUE INDEX providers_user_unique_idx ON public.providers (user_id);
