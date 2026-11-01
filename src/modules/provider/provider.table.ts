import { sql } from 'drizzle-orm'
import {
    boolean,
    check,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    primaryKey,
    smallint,
    text,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core'
import { bytea, timestamptz } from '../../shared/db/columns'

export const payoutMethod = pgEnum('payout_method_type', ['mobile_money', 'bank'])
export const momoProvider = pgEnum('momo_provider_type', ['mtn', 'telecel', 'airtel_tigo'])

export const providers = pgTable('providers', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id'),
    is_verified: boolean('is_verified').default(false),
    payout_method: payoutMethod('payout_method'),
    momo_number: varchar('momo_number'),
    momo_provider: momoProvider('momo_provider'),
    bank_account_number: varchar('bank_account_number'),
    bank_account_name: varchar('bank_account_name'),
    bank_code: varchar('bank_code'),
    total_jobs_completed: integer('total_jobs_completed'),
    id_document_url: varchar('id_document_url'),
    service_area: varchar('service_area'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
    base_address: varchar('base_address', { length: 200 }),
    base_latitude: numeric('base_latitude'),
    base_longitude: numeric('base_longitude'),
    radius_km: numeric('radius_km'),
    attendance_rules: text('attendance_rules'),
    base_postal_code: varchar('base_postal_code', { length: 8 }),
    base_complement: varchar('base_complement', { length: 120 }),
    travel_fee_mode: varchar('travel_fee_mode', { length: 20 }),
    travel_fee_per_km: numeric('travel_fee_per_km', { precision: 10, scale: 2 }),
    travel_gap_minutes: smallint('travel_gap_minutes'),
    manual_fit: boolean('manual_fit').notNull().default(false),
    public_photo: bytea('public_photo'),
    public_photo_mime: text('public_photo_mime'),
    public_photo_id: uuid('public_photo_id'),
}, (table) => [
    uniqueIndex('providers_user_unique_idx').on(table.user_id),
    check('providers_base_latitude_check', sql`${table.base_latitude} IS NULL OR (${table.base_latitude} >= -90 AND ${table.base_latitude} <= 90)`),
    check('providers_base_longitude_check', sql`${table.base_longitude} IS NULL OR (${table.base_longitude} >= -180 AND ${table.base_longitude} <= 180)`),
    check('providers_radius_km_check', sql`${table.radius_km} IS NULL OR ${table.radius_km} IN (3, 5, 8, 10)`),
    check('providers_attendance_rules_length', sql`${table.attendance_rules} IS NULL OR char_length(${table.attendance_rules}) <= 1000`),
    check('providers_base_postal_code_check', sql`${table.base_postal_code} IS NULL OR ${table.base_postal_code} ~ '^[0-9]{8}$'`),
    check('providers_travel_fee_mode_check', sql`${table.travel_fee_mode} IS NULL OR ${table.travel_fee_mode} IN ('included', 'on_request', 'per_km')`),
    check('providers_travel_fee_per_km_check', sql`(${table.travel_fee_mode} = 'per_km' AND ${table.travel_fee_per_km} IS NOT NULL AND ${table.travel_fee_per_km} > 0) OR (${table.travel_fee_mode} IS DISTINCT FROM 'per_km' AND ${table.travel_fee_per_km} IS NULL)`),
    check('providers_travel_gap_minutes_check', sql`${table.travel_gap_minutes} IS NULL OR (${table.travel_gap_minutes} BETWEEN 15 AND 120 AND ${table.travel_gap_minutes} % 15 = 0)`),
    check('providers_public_photo_pair', sql`(${table.public_photo} IS NULL AND ${table.public_photo_mime} IS NULL AND ${table.public_photo_id} IS NULL) OR (${table.public_photo} IS NOT NULL AND ${table.public_photo_mime} IN ('image/jpeg', 'image/png') AND ${table.public_photo_id} IS NOT NULL)`),
    check('providers_public_photo_size', sql`${table.public_photo} IS NULL OR (octet_length(${table.public_photo}) > 0 AND octet_length(${table.public_photo}) <= 10485760)`),
])

export const providerServices = pgTable('provider_services', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider_id: uuid('provider_id'),
    service_id: uuid('service_id'),
    price: numeric('price'),
    created_at: timestamptz('created_at').defaultNow(),
    updated_at: timestamptz('updated_at').defaultNow(),
    professional_type_id: uuid('professional_type_id'),
    description: text('description'),
    is_active: boolean('is_active').notNull().default(true),
    custom_name: varchar('custom_name', { length: 80 }),
    category_id: uuid('category_id'),
    price_small: numeric('price_small'),
    price_medium: numeric('price_medium'),
    price_large: numeric('price_large'),
    duration_small_minutes: integer('duration_small_minutes'),
    duration_medium_minutes: integer('duration_medium_minutes'),
    duration_large_minutes: integer('duration_large_minutes'),
}, (table) => [
    uniqueIndex('provider_services_provider_id_service_id_key').on(table.provider_id, table.service_id),
    uniqueIndex('provider_services_custom_name_idx').on(table.provider_id, sql`lower(btrim(${table.custom_name}))`).where(sql`${table.custom_name} IS NOT NULL`),
    check('provider_services_custom_name_not_blank', sql`${table.custom_name} IS NULL OR btrim(${table.custom_name}) <> ''`),
    check('provider_services_price_small_check', sql`${table.price_small} IS NULL OR ${table.price_small} > 0`),
    check('provider_services_price_medium_check', sql`${table.price_medium} IS NULL OR ${table.price_medium} > 0`),
    check('provider_services_price_large_check', sql`${table.price_large} IS NULL OR ${table.price_large} > 0`),
    check('provider_services_duration_small_check', sql`${table.duration_small_minutes} IS NULL OR (${table.duration_small_minutes} >= 1 AND ${table.duration_small_minutes} <= 600)`),
    check('provider_services_duration_medium_check', sql`${table.duration_medium_minutes} IS NULL OR (${table.duration_medium_minutes} >= 1 AND ${table.duration_medium_minutes} <= 600)`),
    check('provider_services_duration_large_check', sql`${table.duration_large_minutes} IS NULL OR (${table.duration_large_minutes} >= 1 AND ${table.duration_large_minutes} <= 600)`),
])

