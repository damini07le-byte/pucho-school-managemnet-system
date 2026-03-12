const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.text().includes('[editHomework]')) {
      console.log(`PAGE LOG: ${msg.text()}`);
    }
  });

  try {
    // 1. Go to homepage
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    console.log('Navigated to homepage.');
    
    // 2. Click Login
    await page.click('text=Login');
    console.log('Clicked Login button.');
    
    // 3. Select Teacher role
    await page.waitForSelector('.role-card');
    await page.click('.role-card:has-text("Teacher")');
    console.log('Selected Teacher role.');
    
    // 4. Wait for dashboard to load
    await page.waitForSelector('#app-content');
    console.log('Dashboard loaded.');
    
    // 5. Navigate to Homework page
    await page.evaluate(() => {
        window.location.hash = 'homework';
    });
    console.log('Navigated to homework hash.');
    
    // Wait for homework items to load
    await page.waitForSelector('#staffHomeworkList', { timeout: 10000 });
    console.log('Homework list loaded.');
    
    // Find the edit button for a homework item
    const editBtn = await page.$('button[onclick*="editHomework"]');
    if (editBtn) {
      console.log('Edit button found, clicking...');
      await editBtn.click();
      // Wait a moment for any logs
      await page.waitForTimeout(1000);
    } else {
      console.log('Edit button not found.');
    }

  } catch (error) {
    console.error('Test script error:', error);
  } finally {
    await browser.close();
  }
})();
