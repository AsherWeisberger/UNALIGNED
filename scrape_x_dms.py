from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import time
import json

CHROMEDRIVER_PATH = "/opt/homebrew/bin/chromedriver"
CHROME_PROFILE_PATH = "/Users/asherweisberger/chrome-automation-profile"
KEYWORDS = ['scoble', 'unaligned', 'scobalizer']

def create_driver():
    options = Options()
    options.add_argument(f"user-data-dir={CHROME_PROFILE_PATH}")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-extensions")
    return webdriver.Chrome(service=Service(CHROMEDRIVER_PATH), options=options)

def scrape_x_dms():
    driver = create_driver()
    
    print("Opening X home...")
    driver.get("https://x.com/home")
    time.sleep(5)
    
    if "login" in driver.current_url.lower():
        print("Please log in to X...")
        input("Press Enter after logging in...")
        time.sleep(3)
    
    print("Clicking DM button...")
    dm_button = driver.find_element("css selector", "[data-testid='AppTabBar_DirectMessage_Link']")
    dm_button.click()
    
    time.sleep(5)
    print("Now in DM view:", driver.current_url)
    
    # Use JavaScript to find DM conversation elements
    conversations = driver.execute_script("""
        var items = document.querySelectorAll('[data-testid^="dm-conversation-item-"]');
        var out = [];
        items.forEach(function(item) {
            out.push(item.getAttribute('data-testid'));
        });
        return out;
    """)
    print(f"Found {len(conversations)} DM conversations via JS")
    print("Sample:", conversations[:5])
    
    if len(conversations) == 0:
        # Try getting ALL data-testid values to debug
        all_testids = driver.execute_script("""
            var elements = document.querySelectorAll('[data-testid]');
            var out = [];
            elements.forEach(function(el) {
                var id = el.getAttribute('data-testid');
                if (id && id.toLowerCase().includes('dm')) {
                    out.push(id);
                }
            });
            return out;
        """)
        print("DM-related testids:", json.dumps(all_testids, indent=2))
    
    # Try clicking first conversation using JS
    if len(conversations) > 0:
        first_conv = conversations[0]
        print(f"Clicking first: {first_conv}")
        
        driver.execute_script(f"""
            var el = document.querySelector('[data-testid="{first_conv}"]');
            if (el) el.click();
        """)
        time.sleep(3)
        
        # Get messages
        messages = driver.execute_script("""
            var msgs = document.querySelectorAll('[data-testid="messageEntry"]');
            var out = [];
            msgs.forEach(function(m) {
                out.push(m.innerText);
            });
            return out;
        """)
        print("Messages:", json.dumps(messages, indent=2))
    
    driver.quit()
    return []

if __name__ == "__main__":
    scrape_x_dms()
