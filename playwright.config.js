import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'node:fs';
dotenv.config();
const auth='playwright/.auth/pioneer.json';
export default defineConfig({
 testDir:'./tests', workers:1, retries:0, timeout:90000,
 expect:{timeout:15000}, outputDir:'test-results',
 reporter:[['list'],['html',{open:'never'}]],
 use:{...devices['Desktop Chrome'],baseURL:'https://www.fly-up.app',video:'on',trace:'on',screenshot:'on'},
 projects:[
  {name:'public',testMatch:/uc(?:1|2|3|10)\.spec\.js/},
  {name:'auth',testMatch:/[\\/]tests[\\/]auth\.setup\.js$/,use:{headless:false,storageState:fs.existsSync(auth)?auth:undefined,video:'off',trace:'off',screenshot:'off'}},
  {name:'pioneer',testMatch:/uc14\.spec\.js/,dependencies:['auth'],use:{storageState:auth}},
  {name:'booster-auth',testMatch:/[\\/]uc4[\\/]auth\.setup\.js$/,timeout:420000,use:{headless:false,storageState:undefined,video:'off',trace:'off',screenshot:'off'}},
  {name:'uc4',testMatch:/uc4\.spec\.js$/,dependencies:['booster-auth'],timeout:180000,use:{headless:false,storageState:'playwright/.auth/booster.json'}}
 ]
});
