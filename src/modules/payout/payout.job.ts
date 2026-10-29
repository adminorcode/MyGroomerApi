import cron from 'node-cron'
import { logger } from '../../config/logger.config'
import { assertPaymentsEnabled } from '../../config/runtime.config'
import { fetchEligiblePayouts } from './payout.repo'
import { publishPayoutJob } from './payout.queue'

export const startPayoutCronJob = () => {
    assertPaymentsEnabled()
    cron.schedule('0 * * * *', async () => {
        logger.info('Running payout cron job...')
        try {
            const eligibleBookings = await fetchEligiblePayouts()
            logger.info(`Found ${eligibleBookings.length} eligible payouts`)

            for (const booking of eligibleBookings) {
                await publishPayoutJob({
                    booking_id: booking.id,
                    provider_user_id: booking.provider_user_id,
                    amount: booking.payment_amount,
                    payment_id: booking.payment_id,
                    customer_id: booking.customer_id,
                })
            }
        } catch (error) {
            logger.error('Payout cron job error', { error })
            throw error
        }
    })
    logger.info('Payout cron job scheduled')
}
