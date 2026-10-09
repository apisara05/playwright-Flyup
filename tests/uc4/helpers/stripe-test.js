  import { expect } from '@playwright/test';
  import { PNG } from 'pngjs';
  import jsQR from 'jsqr';

  export async function authorizeStripeTest(page, amount, info) {
    const qr = page.getByRole('img', { name: 'PromptPay QR Code', exact: true });
    await expect(qr).toBeVisible();
    const bytes = await qr.screenshot({ type: 'png' });
    const png = PNG.sync.read(bytes);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height,
      { inversionAttempts: 'attemptBoth' });
    if (!decoded) throw new Error('อ่าน QR ไม่สำเร็จ ต้องเป็น QR ของรายการทดสอบรอบปัจจุบัน');
    let url;
    try { url = new URL(decoded.data); }
    catch { throw new Error('QR ไม่ใช่ลิงก์ Stripe Test จึงไม่ชำระอัตโนมัติ'); }
    if (url.protocol !== 'https:' || url.hostname !== 'payments.stripe.com')
      throw new Error('QR ไม่ใช่ HTTPS payments.stripe.com จึงไม่ชำระอัตโนมัติ');
    const stripe = await page.context().newPage();
    try {
      await stripe.goto(url.href, { waitUntil: 'domcontentloaded' });
      expect(new URL(stripe.url()).hostname).toBe('payments.stripe.com');
      await expect(stripe.getByRole('heading', { name: 'PromptPay test payment page', exact: true })).toBeVisible();
      await expect(stripe.getByText(/This is a test payment/)).toContainText(
        amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      await info.attach('stripe-test-before-authorize', {
        body: await stripe.screenshot({ fullPage: true }), contentType: 'image/png'
      });
      const authorize = stripe.locator('#authorize-payment-btn');
      await expect(authorize).toBeVisible();
      await expect(authorize).toBeEnabled();
      await authorize.click();
      await info.attach('stripe-test-after-authorize', {
        body: await stripe.screenshot({ fullPage: true }), contentType: 'image/png'
      });
    } finally { await stripe.close(); }
  }
