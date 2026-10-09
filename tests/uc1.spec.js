import { test,expect } from '@playwright/test';
import { projects,cards } from './helpers/public.js';
test('TC1_001 เปิดรายการและรายละเอียดโปรเจกต์',async({page})=>{
 await projects(page);const card=cards(page).first();await expect(card).toBeVisible();
 const title=await card.getByRole('heading',{level:3}).innerText();
 await card.click();await expect(page).toHaveURL(/\/projects\/\d+/);
 await expect(page.getByRole('heading',{level:1,name:title,exact:true})).toBeVisible();
 for(const name of ['เรื่องราว','อัปเดต','ความคิดเห็น'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
 await page.getByRole('button',{name:/^Milestone/}).click();
 await expect(page.getByRole('button',{name:/^Milestone/})).toBeVisible();
});
