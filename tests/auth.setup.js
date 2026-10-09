import {test as setup,expect} from '@playwright/test';
import fs from 'node:fs';
setup('UC10 Google Login บัญชี Pioneer',async({page,context})=>{
 setup.setTimeout(360000);
 await page.goto('/pioneer/dashboard/projects',{waitUntil:'domcontentloaded'});
 const heading=page.getByRole('heading',{name:'โปรเจกต์ของฉัน',exact:true});
 const valid=await heading.waitFor({state:'visible',timeout:10000}).then(()=>true,()=>false);
 if(!valid){
  await page.goto('/login');
  const cookies=page.getByRole('button',{name:'ปฏิเสธที่ไม่จำเป็น',exact:true});
  if(await cookies.isVisible())await cookies.click();
  await page.getByTestId('login-google').click();
  console.log('ทำ Google Login ด้วยบัญชี Pioneer ในเบราว์เซอร์ภายใน 5 นาที');
  await page.waitForURL(u=>u.origin==='https://www.fly-up.app'&&!u.pathname.startsWith('/login'),{timeout:300000,waitUntil:'domcontentloaded'});
 }
 await page.goto('/pioneer/dashboard/projects');await expect(heading).toBeVisible();
 fs.mkdirSync('playwright/.auth',{recursive:true});
 await context.storageState({path:'playwright/.auth/pioneer.json',indexedDB:true});
});
