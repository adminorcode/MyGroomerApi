import { hash } from 'bcrypt'
import { assertLocalTestDatabase } from '../config/runtime.config'
import { withDatabaseTransaction } from './database'

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const seed = async () => {
    assertLocalTestDatabase()
    const password = await hash('LocalTest#2026', 10)
    await withDatabaseTransaction(async client => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('mygroomer:local-seed'))")
        for (const [number, name, email, role] of [
            [1, 'Tutor de Teste', 'tutor@mygroomer.test', 'customer'],
            [2, 'Groomer de Teste', 'groomer@mygroomer.test', 'provider']
        ] as const) {
            await client.query(`INSERT INTO users(id,name,email,password,role,email_verified_at,address,phone_number)
                VALUES ($1,$2,$3,$4,$5,NOW(),'Endereco ficticio - teste local','+5511999999999')
                ON CONFLICT DO NOTHING`, [id(number), name, email, password, role])
        }
        await client.query(`INSERT INTO providers(id,user_id,is_verified,payout_method,momo_number,momo_provider,
            total_jobs_completed,service_area) VALUES ($1,$2,true,'mobile_money','000000000','mtn',3,'Demonstracao local')
            ON CONFLICT DO NOTHING`, [id(3), id(2)])
        await client.query(`UPDATE providers SET
            base_address = COALESCE(base_address, 'Avenida Paulista, São Paulo'),
            base_latitude = COALESCE(base_latitude, -23.561414),
            base_longitude = COALESCE(base_longitude, -46.655881),
            radius_km = COALESCE(radius_km, 8)
            WHERE id = $1`, [id(3)])
        await client.query(`INSERT INTO professional_types(id, name, is_active)
            VALUES ($1, 'Groomer', true)
            ON CONFLICT (id) DO NOTHING`, [id(50)])
        await client.query(`INSERT INTO provider_professional_types(provider_id, professional_type_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING`, [id(3), id(50)])
        await client.query(`INSERT INTO categories(id,name,description) VALUES
            ($1,'Banho e Tosa','Servicos demonstrativos para explorar o aplicativo') ON CONFLICT DO NOTHING`, [id(4)])
        const services = [[5,'Banho','Banho demonstrativo',80],[6,'Tosa','Tosa demonstrativa',100],[7,'Banho e tosa','Atendimento demonstrativo completo',150]] as const
        for (const [number,name,description,price] of services) {
            await client.query('INSERT INTO services(id,name,description,category_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id(number),name,description,id(4)])
            await client.query('INSERT INTO provider_services(id,provider_id,service_id,price) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id(number+5),id(3),id(number),price])
        }
        for (const [number,status,days] of [[20,'pending_confirmation',1],[21,'confirmed',2],[22,'in_progress',0],[23,'completed',-2],[24,'cancelled',-1]] as const) {
            await client.query(`INSERT INTO bookings(id,customer_id,provider_service_id,scheduled_at,booking_status,customer_location,completed_at)
                VALUES ($1,$2,$3,NOW()+$5*INTERVAL '1 day',$4::public.booking_status_type,'Endereco ficticio para teste',CASE WHEN $4::public.booking_status_type='completed' THEN NOW()-INTERVAL '2 days' ELSE NULL END)
                ON CONFLICT DO NOTHING`,[id(number),id(1),id(10),status,days])
        }
        await client.query(`INSERT INTO conversations(id,booking_id,customer_id,provider_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [id(30),id(21),id(1),id(2)])
        for (const [number,sender,content] of [[31,2,'Ola! Esta conversa usa dados de demonstracao.'],[32,1,'Perfeito, estou testando o aplicativo.']] as const) {
            await client.query(`INSERT INTO messages(id,conversation_id,sender_id,content,is_seen) VALUES ($1,$2,$3,$4,false) ON CONFLICT DO NOTHING`, [id(number),id(30),id(sender),content])
        }
        await client.query(`INSERT INTO reviews(id,customer_id,provider_user_id,booking_id,rating,comment)
            VALUES ($1,$2,$3,$4,5,'Avaliacao ficticia para demonstracao local.') ON CONFLICT DO NOTHING`, [id(40),id(1),id(2),id(23)])
        await client.query(`INSERT INTO transactions(id,booking_id,customer_user_id,provider_user_id,amount,transaction_type,transaction_status)
            VALUES ($1,$2,$3,$4,72,'payout','completed') ON CONFLICT DO NOTHING`, [id(41),id(23),id(1),id(2)])
        console.log('Local demonstration data ready; existing records preserved. No payment was created or sent.')
    })
}

seed().catch(error => { console.error(`Local seed failed: ${error.message}`); process.exitCode = 1 })
