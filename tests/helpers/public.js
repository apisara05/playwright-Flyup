import { expect } from '@playwright/test';
export const cards=page=>page.locator('main a[href]').filter({has:page.getByRole('heading',{level:3})});
export async function projects(page){
 await page.goto('/projects',{waitUntil:'domcontentloaded'});
 const cookies=page.getByRole('button',{name:'ปฏิเสธที่ไม่จำเป็น',exact:true});
 try { await cookies.waitFor({state:'visible',timeout:3000}); await cookies.click(); }
 catch(error){if(error.name!=='TimeoutError')throw error;}
 await expect(page.getByRole('heading',{name:'สำรวจโปรเจกต์',exact:true})).toBeVisible();
}
