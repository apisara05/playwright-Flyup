import { authorizeStripeTest } from './stripe-test.js';
import { expect } from '@playwright/test';
import fs from 'node:fs';
export const mock = JSON.parse(fs.readFileSync(new URL('../../../fixtures/investment-data.json', import.meta.url), 'utf8'));
export const API = 'https://api.flyupapi.dev/api/v1';
export const projectId = process.env.UC4_PROJECT_ID || String(mock.projectId);
export const money = amount => `฿${amount.toLocaleString('en-US')}`;
export async function dismissCookies(page) {
    const button = page.getByRole('button', { name: 'ปฏิเสธที่ไม่จำเป็น', exact: true });
    const visible = await button.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, error => {
        if (error.name !== 'TimeoutError') throw error;
        return false;
    });
    if (visible) await button.click();
}
export async function detail(page, { requireFunding = true } = {}) {
    if (!/^\d+$/.test(projectId)) throw new Error('UC4_PROJECT_ID ต้องเป็นตัวเลข');
    // APIRequestContext อ่าน body ได้โดยไม่ผูกกับ document ที่อาจถูก navigate ทิ้ง
    const response = await page.request.get(`${API}/projects/${projectId}`);
    expect(response.ok(), 'ต้องอ่านรายละเอียดโปรเจกต์ได้').toBe(true);
    let project;
    try {
        project = (await response.json()).data;
        expect(project?.title, 'API ต้องคืนข้อมูลโปรเจกต์').toBeTruthy();
    } finally {
        await response.dispose();
    }
    const target = `/projects/${projectId}`;
    if (new URL(page.url()).pathname !== target) {
        await page.goto(target, { waitUntil: 'domcontentloaded' });
    }
    await expect(page.getByRole('heading', { name: project.title, exact: true })).toBeVisible();
    await dismissCookies(page);
    const remaining = Math.max(0, project.funding_goal - project.current_funding);
    const softCapReached = project.softcap > 0 && project.current_funding >= project.softcap;
    const minimum = Math.max(softCapReached ? 1 : (project.min_invest_amount || 1000), 20);
    const maximum = Math.min(999999, project.max_invest_amount > 0 ? Math.min(project.max_invest_amount, remaining) : remaining);
    if (requireFunding) {
        expect(project.state, 'โปรเจกต์ต้องกำลังระดมทุน').toBe('funding');
        expect(maximum, 'ยอดคงเหลือต้องลงทุนได้').toBeGreaterThanOrEqual(minimum);
    }
    return { ...project, remaining, minimum, maximum };
}
export async function openInvestment(page) {
    const project = await detail(page);
    // ปุ่ม actual ไม่ใช่ route ลัด จึงครอบคลุม KYC/bank guard ของหน้ารายละเอียด
    await page.getByRole('button', { name: 'ลงทุนโปรเจกต์นี้', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/invest$`));
    await expect(page.getByRole('button', { name: 'ยอมรับและดำเนินการต่อ', exact: true })).toBeVisible();
    return project;
}
export async function amountStep(page) {
    const project = await openInvestment(page);
    if (process.env.UC4_ACCEPT_TERMS !== 'false') {
        const agreement = page.getByRole('checkbox');
        await expect(agreement).toBeVisible();
        await agreement.check();
        await expect(agreement).toBeChecked();
        const continueButton = page.getByRole('button', { name: 'ยอมรับและดำเนินการต่อ', exact: true });
        await expect(continueButton).toBeEnabled();
        await continueButton.click();
    } else {
        console.log('อ่านสัญญา ติ๊กยอมรับ และกดยอมรับและดำเนินการต่อในเบราว์เซอร์ ภายใน 2 นาที');
    }
    await expect(page.getByRole('heading', { name: 'ระบุจำนวนเงินลงทุน', exact: true })).toBeVisible({ timeout: 120_000 });
    return project;
}
export const amountInput = page => page.locator('input[inputmode="numeric"]');
export async function fillAmount(page, value) {
    await amountInput(page).fill(String(value));
    await amountInput(page).press('Tab');
}
export async function confirmation(page, amount) {
    await fillAmount(page, amount);
    await expect(page.getByText('ยอดชำระรวม', { exact: true }).locator('..')).toContainText(money(amount));
    await page.getByRole('button', { name: 'ดำเนินการชำระเงิน', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'ยืนยันการลงทุน', exact: true })).toBeVisible();
}
export function investmentPosts(page) {
    const posts = [];
    page.on('request', request => {
        if (request.url() === `${API}/investments` && request.method() === 'POST') posts.push(request);
    });
    return posts;
}
export async function manualPayment(page, project, amount, info) {
    await confirmation(page, amount);
    // ผู้รันเป็นผู้กดยืนยันการลงทุนเอง; การทดสอบไม่จ่ายเงินแทนหรือปลอม webhook
    const automaticTest = process.env.UC4_PAYMENT_MODE === 'stripe-test';
    const created = page.waitForResponse(r => r.url() === `${API}/investments` && r.request().method() === 'POST', { timeout: 120_000 })
        .then(async response => {
            expect(response.ok(), 'สร้างรายการลงทุนต้องสำเร็จ').toBe(true);
            return (await response.json()).data;
        });
    created.catch(() => { });
    console.log(automaticTest
        ? `Stripe Test: ยืนยันรายการทดสอบ ${amount} บาทอัตโนมัติ`
        : `ตรวจยอด ${amount} บาท แล้วกดยืนยันการลงทุนเอง หากต้องการชำระจริง`);
    if (automaticTest) {
        // ผู้ใช้เลือกโหมดทดสอบ; การ authorize จำกัดเฉพาะ Stripe Test Page ที่ตรวจยืนยันแล้ว
        await page.getByRole('button', { name: /^(ยืนยันการลงทุน|ยืนยัน)$/ }).click();
    }
    const data = await created;
    expect(data.investment_id).toBeTruthy();
    expect(data.reference_number).toBeTruthy();
    expect(Number(data.total_amount)).toBe(amount);
    await expect(page.getByRole('img', { name: 'PromptPay QR Code', exact: true })).toBeVisible();
    await expect(page.getByText(data.reference_number, { exact: true })).toBeVisible();
    await info.attach('QR-and-reference', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    console.log(automaticTest
        ? 'Stripe Test: อ่าน QR และกด Authorize Test Payment อัตโนมัติ แล้วรอ FlyUp ยืนยัน'
        : 'ชำระ QR ผ่านแอปธนาคารเอง เทสรอระบบยืนยันภายใน 5 นาที');
    const verified = page.waitForResponse(async r => {
        if (r.url() !== `${API}/investments/${data.investment_id}` || r.request().method() !== 'GET' || !r.ok()) return false;
        const body = await r.json();
        return (body.data?.investment?.status || body.data?.status) === 'verified';
    }, { timeout: 300_000 });
    verified.catch(() => { });
    if (automaticTest) await authorizeStripeTest(page, amount, info);
    await verified;
    await expect(page.getByRole('heading', { name: 'การลงทุนสำเร็จ!', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ดาวน์โหลดสัญญา (PDF)', exact: true })).toBeEnabled();
    await expect(page.getByText('ยอดลงทุน', { exact: true }).locator('..')).toContainText(money(amount));
    // เว็บส่งสัญญา HTML ไปหน้าต่าง print ไม่ใช่ PDF download event
    // ปุ่มบน UI ยืนยันว่ามีสัญญาให้เปิด ส่วน print-to-PDF ผู้รันทำเอง
    await page.getByRole('button', { name: 'กลับสู่หน้าโปรเจกต์', exact: true }).click();
    const expectedFunding = Number(project.current_funding) + amount;
    let observedFunding;
    await expect.poll(async () => {
        const response = await page.request.get(`${API}/projects/${projectId}`, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        try {
            expect(response.ok(), 'อ่านยอดหลังชำระต้องสำเร็จ').toBe(true);
            const body = await response.json();
            observedFunding = Number(body.data?.current_funding);
            return observedFunding;
        } finally { await response.dispose(); }
    }, {
        timeout: 60_000,
        intervals: [1000, 2000, 5000],
        message: `รายการ ${data.reference_number} verified แล้ว แต่ยอดโปรเจกต์ยังไม่อัปเดต: ก่อนชำระ ${project.current_funding}, ชำระ ${amount}, คาดหวังอย่างน้อย ${expectedFunding}`
    }).toBeGreaterThanOrEqual(expectedFunding);
    await info.attach('funding-after-payment', {
        body: Buffer.from(JSON.stringify({
            before: project.current_funding, amount,
            expected: expectedFunding, actual: observedFunding, investmentId: data.investment_id
        })),
        contentType: 'application/json'
    });
    const latest = await detail(page, { requireFunding: false });
    return latest;
}


