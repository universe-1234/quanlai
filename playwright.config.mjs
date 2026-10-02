import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'tests', testMatch:'ui.spec.js', fullyParallel:false, workers:1,
 use:{baseURL:'http://127.0.0.1:4273',viewport:{width:1240,height:1000},channel:process.env.PW_CHANNEL || undefined},
 webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4273',url:'http://127.0.0.1:4273',reuseExistingServer:false},
 reporter:'list',outputDir:'output/playwright/results',
});
