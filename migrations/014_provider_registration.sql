CREATE TABLE public.provider_registrations (
    provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
    name varchar(160) NOT NULL DEFAULT '',
    email varchar(254) NOT NULL DEFAULT '',
    phone_number varchar(30) NOT NULL DEFAULT '',
    document varchar(18) NOT NULL DEFAULT '',
    experience varchar(500) NOT NULL DEFAULT '',
    certifications varchar(500) NOT NULL DEFAULT '',
    professional_type_ids uuid[] NOT NULL DEFAULT '{}',
    status varchar(12) NOT NULL CHECK (status IN ('draft', 'completed')),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.provider_registration_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES public.provider_registrations(provider_id) ON DELETE CASCADE,
    name varchar(200) NOT NULL,
    mime_type varchar(30) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    size integer NOT NULL CHECK (size > 0 AND size <= 10485760),
    content bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (octet_length(content) = size)
);
CREATE INDEX provider_registration_attachments_owner_idx ON public.provider_registration_attachments(provider_id);
