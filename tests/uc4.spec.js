import { test, expect } from '@playwright/test';
import {
    amountStep, openInvestment, detail, fillAmount, amountInput, confirmation,
    investmentPosts, manualPayment, projectId, money, mock
} from './uc4/helpers/investment.js';

test.describe('UC4 ลงทุนโปรเจกต์ตามเว็บไซต์จริง', () => {
    test.beforeEach(async ({ }, info) => {
        info.annotations.push({ type: 'priority', description: info.title.startsWith('TC4_007') ? 'ปกติ' : 'สูง' });
    });
    test.afterEach(async ({ page }, info) => {
        if (!page.isClosed()) await info.attach('result', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
    test('TC4_002 จำนวนเงิน 10 บาทต่ำกว่าขั้นต่ำจริง', async ({ page }, info) => {
        const posts = investmentPosts(page);
        const project = await amountStep(page);
        expect(project.minimum).toBeGreaterThan(mock.belowMinimumAmount);
        info.annotations.push({ type: 'site difference', description: `ขั้นต่ำจริง ${project.minimum} บาท ไม่ได้เป็น 500 บาททุกโปรเจกต์` });
        await fillAmount(page, mock.belowMinimumAmount);
        await page.getByRole('button', { name: 'ดำเนินการชำระเงิน', exact: true }).click();
        await expect(page.getByText(`จำนวนเงินขั้นต่ำคือ ${money(project.minimum)}`, { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'ระบุจำนวนเงินลงทุน', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'ยืนยันการลงทุน', exact: true })).toHaveCount(0);
        expect(posts).toHaveLength(0);
    });
    test('TC4_003 เป้าหมาย 100000 ลงทุน 500 ต้องแจ้งขั้นต่ำ 1000', async ({ page }) => {
        const posts = investmentPosts(page);
        const project = await amountStep(page);
        test.skip(project.funding_goal !== mock.targetFundingGoal || project.minimum !== mock.successAmount, 'ต้องใช้โปรเจกต์ goal=100000 และขั้นต่ำ=1000 ก่อนถึง soft cap');
        await fillAmount(page, mock.belowOnePercentAmount);
        await page.getByRole('button', { name: 'ดำเนินการชำระเงิน', exact: true }).click();
        await expect(page.getByText('จำนวนเงินขั้นต่ำคือ ฿1,000', { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'ยืนยันการลงทุน', exact: true })).toHaveCount(0);
        expect(posts).toHaveLength(0);
    });
    test('TC4_004 จำนวนเงินเกินเพดานถูกปรับลงให้ไม่เกินยอดที่ลงทุนได้', async ({ page }, info) => {
        const posts = investmentPosts(page);
        const project = await amountStep(page);
        info.annotations.push({ type: 'site difference', description: 'เว็บ clamp จำนวนเงินอัตโนมัติ ไม่แสดงยอดคงเหลือ 5000 ตาม UC เดิม' });
        await fillAmount(page, project.maximum + 1000);
        await expect(amountInput(page)).toHaveValue(project.maximum.toLocaleString('en-US'));
        await confirmation(page, project.maximum);
        await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
        expect(posts).toHaveLength(0);
    });
    test('TC4_005 ยอดค้างต่ำกว่า 500 และปุ่มปิดยอดตาม UC', async ({ page }, info) => {
        info.annotations.push({ type: 'unsupported', description: 'เว็บที่ตรวจไม่มี validation ยอดค้าง<500 หรือปุ่มปิดยอดที่เหลือ; ข้อมูล 500-490 เหลือ10 ไม่ใช่490' });
        test.skip(true, 'ฟังก์ชัน/ข้อความใน UC ยังไม่มีในหน้า Investment จริง ไม่ mock DOM/API เพื่อรายงาน Pass');
    });
    test('TC4_007 กลับก่อนชำระไม่ส่งรายการลงทุน', async ({ page }) => {
        const posts = investmentPosts(page);
        const project = await amountStep(page);
        await fillAmount(page, project.minimum);
        await page.getByRole('button', { name: 'กลับ', exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
        expect(posts).toHaveLength(0);
        const latest = await detail(page);
        expect(latest.current_funding).toBe(project.current_funding);
    });
    test('TC4_001 ลงทุน 1000 สร้าง QR และรอชำระจริงสำเร็จ', async ({ page }, info) => {
        test.skip(process.env.UC4_RUN_PAYMENT !== 'true' && process.env.UC4_PAYMENT_MODE !== 'stripe-test', 'เปิด UC4_RUN_PAYMENT=true เฉพาะเมื่อผู้รันพร้อมยืนยันและชำระเอง');
        test.setTimeout(600_000);
        const project = await amountStep(page);
        test.skip(project.minimum > mock.successAmount || project.maximum < mock.successAmount, 'โปรเจกต์ต้องรับยอด1000ได้');
        await manualPayment(page, project, mock.successAmount, info);
    });
    test('TC4_006 ปิดยอด 3500 และรอชำระจริงสำเร็จ', async ({ page }, info) => {
        test.skip(process.env.UC4_RUN_PAYMENT !== 'true' && process.env.UC4_PAYMENT_MODE !== 'stripe-test', 'ต้องเปิดโหมดชำระจริงและผู้รันชำระเอง');
        test.setTimeout(600_000);
        const project = await amountStep(page);
        test.skip(project.remaining !== mock.closeOutAmount || project.maximum < mock.closeOutAmount, 'ต้องมีโปรเจกต์เหลือยอด3500จริง ไม่ปลอมยอดระดมทุน');
        const latest = await manualPayment(page, project, mock.closeOutAmount, info);
        expect(latest.remaining).toBe(0);
        expect(latest.current_funding).toBe(latest.funding_goal);
        await expect(page.getByRole('button', { name: 'ลงทุนโปรเจกต์นี้', exact: true })
            .and(page.locator('button:enabled'))).toHaveCount(0);
    });
});

