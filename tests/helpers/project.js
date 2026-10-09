import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API_ORIGIN = process.env.UC14_API_ORIGIN || 'https://api.flyupapi.dev';

export const mock = JSON.parse(fs.readFileSync(new URL('../../fixtures/project-data.json', import.meta.url), 'utf8'));

export class DraftLimitError extends Error {
  constructor(count) {
    super(`บัญชีมี Draft ${count}/5 รายการแล้ว เว็บไซต์ไม่อนุญาตให้สร้างเพิ่ม ต้องจัดการ Draft เก่าหรือทดสอบบันทึก Draft เดิมแยกต่างหาก`);
    this.name = 'DraftLimitError';
  }
}

async function readMyProjects(page) {
  const loaded = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === API_ORIGIN && url.pathname === '/api/v1/pioneer/projects'
      && response.request().method() === 'GET';
  }, { timeout: 30_000 });
  loaded.catch(() => {});
  await page.goto('/pioneer/dashboard/projects', { waitUntil: 'domcontentloaded' });
  const response = await loaded;
  expect(response.ok(), 'ต้องอ่านรายการโปรเจกต์ของบัญชีได้ก่อนทดสอบ').toBe(true);
  const body = await response.json();
  if (!Array.isArray(body?.data)) throw new Error('API รายการโปรเจกต์ไม่ได้คืน data เป็น array');
  await expect(page.getByRole('heading', { name: 'โปรเจกต์ของฉัน', exact: true })).toBeVisible();
  await rejectCookies(page);
  return body.data;
}

export async function rejectCookies(page) {
  const button = page.getByRole('button', { name: 'ปฏิเสธที่ไม่จำเป็น', exact: true });
  // isVisible() ไม่รอ dialog ที่แสดงหลัง hydrate จึงต้องรอแบบมีเงื่อนไข
  try {
    await button.waitFor({ state: 'visible', timeout: 5_000 });
  } catch (error) {
    if (error.name === 'TimeoutError') return; // ผู้ใช้เคยเลือก Cookie แล้ว
    throw error;
  }
  await button.click();
  await expect(button).toBeHidden();
}

// ติดตาม mutation จากหน้าเว็บจริง ไม่สมมติชื่อ endpoint และไม่ mock response
// ตรวจ response ร่วมกับการ reload/assert ค่าแต่ละขั้นตอนด้านล่าง
export async function saveChange(page, action) {
  const origin = new URL(page.url()).origin;
  const saved = page.waitForResponse(response => {
    const request = response.request();
    const url = new URL(response.url());
    return [origin, API_ORIGIN].includes(url.origin)
      && /\/(?:projects|milestones|faqs?)(?:\/|$)/.test(url.pathname)
      && ['POST', 'PUT', 'PATCH'].includes(request.method());
  }, { timeout: 30_000 });
  // ป้องกัน unhandled rejection หาก action ล้มเหลวก่อน response
  saved.catch(() => {});
  await action();
  const response = await saved;
  expect(response.ok(), `การบันทึก ${response.url()} ต้องสำเร็จ (${response.status()})`).toBe(true);
  await response.finished();
  await expect(page.getByText('กำลังบันทึก...', { exact: true })).toHaveCount(0);
}

export async function fillSaved(page, locator, value, { formattedNumber = false } = {}) {
  const text = String(value);
  const current = await locator.inputValue();
  if ((formattedNumber ? current.replace(/[^0-9]/g, '') : current) === text) return;
  await saveChange(page, async () => {
    await locator.fill(text);
    await locator.press('Tab');
  });
  if (formattedNumber) await expect.poll(async () => (await locator.inputValue()).replace(/[^0-9]/g, '')).toBe(text);
  else await expect(locator).toHaveValue(text);
}

