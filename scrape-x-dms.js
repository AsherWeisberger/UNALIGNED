const { chromium } = require('playwright');

const KEYWORDS = ['scoble', 'unaligned', 'scobalizer'];

async function scrapeTwitterDMs() {
    const browser = await chromium.launch({ 
        headless: false // Show browser so you can log in once
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log('Opening X...');
    await page.goto('https://x.com');
    
    // Wait for login or home page
    await page.waitForTimeout(3000);
    
    // Check if logged in
    const loggedIn = await page.$('[data-testid="SideNav_NewTweet_button"]');
    
    if (!loggedIn) {
        console.log('Please log into X in the browser...');
        // Wait for user to log in
        await page.waitForSelector('[data-testid="SideNav_NewTweet_button"]', { timeout: 120000 });
        console.log('Logged in!');
    }
    
    // Go to DMs
    console.log('Opening DMs...');
    await page.goto('https://x.com/messages');
    await page.waitForTimeout(2000);
    
    // Click on the first conversation
    const conversations = await page.$$('[data-testid="conversation"]');
    
    if (conversations.length === 0) {
        console.log('No conversations found. Waiting...');
        await page.waitForTimeout(5000);
    }
    
    // Scrape all conversations
    const leads = [];
    
    // Get all DM participants first
    const dmLinks = await page.$$('[data-testid="conversation"] a[href*="/messages/"]');
    console.log(`Found ${dmLinks.length} conversations`);
    
    for (const link of dmLinks) {
        try {
            const href = await link.getAttribute('href');
            const convId = href.split('/messages/')[1]?.split('/')[0];
            
            if (convId) {
                // Click on conversation
                await link.click();
                await page.waitForTimeout(1000);
                
                // Get messages
                const messages = await page.$$('[data-testid="messageEntry"]');
                
                for (const msg of messages) {
                    const text = await msg.textContent();
                    if (text) {
                        const textLower = text.toLowerCase();
                        const matchedKeywords = KEYWORDS.filter(kw => textLower.includes(kw.toLowerCase()));
                        
                        if (matchedKeywords.length > 0) {
                            leads.push({
                                conversationId: convId,
                                text: text.trim(),
                                keywords: matchedKeywords,
                                url: href
                            });
                        }
                    }
                }
                
                // Go back
                await page.goBack();
                await page.waitForTimeout(500);
            }
        } catch (e) {
            // Skip errors
        }
    }
    
    console.log(`\nFound ${leads.length} leads from X DMs:`);
    console.log(JSON.stringify(leads, null, 2));
    
    // Keep browser open for debugging - close when done
    // await browser.close();
    
    return leads;
}

scrapeTwitterDMs().catch(console.error);