export const providerRegistrations = pgTable('provider_registrations', {
    provider_id: uuid('provider_id').primaryKey(),
    name: varchar('name', { length: 160 }).notNull().default(''),
    email: varchar('email', { length: 254 }).notNull().default(''),
    phone_number: varchar('phone_number', { length: 30 }).notNull().default(''),
    document: varchar('document', { length: 18 }).notNull().default(''),
    experience: varchar('experience', { length: 500 }).notNull().default(''),
    certifications: varchar('certifications', { length: 500 }).notNull().default(''),
    professional_type_ids: uuid('professional_type_ids').array().notNull().default(sql`'{}'::uuid[]`),
    status: varchar('status', { length: 12 }).notNull(),
    updated_at: timestamptz('updated_at').defaultNow().notNull(),
}, (table) => [
    check('provider_registrations_status_check', sql`${table.status} IN ('draft', 'completed')`),
])

export const providerRegistrationAttachments = pgTable('provider_registration_attachments', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider_id: uuid('provider_id').notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    mime_type: varchar('mime_type', { length: 30 }).notNull(),
    size: integer('size').notNull(),
    content: bytea('content').notNull(),
    created_at: timestamptz('created_at').defaultNow().notNull(),
}, (table) => [
    index('provider_registration_attachments_owner_idx').on(table.provider_id),
    check('provider_registration_attachments_mime_check', sql`${table.mime_type} IN ('image/jpeg', 'image/png', 'application/pdf')`),
    check('provider_registration_attachments_size_check', sql`${table.size} > 0 AND ${table.size} <= 10485760`),
    check('provider_registration_attachments_content_check', sql`octet_length(${table.content}) = ${table.size}`),
])

