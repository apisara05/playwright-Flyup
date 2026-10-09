# v1.0.0 — FlyUp Playwright testing starter

ชุดทดสอบ JavaScript สำหรับ 6 Use Case พร้อม 13 เคสหลักและ 2 auth setup มี README ภาษาไทยและ mockup สำหรับบันทึก Draft

## Highlights
- แยกคำสั่ง UC4/UC14 และ UI Mode
- Stripe PromptPay Test อัตโนมัติ ตรวจหน้าทดสอบก่อน authorize
- ภาพ วิดีโอ Trace และ HTML Report
- Source checks บน GitHub Actions

## เริ่มใช้
ดาวน์โหลด Source code หรือ clone repository รัน npm install และ npx playwright install chromium จากนั้นคัดลอก .env.example เป็น .env และตั้งบัญชีทดสอบของตนเอง

## ข้อจำกัดที่ทราบ
TC4_001 ชำระ Test ได้ verified ใน Trace แต่ยอดระดมทุนไม่เพิ่มในรอบนั้น เพิ่ม polling แล้วและต้องรันยืนยันใหม่ เคส Skip ไม่ใช่ Pass และ UC14 เป็นเคสหลักบันทึก Draft

ไม่มีบัญชี รหัสผ่าน หรือ session ในไฟล์เผยแพร่