export async function openDraft(page, { existingId } = {}) {
  const projects = await readMyProjects(page);
  if (existingId) {
    if (!/^\d+$/.test(existingId)) throw new Error('UC14_PROJECT_ID ต้องเป็นเลข ID ของ Draft ทดสอบ');
    const project = projects.find(item => String(item.id) === existingId);
    if (!project || project.state !== 'draft') throw new Error('ID ที่เลือกต้องเป็น Draft ของบัญชีที่ Login อยู่');
    await page.goto(`/project/overview/${existingId}`);
  } else {
    const count = projects.filter(item => item.state === 'draft').length;
    if (count >= 5) throw new DraftLimitError(count);
    await page.goto('/');
    // รอสถานะบัญชีที่โหลดจาก client ก่อนคลิก ป้องกันการคลิกก่อน handler พร้อม
    await expect(page.locator('a[href="/pioneer/dashboard"]'),
      'Home ต้องแสดงลิงก์ Pioneer หลัง Login').toBeVisible();
    await rejectCookies(page);
    const create = page.getByRole('button', { name: 'สร้างโปรเจกต์', exact: true });
    await expect(create).toBeEnabled();
    // Home เป็น flow ที่ตรวจพบว่าสร้าง Draft จริง ไม่ fallback ไป Draft เก่าเอง
    const creation = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === API_ORIGIN
        && response.request().method() === 'POST'
        && url.pathname === '/api/v1/pioneer/projects';
    }, { timeout: 30_000 });
    creation.catch(() => {});
    await create.click();
    let response;
    try {
      response = await creation;
    } catch (error) {
      throw new Error(`คลิกสร้างแล้วไม่พบ response จาก API สร้างโปรเจกต์; URL ปัจจุบัน: ${page.url()}. ตรวจ Console/Network ใน trace ว่า handler ทำงานและบัญชีมีสิทธิ์สร้าง Draft หรือไม่`, { cause: error });
    }
    if (!response.ok()) {
      const body = await response.json().catch(() => null);
      const reason = typeof body?.message === 'string' ? body.message : 'ตรวจรายละเอียดใน Network ของ trace';
      throw new Error(`API สร้างโปรเจกต์ปฏิเสธ (HTTP ${response.status()}): ${reason}`);
    }
    await expect(page).toHaveURL(/\/project\/overview\/\d+\/?(?:[?#].*)?$/, { timeout: 30_000 });
  }
  await expect(page).toHaveURL(/\/project\/overview\/\d+\/?(?:[?#].*)?$/);
  await expect(page.getByRole('heading', { name: 'ภาพรวมของโปรเจกต์', exact: true })).toBeVisible();
  return /\/project\/overview\/(\d+)/.exec(page.url())[1];
}

export async function openStep(page, id, step, phase, { allowEmptyTitle = false } = {}) {
  // loadCurrentProject ของเว็บอ่าน detail/categories แล้วอ่าน milestones ก่อนเติมค่าในฟอร์ม
  const loaded = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === API_ORIGIN && url.pathname === `/api/v1/projects/${id}/milestones`
      && response.request().method() === 'GET';
  }, { timeout: 30_000 });
  loaded.catch(() => {});
  await page.goto(`/project/overview/${id}/step/${step}${phase ? `?phase=${phase}` : ''}`, { waitUntil: 'domcontentloaded' });
  expect((await loaded).ok(), 'ต้องโหลดข้อมูล Milestone จาก server ได้ก่อนกรอกฟอร์ม').toBe(true);
  if (step === 1) {
    await expect(page.getByTestId('basics-title-input')).toBeVisible();
    if (!allowEmptyTitle) await expect(page.getByTestId('basics-title-input')).not.toHaveValue('');
  }
  if (step === 2) await expect(page.locator('.tiptap[contenteditable="true"]')).toBeVisible();
  if (step === 3) {
    await expect(page.getByRole('heading', { name: `Milestone ${phase || 1}`, exact: true })).toBeVisible();
    const percent = mock.siteMilestones[(phase || 1) - 1].percent;
    // ฟอร์ม render ก่อนข้อมูล server โหลด ต้องรอจำนวนเงินที่คำนวณจากเป้าหมายก่อนอ่าน/แก้ค่า
    await expect(page.locator('input:disabled')).toHaveValue(`฿${(mock.targetAmount * percent / 100).toLocaleString('en-US')}`);
  }
  if (step === 4) await expect(page.getByRole('heading', { name: 'สรุปข้อมูลโปรเจกต์', exact: true })).toBeVisible();
  await expect(page.getByText('กำลังบันทึก...', { exact: true })).toHaveCount(0);
}

function fixtureFile(variable, fallback) {
  const filename = path.resolve(process.env[variable] || fallback);
  if (!fs.existsSync(filename)) throw new Error(`ไม่พบไฟล์ ${variable}: ${filename}`);
  return filename;
}

export async function fillBasics(page, id, name) {
  await openStep(page, id, 1);
  for (const [testId, value, numeric] of [
    ['basics-title-input', name, false],
    ['basics-description-input', mock.shortDescription, false],
    ['basics-funding-goal-input', mock.targetAmount, true],
    ['basics-project-duration-input', mock.projectDurationMonths, true],
    ['basics-soft-cap-input', mock.softCap, true],
    ['basics-campaign-duration-input', mock.campaignDurationDays, true],
    ['basics-revenue-share-input', mock.revenueSharePercent, true],
  ]) await fillSaved(page, page.getByTestId(testId), value, { formattedNumber: numeric });

  const category = page.getByRole('button', { name: mock.categoryLabel, exact: true });
  if (!await category.isVisible()) {
    await page.getByRole('button', { name: 'เลือกหมวดหมู่', exact: true }).click();
    await saveChange(page, () => page.getByText(mock.categoryLabel, { exact: true }).click());
  }
  // Upload ครบเฉพาะช่อง required: ภาพปกและรูปประกอบ วิดีโอเป็น optional
  const cover = page.getByRole('img', { name: 'cover', exact: true });
  if (!await cover.isVisible()) {
    await saveChange(page, () => page.getByTestId('basics-cover-image-input').setInputFiles(
      fixtureFile('UC14_COVER_PATH', 'fixtures/smart-farm-cover.png')));
  }
  await expect(cover).toHaveAttribute('src', /^https:\/\//);
  const deleteImage = page.getByRole('button', { name: 'ลบรูปภาพ', exact: true });
  if (await deleteImage.count() === 0) {
    await saveChange(page, () => page.getByTestId('basics-additional-images-input').setInputFiles(
      fixtureFile('UC14_MEDIA_PATH', 'fixtures/smart-farm-media.png')));
  }
  // Server แปลงภาพเป็น .webp และเปลี่ยนชื่อ จึงตรวจรูปที่อัปโหลดเสร็จแทนชื่อไฟล์ต้นฉบับ
  await expect(deleteImage.first()).toBeVisible();
  await expect(page.getByText(/กำลังอัปโหลด/)).toHaveCount(0);
  await openStep(page, id, 1);
  await expect(page.getByTestId('basics-title-input')).toHaveValue(name);
  await expect(page.getByTestId('basics-description-input')).toHaveValue(mock.shortDescription);
  for (const [testId, value] of [
    ['basics-funding-goal-input', mock.targetAmount], ['basics-soft-cap-input', mock.softCap],
    ['basics-project-duration-input', mock.projectDurationMonths],
    ['basics-campaign-duration-input', mock.campaignDurationDays],
    ['basics-revenue-share-input', mock.revenueSharePercent],
  ]) await expect.poll(async () => (await page.getByTestId(testId).inputValue()).replace(/[^0-9]/g, '')).toBe(String(value));
  await expect(category).toBeVisible();
  await expect(page.getByRole('img', { name: 'cover', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ลบรูปภาพ', exact: true }).first()).toBeVisible();
}

export async function fillStory(page, id) {
  await openStep(page, id, 2);
  const editor = page.locator('.tiptap[contenteditable="true"]');
  if ((await editor.innerText()).trim() !== mock.story) {
    await saveChange(page, async () => { await editor.fill(mock.story); await editor.press('Tab'); });
  }
  await fillSaved(page, page.locator('textarea:not([data-testid])'), mock.risks);
  // FAQ เป็น optional แต่เติมตัวอย่างให้ครบ
  if (!await page.getByText(mock.faq.question, { exact: false }).isVisible()) {
    await page.getByTestId('faq-question-input').fill(mock.faq.question);
    await page.getByTestId('faq-answer-input').fill(mock.faq.answer);
    await saveChange(page, () => page.getByTestId('faq-add-btn').click());
    await expect(page.getByText(mock.faq.question, { exact: false })).toBeVisible();
  }
  await openStep(page, id, 2);
  await expect(editor).toHaveText(mock.story);
  await expect(page.locator('textarea:not([data-testid])')).toHaveValue(mock.risks);
  await expect(page.getByText(mock.faq.answer, { exact: false })).toBeVisible();
}

const milestoneFields = {
  name: 'input[maxlength="50"]',
  description: 'textarea[maxlength="5000"]',
  durationDays: 'input[maxlength="3"]',
  acceptance: 'input.flex-grow',
};

export async function fillMilestones(page, id) {
  expect(mock.siteMilestones.reduce((sum, ms) => sum + ms.percent, 0)).toBe(100);
  expect(mock.siteMilestones.reduce((sum, ms) => sum + ms.durationDays, 0)).toBe(mock.projectDurationMonths * 30);
  for (let index = 0; index < mock.siteMilestones.length; index++) {
    const milestone = mock.siteMilestones[index];
    const phase = index + 1;
    await openStep(page, id, 3, phase);
    await expect(page.getByText(`${milestone.percent}% ของเป้าหมาย`, { exact: true })).toBeVisible();
    await expect(page.locator('input:disabled')).toHaveValue(`฿${(mock.targetAmount * milestone.percent / 100).toLocaleString('en-US')}`);
    // หลังบันทึกแต่ละช่อง reload เพื่ออ่านค่าจริงและ ID ที่ server สร้างก่อนแก้ช่องถัดไป
    // ป้องกันการกรอกหลายช่องพร้อมกับ autosave ที่ยังไม่เสร็จ
    for (const [key, selector] of Object.entries(milestoneFields)) {
      const value = String(milestone[key]);
      await fillSaved(page, page.locator(selector).first(), value);
      await openStep(page, id, 3, phase);
      await expect(page.locator(selector).first(), `Phase ${phase}: ${key} ต้องบันทึกจริง`).toHaveValue(value);
    }
  }
  // อ่านใหม่ทุก Phase หลังกรอกครบ เพื่อจับการบันทึกทับผิด Phase
  for (let index = 0; index < mock.siteMilestones.length; index++) {
    await openStep(page, id, 3, index + 1);
    for (const [key, selector] of Object.entries(milestoneFields)) {
      await expect(page.locator(selector).first()).toHaveValue(String(mock.siteMilestones[index][key]));
    }
  }
}

export async function verifyDraft(page, name) {
  await page.goto('/pioneer/dashboard/projects');
  await expect(page.getByRole('heading', { name: 'โปรเจกต์ของฉัน', exact: true })).toBeVisible();
  await page.getByPlaceholder('ค้นหาชื่อโปรเจกต์...').fill(name);
  const heading = page.getByRole('heading', { name, exact: true });
  await expect(heading).toHaveCount(1);
  // DOM จริง: h3 และ status span อยู่ใน div เดียวกัน
  await expect(heading.locator('..').getByText('แบบร่าง', { exact: true })).toBeVisible();
}