export const providerGalleryPhotos = pgTable('provider_gallery_photos', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider_id: uuid('provider_id').notNull(),
    mime_type: text('mime_type').notNull(),
    size: integer('size').notNull(),
    content: bytea('content').notNull(),
    created_at: timestamptz('created_at').defaultNow().notNull(),
}, (table) => [
    index('provider_gallery_photos_owner_idx').on(table.provider_id, table.created_at, table.id),
    check('provider_gallery_photos_mime_check', sql`${table.mime_type} IN ('image/jpeg', 'image/png')`),
    check('provider_gallery_photos_size_check', sql`${table.size} > 0 AND ${table.size} <= 10485760`),
    check('provider_gallery_photos_content_check', sql`octet_length(${table.content}) = ${table.size}`),
])

export const providerWeekdays = pgTable('provider_weekdays', {
    provider_id: uuid('provider_id').notNull(),
    weekday: smallint('weekday').notNull(),
    start_minute: smallint('start_minute').notNull(),
    end_minute: smallint('end_minute').notNull(),
    break_start_minute: smallint('break_start_minute'),
    break_end_minute: smallint('break_end_minute'),
}, (table) => [
    primaryKey({ columns: [table.provider_id, table.weekday] }),
    check('provider_weekdays_weekday_check', sql`${table.weekday} BETWEEN 0 AND 6`),
    check('provider_weekdays_start_check', sql`${table.start_minute} BETWEEN 0 AND 1439`),
    check('provider_weekdays_end_check', sql`${table.end_minute} BETWEEN 1 AND 1440`),
    check('provider_weekdays_order_check', sql`${table.end_minute} > ${table.start_minute}`),
    check('provider_weekdays_break_check', sql`(${table.break_start_minute} IS NULL AND ${table.break_end_minute} IS NULL) OR (${table.break_start_minute} IS NOT NULL AND ${table.break_end_minute} IS NOT NULL AND ${table.break_end_minute} > ${table.break_start_minute} AND ${table.break_start_minute} >= ${table.start_minute} AND ${table.break_end_minute} <= ${table.end_minute})`),
])

export const providerManualAppointments = pgTable('provider_manual_appointments', {
    id: uuid('id').primaryKey(),
    provider_id: uuid('provider_id').notNull(),
    starts_at: timestamptz('starts_at').notNull(),
    ends_at: timestamptz('ends_at').notNull(),
}, (table) => [
    index('provider_manual_appointments_provider_starts_idx').on(table.provider_id, table.starts_at),
    check('provider_manual_appointments_order_check', sql`${table.ends_at} > ${table.starts_at}`),
])

export const providerAgendaBlocks = pgTable('provider_agenda_blocks', {
    id: uuid('id').primaryKey().defaultRandom(),
    provider_id: uuid('provider_id').notNull(),
    starts_at: timestamptz('starts_at').notNull(),
    ends_at: timestamptz('ends_at').notNull(),
    created_at: timestamptz('created_at').defaultNow().notNull(),
}, (table) => [
    index('provider_agenda_blocks_schedule_idx').on(table.provider_id, table.starts_at),
    check('provider_agenda_blocks_order_check', sql`${table.ends_at} > ${table.starts_at}`),
])

export const geocodeCache = pgTable('geocode_cache', {
    postal_code: varchar('postal_code', { length: 8 }).notNull(),
    address_key: varchar('address_key', { length: 200 }).notNull(),
    latitude: numeric('latitude').notNull(),
    longitude: numeric('longitude').notNull(),
}, (table) => [
    primaryKey({ columns: [table.postal_code, table.address_key] }),
    check('geocode_cache_postal_code_check', sql`${table.postal_code} ~ '^[0-9]{8}$'`),
    check('geocode_cache_latitude_check', sql`${table.latitude} >= -90 AND ${table.latitude} <= 90`),
    check('geocode_cache_longitude_check', sql`${table.longitude} >= -180 AND ${table.longitude} <= 180`),
])
