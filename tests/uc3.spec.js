import { test,expect } from '@playwright/test';
import { projects,cards } from './helpers/public.js';
test('TC3_001 เลือกหมวดหมู่และกลับไปทั้งหมด',async({page})=>{
 await projects(page);await expect(cards(page).first()).toBeVisible();
 const category='AgriTech / Smart Farming';
 await page.getByRole('button',{name:category,exact:true}).click();
 await expect.poll(async()=>{
  const texts=await cards(page).allTextContents();
  return texts.length>0 && texts.every(text=>text.includes(category));
 }).toBe(true);
 await page.getByRole('button',{name:'ทั้งหมด',exact:true}).click();
 await expect(cards(page).first()).toBeVisible();
});
