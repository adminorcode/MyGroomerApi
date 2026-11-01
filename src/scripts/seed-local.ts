import { execute, sql } from '../shared/db/drizzle'
import { hash } from 'bcrypt'
import { users } from '../modules/auth/user.table'
import { bookings } from '../modules/booking/booking.table'
import { categories, services } from '../modules/catalog/catalog.table'
import { conversations, messages } from '../modules/conversation/conversation.table'
import { professionalTypes, providerProfessionalTypes } from '../modules/professional-type/professional-type.table'
import { providerServices, providers } from '../modules/provider/provider.table'
import { reviews } from '../modules/review/review.table'
import { transactions } from '../modules/payout/transaction.table'
import { assertLocalTestDatabase } from '../config/runtime.config'
import { withDatabaseTransaction } from './database'

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const seed = async () => {
    assertLocalTestDatabase()
    const password = await hash('admin', 10)
    await withDatabaseTransaction(async client => {
        await execute(client, sql`SELECT pg_advisory_xact_lock(hashtext('mygroomer:local-seed'))`)
        for (const [number, name, email, role] of [
            [1, 'Tutor de Teste', 'tutor@email.com', 'customer'],
            [2, 'Groomer de Teste', 'groomer@email.com', 'provider']
        ] as const) {
            await execute(client, sql`
                INSERT INTO ${users}(id,name,email,password,role,email_verified_at,address,phone_number)
                VALUES (${id(number)},${name},${email},${password},${role},NOW(),'Endereco ficticio - teste local','+5511999999999')
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    password = EXCLUDED.password,
                    role = EXCLUDED.role
            `)
        }
        await execute(client, sql`
            INSERT INTO ${providers}(id,user_id,is_verified,payout_method,momo_number,momo_provider,total_jobs_completed,service_area)
            VALUES (${id(3)},${id(2)},true,'mobile_money','000000000','mtn',3,'Demonstracao local')
            ON CONFLICT DO NOTHING
        `)
        await execute(client, sql`
            UPDATE ${providers} SET
            base_address = COALESCE(${providers.base_address}, 'Avenida Paulista, São Paulo'),
            base_latitude = COALESCE(${providers.base_latitude}, -23.561414),
            base_longitude = COALESCE(${providers.base_longitude}, -46.655881),
            radius_km = COALESCE(${providers.radius_km}, 8),
            base_postal_code = COALESCE(${providers.base_postal_code}, '01310100'),
            travel_fee_mode = COALESCE(${providers.travel_fee_mode}, 'included'),
            attendance_rules = COALESCE(NULLIF(btrim(${providers.attendance_rules}), ''), 'Atendimento em domicílio. O tutor precisa estar presente durante o serviço.')
            WHERE ${providers.id} = ${id(3)}
        `)
        await execute(client, sql`
            INSERT INTO ${professionalTypes}(id, name, is_active)
            VALUES (${id(50)}, 'Groomer', true)
            ON CONFLICT (id) DO NOTHING
        `)
        await execute(client, sql`
            INSERT INTO ${providerProfessionalTypes}(provider_id, professional_type_id)
            VALUES (${id(3)}, ${id(50)})
            ON CONFLICT DO NOTHING
        `)
        await execute(client, sql`
            INSERT INTO ${categories}(id,name,description) VALUES
            (${id(4)},'Banho e Tosa','Servicos demonstrativos para explorar o aplicativo') ON CONFLICT DO NOTHING
        `)
        const catalog = [[5,'Banho','Banho demonstrativo',80],[6,'Tosa','Tosa demonstrativa',100],[7,'Banho e tosa','Atendimento demonstrativo completo',150]] as const
        for (const [number,name,description,price] of catalog) {
            await execute(client, sql`
                INSERT INTO ${services}(id,name,description,category_id)
                VALUES (${id(number)},${name},${description},${id(4)}) ON CONFLICT DO NOTHING
            `)
            await execute(client, sql`
                INSERT INTO ${providerServices}(id,provider_id,service_id,price)
                VALUES (${id(number+5)},${id(3)},${id(number)},${price}) ON CONFLICT DO NOTHING
            `)
        }
        const sized = [
            [10, 'Banho demonstrativo', 40, 60, 90],
            [11, 'Tosa demonstrativa', 50, 70, 100],
            [12, 'Atendimento demonstrativo completo', 80, 110, 140],
        ] as const
        for (const [number, description, small, medium, large] of sized) {
            await execute(client, sql`
                UPDATE ${providerServices} SET
                description = COALESCE(NULLIF(btrim(${providerServices.description}), ''), ${description}),
                professional_type_id = COALESCE(${providerServices.professional_type_id}, ${id(50)}),
                price_small = COALESCE(${providerServices.price_small}, ${providerServices.price}),
                price_medium = COALESCE(${providerServices.price_medium}, ${providerServices.price}),
                price_large = COALESCE(${providerServices.price_large}, ${providerServices.price}),
                duration_small_minutes = COALESCE(${providerServices.duration_small_minutes}, ${small}),
                duration_medium_minutes = COALESCE(${providerServices.duration_medium_minutes}, ${medium}),
                duration_large_minutes = COALESCE(${providerServices.duration_large_minutes}, ${large})
                WHERE ${providerServices.id} = ${id(number)}
            `)
        }
        for (const [number,status,days] of [[20,'pending_confirmation',1],[21,'confirmed',2],[22,'in_progress',0],[23,'completed',-2],[24,'cancelled',-1]] as const) {
            await execute(client, sql`
                INSERT INTO ${bookings}(id,customer_id,provider_service_id,scheduled_at,booking_status,customer_location,completed_at)
                VALUES (
                    ${id(number)},${id(1)},${id(10)},NOW()+${days}*INTERVAL '1 day',${status}::public.booking_status_type,
                    'Endereco ficticio para teste',
                    CASE WHEN ${status}::public.booking_status_type='completed' THEN NOW()-INTERVAL '2 days' ELSE NULL END
                )
                ON CONFLICT DO NOTHING
            `)
        }
        await execute(client, sql`
            INSERT INTO ${conversations}(id,booking_id,customer_id,provider_id)
            VALUES (${id(30)},${id(21)},${id(1)},${id(2)}) ON CONFLICT DO NOTHING
        `)
        for (const [number,sender,content] of [[31,2,'Ola! Esta conversa usa dados de demonstracao.'],[32,1,'Perfeito, estou testando o aplicativo.']] as const) {
            await execute(client, sql`
                INSERT INTO ${messages}(id,conversation_id,sender_id,content,is_seen)
                VALUES (${id(number)},${id(30)},${id(sender)},${content},false) ON CONFLICT DO NOTHING
            `)
        }
        await execute(client, sql`
            INSERT INTO ${reviews}(id,customer_id,provider_user_id,booking_id,rating,comment)
            VALUES (${id(40)},${id(1)},${id(2)},${id(23)},5,'Avaliacao ficticia para demonstracao local.')
            ON CONFLICT DO NOTHING
        `)
        await execute(client, sql`
            INSERT INTO ${transactions}(id,booking_id,customer_user_id,provider_user_id,amount,transaction_type,transaction_status)
            VALUES (${id(41)},${id(23)},${id(1)},${id(2)},72,'payout','completed') ON CONFLICT DO NOTHING
        `)
        console.log('Local demonstration data ready; existing records preserved. No payment was created or sent.')
    })
}

seed().catch(error => { console.error(`Local seed failed: ${error.message}`); process.exitCode = 1 })
