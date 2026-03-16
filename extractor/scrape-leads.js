/**
 * Robert Scoble Lead Extractor
 * Extracts publicly available leads from Robert Scoble's online presence
 * 
 * IMPORTANT: This script only works with PUBLICLY AVAILABLE data.
 * - Public LinkedIn posts/profile
 * - Public Twitter/X tweets
 * - Publicly available contact info from his website
 * 
 * DO NOT attempt to scrape:
 * - Private messages (WhatsApp, Telegram, FB Messenger, X DMs)
 * - Private email addresses (unless publicly indexed)
 * - Personal data without explicit permission
 * 
 * This respects privacy and platform terms of service.
 */

const { JSDOM } = require('jsdom');
const { cardTemplate } = require('./lead-card-format');
const fs = require('fs');

// Robert Scoble's profiles (update with actual URLs)
const SCOBLE_DATA = {
  linkedinProfile: 'https://www.linkedin.com/in/robert-scoble-52031/',
  twitterProfile: 'https://twitter.com/RScoble',
  website: 'https://scoble8.net/'
};

/**
 * Extract lead from LinkedIn post
 * @param {string} postUrl - LinkedIn post URL
 * @returns {object} Lead card
 */
async function extractFromLinkedIn(postUrl) {
  // Fetch the post content
  const response = await fetch(postUrl);
  if (!response.ok) {
    console.error('Failed to fetch LinkedIn post:', postUrl);
    return null;
  }
  
  const dom = new JSDOM(response.text());
  const document = dom.window.document;
  
  // Try to extract text content
  const elements = document.querySelectorAll('blockquote, .text, .post-content');
  let text = '';
  elements.forEach(el => text += el.textContent + ' ');
  
  // Extract key information
  const nameMatch = text.match(/(?:name|Name)[\s\S]*?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)/);
  const businessMatch = text.match(/(?:looking for|seeking|interested in|wanting to)([\s\S]*?)(?:partner|business|company|product|solution)/);
  const contactMatch = text.match(/(?:email|Email)[\s\S]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const phoneMatch = text.match(/(?:call|phone|Phone)[\s\S]*?(\([0-9]{3}\)[0-9]{3}-[0-9]{4}|[0-9]{3}-[0-9]{4})/);
  const websiteMatch = text.match(/(?:website|site)[\s\S]*?((?:https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  
  // Create lead card
  const leadCard = { ...cardTemplate };
  leadCard.title = nameMatch ? nameMatch[1] : 'Lead Name Unknown';
  leadCard.description = {
    name: nameMatch ? nameMatch[1] : 'Unknown',
    email: contactMatch ? contactMatch[1] : 'No email found',
    phone: phoneMatch ? phoneMatch[1] : 'No phone found',
    website: websiteMatch ? websiteMatch[1] : 'No website found',
    inquiry: businessMatch ? businessMatch[1].substring(0, 500) : 'Inquiry details not clearly available',
    summary: text.substring(0, 1000)
  };
  
  // Add activity log
  leadCard.activity.push({
    user: 'Lead Extractor',
    initials: 'LE',
    action: `extracted from LinkedIn post: ${postUrl}`,
    time: new Date().toISOString()
  });
  
  return leadCard;
}

/**
 * Extract lead from Twitter/X profile
 * @param {string} profileUrl - Twitter profile URL
 * @returns {object} Lead card
 */
async function extractFromTwitter(profileUrl) {
  // Fetch Twitter profile
  const response = await fetch(profileUrl + '/users/json');
  if (!response.ok) {
    console.error('Failed to fetch Twitter profile:', profileUrl);
    return null;
  }
  
  const data = await response.json();
  const profile = data.data[0];
  
  // Create lead card
  const leadCard = { ...cardTemplate };
  leadCard.title = profile.name || profile.screen_name;
  leadCard.description = {
    name: profile.name || profile.screen_name,
    handle: profile.screen_name,
    bio: profile.description || profile.biography,
    location: profile.location,
    website: profile.url,
    summary: profile.description || 'Twitter profile analysis'
  };
  
  // Add activity log
  leadCard.activity.push({
    user: 'Lead Extractor',
    initials: 'LE',
    action: `extracted from Twitter profile: ${profileUrl}`,
    time: new Date().toISOString()
  });
  
  return leadCard;
}

/**
 * Main extraction function
 */
async function extractScobleLeads() {
  console.log('🐕 Starting lead extraction from Robert Scoble\'s profile...\n');
  
  const results = [];
  
  try {
    // Extract from Twitter/X
    console.log('🔍 Extracting from Twitter/X...');
    const twitterLead = await extractFromTwitter(SCOBLE_DATA.twitterProfile);
    if (twitterLead) results.push(twitterLead);
    console.log(`✅ Found ${results.length} lead from Twitter\n`);
    
    // Extract from LinkedIn
    console.log('🔍 Extracting from LinkedIn...');
    const linkedinLead = await extractFromLinkedIn(SCOBLE_DATA.linkedinProfile);
    if (linkedinLead) results.push(linkedinLead);
    console.log(`✅ Found ${results.length} lead from LinkedIn\n`);
    
    // Extract from website
    console.log('🔍 Extracting from website...');
    const websiteContent = await fetch(SCOBLE_DATA.website).then(res => res.text());
    const dom = new JSDOM(websiteContent);
    const document = dom.window.document;
    
    const contactElements = document.querySelectorAll('a[href*="mailto:"], [class*="email"], [class*="contact"]');
    contactElements.forEach(el => {
      const text = el.textContent.toLowerCase();
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      
      if (emailMatch) {
        const leadCard = { ...cardTemplate };
        leadCard.title = 'Website Contact Lead';
        leadCard.description = {
          name: 'Contact via Website',
          email: emailMatch[0],
          summary: websiteContent.substring(0, 500)
        };
        leadCard.activity.push({
          user: 'Lead Extractor',
          initials: 'LE',
          action: `extracted email from website`,
          time: new Date().toISOString()
        });
        results.push(leadCard);
      }
    });
    
    console.log(`✅ Found ${results.length} total leads\n`);
    
  } catch (error) {
    console.error('❌ Extraction failed:', error.message);
    return null;
  }
  
  return results;
}

module.exports = { extractFromLinkedIn, extractFromTwitter, extractScobleLeads };
