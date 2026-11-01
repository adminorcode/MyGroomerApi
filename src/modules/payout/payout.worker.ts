import { logger } from '../../config/logger.config'
import { getChannel } from '../../config/rabbitmq.config'
import { assertPaymentsEnabled } from '../../config/runtime.config'
import { settlePayout } from './payout.service'
import { PayoutJobPayload } from './payout.types'

export const startPayoutWorker = async () => {
    assertPaymentsEnabled()
    const channel = getChannel()
    await channel.assertQueue('payout_queue', { durable: true })
    logger.info('Payout worker listening...')

    channel.consume('payout_queue', async (msg) => {
        if (!msg) return
        try {
            const payload: PayoutJobPayload = JSON.parse(msg.content.toString())
            await settlePayout(payload)
            logger.info(`Payout processed for booking ${payload.booking_id}`)
            channel.ack(msg)
        } catch (error: any) {
            logger.error('Payout worker error', { error: error?.response?.data?.message || error })
            if (error?.response?.data?.code === 'transfer_unavailable') {
                logger.warn('Transfer unavailable — account upgrade required')
                channel.ack(msg)
            } else {
                channel.nack(msg, false, false)
            }
        }
    })
}
