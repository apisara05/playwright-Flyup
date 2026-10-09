import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import { dismissCookies, API } from './helpers/investment.js';
setup('Login บัญชี Booster ที่ผ่าน KYC และผูกธนาคาร', async ({ page, context }) => {
  setup.setTimeout(420_000);
  await page.goto('/login');
  await dismissCookies(page);
  const mode = process.env.UC4_LOGIN_MODE || 'password';
  if (mode === 'password') {
    if (!process.env.UC4_EMAIL || !process.env.UC4_PASSWORD) throw new Error('กรอก UC4_EMAIL/UC4_PASSWORD ใน .env');
    await page.getByTestId('login-email').fill(process.env.UC4_EMAIL);
    await page.getByTestId('login-password').fill(process.env.UC4_PASSWORD);
    await page.getByTestId('login-submit').click();
    const googleOnly = page.getByText('บัญชีผู้ใช้นี้ลงทะเบียนด้วย Google กรุณาเข้าสู่ระบบด้วย Google', { exact: true });
    await expect.poll(async () => !new URL(page.url()).pathname.startsWith('/login')
      || await googleOnly.isVisible(), { timeout: 30_000, message: 'Login ต้องสำเร็จ หรือเว็บแจ้งว่าบัญชีใช้ Google' }).toBe(true);
    if (await googleOnly.isVisible()) await googleLogin(page);
  } else if (mode === 'google') await googleLogin(page);
  else throw new Error('UC4_LOGIN_MODE ต้องเป็น password หรือ google');
  const identity = page.waitForResponse(r => r.url() === `${API}/user/me` && r.request().method() === 'GET');
  identity.catch(() => {});
  await page.goto('/booster/dashboard');
  const response = await identity;
  expect(response.ok()).toBe(true);
  const user = (await response.json()).data;
  if (process.env.UC4_EMAIL?.trim()) expect(user.email?.toLowerCase()).toBe(process.env.UC4_EMAIL.trim().toLowerCase());
  expect(user.role?.toLowerCase(), 'UC4 ต้องใช้ Booster; บัญชี Pioneer ลงทุนไม่ได้').toBe('booster');
  expect(user.id_card_verification?.status, 'ต้องผ่าน KYC').toBe('approved');
  expect(user.phone?.trim(), 'ต้องมีเบอร์โทรศัพท์').toBeTruthy();
  expect(user.bank_accounts?.length, 'ต้องผูกบัญชีธนาคาร').toBeGreaterThan(0);
  fs.mkdirSync('playwright/.auth', { recursive: true });
  await context.storageState({ path: 'playwright/.auth/booster.json', indexedDB: true });
});


async function googleLogin(page) {
  console.log(`เลือก Google บัญชี ${process.env.UC4_EMAIL || 'Booster'} แล้วทำ Login/MFA ในเบราว์เซอร์ ภายใน 5 นาที`);
  await page.getByTestId('login-google').click();
  await page.waitForURL(url => url.origin === 'https://www.fly-up.app'
    && !/^\/login(?:\/|$)/.test(url.pathname), { timeout: 300_000 });
}
