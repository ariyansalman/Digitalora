import type { Api } from 'grammy';
import { formatPriceWithCurrency } from '../../config/currencies.js';
import { listActiveApiPriceAlertRecipients } from '../db/queries.js';
import { t as translate } from '../i18n/index.js';
import { logger } from '../logger.js';
import type { DBProduct } from '../types.js';
import { getApiPriceAlertsEnabled } from './settings.js';
import { renderMdHtml, stripCustomEmojiTags } from './premium.js';

export async function notifyApiPriceChange(
  api: Api,
  product: Pick<DBProduct, 'id' | 'name'>,
  oldPrice: number,
  newPrice: number,
): Promise<void> {
  if (!getApiPriceAlertsEnabled() || Number(oldPrice) === Number(newPrice)) return;
  const recipients = await listActiveApiPriceAlertRecipients();
  const direction = Number(newPrice) > Number(oldPrice) ? 'up' : 'down';
  let delivered = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      const text = translate(
        recipient.language,
        direction === 'up' ? 'api.price_alert.up' : 'api.price_alert.down',
        {
          product: product.name,
          price: formatPriceWithCurrency(newPrice, recipient.currency),
        },
      );
      const html = renderMdHtml(text);
      try {
        await api.sendMessage(recipient.telegram_id, html, { parse_mode: 'HTML' });
      } catch (err) {
        logger.warn(
          { err, user: recipient.telegram_id, productId: product.id },
          'API price alert HTML send failed; retrying without custom emoji tags',
        );
        await api.sendMessage(
          recipient.telegram_id,
          stripCustomEmojiTags(html),
          { parse_mode: 'HTML' },
        );
      }
      delivered++;
    } catch (err) {
      failed++;
      logger.warn(
        { err, user: recipient.telegram_id, productId: product.id },
        'API price alert send failed',
      );
    }
    if ((delivered + failed) % 25 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  logger.info(
    { productId: product.id, oldPrice, newPrice, delivered, failed },
    'API price alert finished',
  );
}
