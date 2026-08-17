import type http from 'node:http';
import type { Api } from 'grammy';
import { findDepositByTxHash } from '../db/queries.js';
import { logger } from '../logger.js';
import { verifyCryptoPaySignature, type CryptoPayInvoice } from './cryptoPay.js';
import { processCryptoPayPaidInvoice } from './cryptoPayDeposit.js';
import { allowHttpRequest, applySecurityHeaders, rejectRateLimit } from './httpSecurity.js';

const BODY_LIMIT_BYTES = 256 * 1024;

async function readRawBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BODY_LIMIT_BYTES) throw new Error('webhook body too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export async function handleCryptoPayWebhook(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  api: Api,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname !== '/cryptobot/webhook') return false;
  if (!allowHttpRequest(req, 'cryptobot-webhook', 60)) {
    rejectRateLimit(res);
    return true;
  }
  if (req.method !== 'POST') {
    applySecurityHeaders(res);
    res.writeHead(405, { allow: 'POST' });
    res.end();
    return true;
  }
  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch {
    applySecurityHeaders(res);
    res.writeHead(413);
    res.end();
    return true;
  }
  const signature = Array.isArray(req.headers['crypto-pay-api-signature'])
    ? req.headers['crypto-pay-api-signature'][0]
    : req.headers['crypto-pay-api-signature'];
  if (!verifyCryptoPaySignature(raw, signature)) {
    applySecurityHeaders(res);
    res.writeHead(401);
    res.end();
    return true;
  }
  let update: { update_type?: string; payload?: CryptoPayInvoice };
  try {
    update = JSON.parse(raw.toString('utf8')) as typeof update;
  } catch {
    applySecurityHeaders(res);
    res.writeHead(400);
    res.end();
    return true;
  }
  applySecurityHeaders(res);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true }));
  if (update.update_type !== 'invoice_paid' || !update.payload) return true;

  const invoice = update.payload;
  const invoiceId = String(invoice.invoice_id);
  void (async () => {
    const dep = await getDepositByInvoiceId(invoiceId);
    if (dep) await processCryptoPayPaidInvoice(api, dep.id, invoice);
  })().catch((err) => logger.warn({ err, invoiceId }, 'Crypto Pay webhook processing failed'));
  return true;
}

async function getDepositByInvoiceId(invoiceId: string) {
  return findDepositByTxHash(`cryptopay:${invoiceId}`);
}
