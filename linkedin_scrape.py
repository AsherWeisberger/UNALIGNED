#!/usr/bin/env python3
"""
LinkedIn Scraper — Messages, InMails, Sales Navigator, Connection Requests
Part of the UNALIGNED Lead Pipeline

Usage:
    python3 linkedin_scrape.py                    # Scrape all
    python3 linkedin_scrape.py --messages-only   # Just messages
    python3 linkedin_scrape.py --connections-only # Just connection requests
"""
import os, json, time, re
from datetime import datetime, timedelta
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# ─── CONFIG ───────────────────────────────────────────────────────────────────
LINKEDIN_EMAIL = os.environ.get("LINKEDIN_EMAIL", "AsherWeisberger@gmail.com")
LINKEDIN_PASSWORD = os.environ.get("LINKEDIN_PASSWORD", "Nashville89!")
OUTPUT_FILE = "/tmp/linkedin_leads.json"
LOOKBACK_DAYS = 30

# ─── SETUP ────────────────────────────────────────────────────────────────────
def setup_driver():
    options = Options()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-notifications")
    options.add_argument("--no-sandbox")
    # Avoid detection
    options.add_argument("--disable-blink-features=AutomationControlled")
    driver = webdriver.Chrome(options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_and_find(driver, by, value, timeout=10, multiple=False):
    try:
        if multiple:
            return WebDriverWait(driver, timeout).until(
                EC.presence_of_all_elements_located((by, value)))
        else:
            return WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((by, value)))
    except TimeoutException:
        return None if not multiple else []

def human_delay(min_s=1, max_s=3):
    time.sleep(min_s + (max_s - min_s) * 0.3 + (max_s - min_s) * 0.7 * (time.time() % 1))

# ─── LOGIN ────────────────────────────────────────────────────────────────────
def login(driver):
    log("Navigating to LinkedIn...")
    driver.get("https://www.linkedin.com/login")
    human_delay(3, 5)
    
    try:
        # Wait for form to be ready
        wait = WebDriverWait(driver, 15)
        user_field = wait.until(EC.presence_of_element_located((By.ID, "username")))
        
        user_field.send_keys(LINKEDIN_EMAIL)
        human_delay(0.5)
        driver.find_element(By.ID, "password").send_keys(LINKEDIN_PASSWORD)
        human_delay(0.5)
        driver.find_element(By.ID, "password").send_keys("\n")
        log("Login submitted. Waiting for redirect...")
        human_delay(4, 6)
        
        # Handle 2FA checkpoint
        if "checkpoint" in driver.current_url or "challenge" in driver.current_url:
            log("⚠️  LinkedIn 2FA checkpoint detected")
            # Check for phone/email verification option
            try:
                # Try to auto-submit if LinkedIn sends push notification
                push_btn = driver.find_element(By.XPATH, "//button[contains(text(),'Approve')]")
                log("Push notification sent to your phone — approving...")
                push_btn.click()
                human_delay(3, 5)
            except:
                log("Please approve the login request on your phone, then press Enter here")
                input("Press Enter after approving on your phone...")
        
        # Handle "Stay signed in" prompt
        if "checkpoint" in driver.current_url or driver.find_elements(By.ID, "artdeco-generic-asset-tab--1"):
            try:
                driver.find_element(By.XPATH, "//button[contains(text(),'Yes')]").click()
                human_delay(2, 3)
            except:
                pass
        
        log(f"Current URL after login: {driver.current_url}")
        
        if "/feed" in driver.current_url or "linkedin.com" in driver.current_url:
            log("✅ Logged in successfully")
        else:
            log(f"⚠️  May not be fully logged in. URL: {driver.current_url}")
            
    except Exception as e:
        log(f"Login error: {e}")
        raise

