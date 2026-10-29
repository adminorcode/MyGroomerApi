import { logger } from '../../config/logger.config'
import { getChannel } from '../../config/rabbitmq.config'
import { PayoutJobPayload } from './payout.types'

export const publishPayoutJob = async (payload: PayoutJobPayload) => {
    const channel = getChannel()
    await channel.assertQueue('payout_queue', { durable: true })
    channel.sendToQueue(
        'payout_queue',
        Buffer.from(JSON.stringify(payload)),
        { persistent: true },
    )
    logger.info('Payout job published', { booking_id: payload.booking_id })
}
