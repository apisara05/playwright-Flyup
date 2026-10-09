import {test,expect} from '@playwright/test';
import {openDraft,fillBasics,fillStory,fillMilestones,openStep,mock} from './helpers/project.js';
test('UC14 กรอกข้อมูลหลักครบและบันทึก Draft',async({page},info)=>{
 test.setTimeout(600000);
 const id=await openDraft(page,{existingId:process.env.UC14_PROJECT_ID?.trim()});
 const name=`Smart Farm IoT ${Date.now()}`;
 await fillBasics(page,id,name);await fillStory(page,id);await fillMilestones(page,id);
 await openStep(page,id,1);await page.reload();
 await expect(page.getByTestId('basics-title-input')).toHaveValue(name);
 await openStep(page,id,3,1);
 await expect(page.locator('input:disabled')).toHaveValue('฿15,000');
 expect(mock.siteMilestones.reduce((s,m)=>s+m.durationDays,0)).toBe(180);
 await info.attach('draft-id',{body:Buffer.from(String(id)),contentType:'text/plain'});
 // บันทึก Draft จริง ไม่ส่งคำขอให้ Admin ในเคสนี้
});