# ─── SCRAPE MESSAGES ──────────────────────────────────────────────────────────
def scrape_messages(driver):
    """Scrape InMails and messages from LinkedIn Messaging."""
    log("\n=== Scraping LinkedIn Messages ===")
    messages = []
    
    driver.get("https://www.linkedin.com/messaging/")
    human_delay(3, 5)
    
    # Dismiss any popups
    try:
        driver.find_element(By.CSS_SELECTOR, '[data-test-modal-close-btn]').click()
        human_delay(0.5)
    except:
        pass
    
    # Load more messages by scrolling
    for _ in range(3):
        driver.execute_script("window.scrollBy(0, 500);")
        human_delay(1, 2)
    
    # Find conversation items
    convos = driver.find_elements(By.CSS_SELECTOR, ".msg-conversation-card__person-name, .msg-conversation-listitem__person-name")
    if not convos:
        convos = driver.find_elements(By.CSS_SELECTOR, "[data-test-message-preview-content]")
    
    log(f"Found {len(convos)} conversations")
    
    cutoff = datetime.now() - timedelta(days=LOOKBACK_DAYS)
    
    # Click into each conversation to get message details
    for i, convo in enumerate(convos[:20]):  # Limit to 20 most recent
        try:
            name = convo.text.strip()
            human_delay(1, 2)
            
            # Click to open conversation
            convo.click()
            human_delay(2, 3)
            
            # Get message thread
            msgs = driver.find_elements(By.CSS_SELECTOR, ".msg-s-message-listitem__body, .msg-s-event-listitem__message-bubble")
            timestamp = driver.find_elements(By.CSS_SELECTOR, ".msg-s-message-timestamp__timestamp, time")
            
            for msg_el, ts_el in zip(msgs[-5:], timestamp[-5:] if timestamp else [None]*5):
                try:
                    ts_text = ts_el.get_attribute("datetime") or ts_el.text if ts_el else ""
                    msg_text = msg_el.text.strip()
                    
                    # Parse timestamp
                    try:
                        msg_date = datetime.fromisoformat(ts_text.replace("Z", "+00:00"))
                        msg_date = msg_date.replace(tzinfo=None)
                    except:
                        msg_date = datetime.now()
                    
                    if msg_date < cutoff:
                        continue
                    
                    # Get sender
                    sender_el = msg_el.find_element(By.XPATH, "..")
                    sender = sender_el.get_attribute("data-test-sender-name") or "Unknown"
                    
                    messages.append({
                        "type": "LINKEDIN_MESSAGE",
                        "source": "LINKEDIN",
                        "contact_name": name,
                        "message": msg_text[:500],
                        "timestamp": ts_text,
                        "sender": sender,
                        "url": driver.current_url
                    })
                except Exception as e:
                    pass
            
            # Go back to inbox
            driver.back()
            human_delay(1, 2)
            
        except Exception as e:
            log(f"  Error on conversation {i}: {e}")
            try:
                driver.back()
                human_delay(1, 2)
            except:
                pass
    
    log(f"Scraped {len(messages)} messages from LinkedIn")
    return messages

# ─── SCRAPE SALES NAVIGATOR ──────────────────────────────────────────────────
def scrape_sales_navigator(driver):
    """Scrape leads from LinkedIn Sales Navigator."""
    log("\n=== Scraping LinkedIn Sales Navigator ===")
    leads = []
    
    driver.get("https://www.linkedin.com/sales/home")
    human_delay(3, 5)
    
    # Check if Sales Navigator is available
    if "sales Navigator" in driver.page_source or "sales-navigator" in driver.current_url:
        log("Sales Navigator detected")
    else:
        log("Sales Navigator not accessible — may need Premium")
    
    # Scrape lead cards on the dashboard
    cards = driver.find_elements(By.CSS_SELECTOR, ".SlLeadPreviewCard, .search-results__result-item, .alumni-item")
    log(f"Found {len(cards)} Sales Navigator lead cards")
    
    cutoff = datetime.now() - timedelta(days=LOOKBACK_DAYS)
    
    for card in cards[:30]:
        try:
            name_el = card.find_elements(By.CSS_SELECTOR, ".SlLeadPreviewCard__name, .name, .app-aware-link")
            title_el = card.find_elements(By.CSS_SELECTOR, ".SlLeadPreviewCard__title, .subtitle, .headline")
            company_el = card.find_elements(By.CSS_SELECTOR, ".SlLeadPreviewCard__company, .company-name")
            time_el = card.find_elements(By.CSS_SELECTOR, "time, .time-ago")
            
            name = name_el[0].text.strip() if name_el else ""
            title = title_el[0].text.strip() if title_el else ""
            company = company_el[0].text.strip() if company_el else ""
            ts_text = time_el[0].get_attribute("datetime") or time_el[0].text if time_el else ""
            
            if not name:
                continue
            
            leads.append({
                "type": "SALES_NAVIGATOR_LEAD",
                "source": "LINKEDIN",
                "contact_name": name,
                "title": title,
                "company_name": company,
                "timestamp": ts_text,
                "url": driver.current_url
            })
        except Exception as e:
            pass
    
    log(f"Scraped {len(leads)} Sales Navigator leads")
    return leads

