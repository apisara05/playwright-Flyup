import { test,expect } from '@playwright/test';
import { projects,cards } from './helpers/public.js';
test('TC2_001 ค้นหาชื่อโปรเจกต์ที่มีในรายการ',async({page})=>{
 await projects(page);await expect(cards(page).first()).toBeVisible();
 const title=await cards(page).first().getByRole('heading',{level:3}).innerText();
 await page.getByPlaceholder('ค้นหาชื่อโปรเจกต์...').fill(title);
 await expect(page.getByRole('heading',{level:3,name:title,exact:true})).toBeVisible();
 await expect.poll(()=>cards(page).allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining(title)]));
});
test('TC2_002 ค้นหาคำที่ไม่มีและล้างตัวกรอง',async({page})=>{
 await projects(page);await page.getByPlaceholder('ค้นหาชื่อโปรเจกต์...').fill(`NO_MATCH_${Date.now()}`);
 await expect(page.getByRole('heading',{name:'ไม่พบโปรเจกต์',exact:true})).toBeVisible();
 await expect(cards(page)).toHaveCount(0);
 await page.getByRole('button',{name:'ล้างตัวกรอง',exact:true}).click();
 await expect(page.getByPlaceholder('ค้นหาชื่อโปรเจกต์...')).toHaveValue('');
 await expect(cards(page).first()).toBeVisible();
});
