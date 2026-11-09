CREATE TABLE public.customer_favorite_providers (
    customer_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT customer_favorite_providers_pkey PRIMARY KEY (customer_id, provider_id),
    CONSTRAINT customer_favorite_providers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT customer_favorite_providers_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE
);

CREATE INDEX customer_favorite_providers_provider_id_idx ON public.customer_favorite_providers USING btree (provider_id);
