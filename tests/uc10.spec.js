import {test,expect} from '@playwright/test';
test('TC10_001 หน้าเข้าสู่ระบบมี Google Login',async({page})=>{
 await page.goto('/login',{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('login-google')).toBeVisible();
});
// การ Login Google สำเร็จทดสอบใน auth.setup.js ด้วยบัญชีจริงและเก็บ session