# ─── SCRAPE CONNECTION REQUESTS ───────────────────────────────────────────────
def scrape_connections(driver):
    """Scrape pending connection requests and new connections."""
    log("\n=== Scraping LinkedIn Connections ===")
    connections = []
    
    # Pending invitations
    driver.get("https://www.linkedin.com/mynetwork/invite-connect/managers/")
    human_delay(3, 5)
    
    # Find pending requests tab
    try:
        pending_tab = driver.find_element(By.XPATH, "//span[contains(text(),'Pending')]")
        pending_tab.click()
        human_delay(2, 3)
    except:
        pass
    
    # Find connection request cards
    cards = driver.find_elements(By.CSS_SELECTOR, ".mn-invitation-card, .artdeco-list__item, .mn-connection-card")
    log(f"Found {len(cards)} connection items")
    
    cutoff = datetime.now() - timedelta(days=LOOKBACK_DAYS)
    
    for card in cards[:20]:
        try:
            # Try multiple selectors for name
            name = ""
            for sel in [".mn-invitation-card__name", ".artdeco-pill-container", ".mn-connection-card__name", ".block"]:
                try:
                    el = card.find_element(By.CSS_SELECTOR, sel)
                    name = el.text.strip()
                    if name:
                        break
                except:
                    pass
            
            if not name:
                continue
            
            # Try to get message/note
            note = ""
            try:
                note_el = card.find_element(By.CSS_SELECTOR, ".mn-invitation-card__invitation-note, .artdeco-empty-state__headline")
                note = note_el.text.strip()
            except:
                pass
            
            # Get timestamp
            ts = ""
            try:
                time_el = card.find_element(By.CSS_SELECTOR, "time, .time-badge")
                ts = time_el.get_attribute("datetime") or time_el.text
            except:
                pass
            
            # Get profile URL
            profile_url = ""
            try:
                link = card.find_element(By.CSS_SELECTOR, "a[href*='/in/']")
                profile_url = link.get_attribute("href")
            except:
                pass
            
            if name and name not in ("Message", "Invite", "Pending"):
                connections.append({
                    "type": "CONNECTION_REQUEST",
                    "source": "LINKEDIN",
                    "contact_name": name,
                    "note": note[:200] if note else "",
                    "timestamp": ts,
                    "profile_url": profile_url
                })
        except Exception as e:
            pass
    
    log(f"Scraped {len(connections)} connection requests")
    return connections

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--messages-only", action="store_true")
    parser.add_argument("--connections-only", action="store_true")
    parser.add_argument("--sales-only", action="store_true")
    args = parser.parse_args()
    
    driver = setup_driver()
    all_leads = []
    
    try:
        login(driver)
        
        if args.messages_only:
            all_leads = scrape_messages(driver)
        elif args.connections_only:
            all_leads = scrape_connections(driver)
        elif args.sales_only:
            all_leads = scrape_sales_navigator(driver)
        else:
            # Run all scrapers
            all_leads.extend(scrape_messages(driver))
            human_delay(5, 10)
            all_leads.extend(scrape_sales_navigator(driver))
            human_delay(5, 10)
            all_leads.extend(scrape_connections(driver))
        
        # Save results
        with open(OUTPUT_FILE, "w") as f:
            json.dump(all_leads, f, indent=2, default=str)
        
        log(f"\n✅ Done! Scraped {len(all_leads)} LinkedIn leads")
        log(f"Results saved to: {OUTPUT_FILE}")
        
        # Print summary
        by_type = {}
        for lead in all_leads:
            t = lead.get("type", "UNKNOWN")
            by_type[t] = by_type.get(t, 0) + 1
        for t, count in by_type.items():
            log(f"  {t}: {count}")
        
    finally:
        input("\nPress Enter to close the browser...")
        driver.quit()

if __name__ == "__main__":
    main()
