#!/usr/bin/env python3
"""
Rewrite ALL card descriptions using existing card data.
No Gmail lookup needed — uses title, email, contactName, businessName,
intent, priority, estimatedValue, leadSource, etc. already in the card.
Batch-processed via OpenAI API.
"""
import os, sys, json, time, warnings
warnings.filterwarnings('ignore')

os.environ['OPENAI_API_KEY'] = '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'

import firebase_admin
from firebase_admin import credentials as fb_credentials
from firebase_admin import firestore
import openai

FIREBASE_SERVICE_ACCOUNT = os.path.expanduser("~/.config/google-credentials/firebase-service-account.json")

PROMPT_TEMPLATE = """You are rewriting lead card descriptions for a sales pipeline. Each card has existing data — use ALL of it to write a rich, human-readable description.

CARD DATA:
- Title: {title}
- Contact Name: {contact_name}
- Email: {email}
- Business Name: {business_name}
- Intent: {intent}
- Priority: {priority}
- Estimated Value: {estimated_value}
- Lead Source: {lead_source}
- Existing Description: {existing_desc}
- Original Subject: {original_subject}

TASK: Write a single rich description string using this exact format:

WHO: [First name] [Last name] (or just their name if no last name), [job title or role] at [company]. [One sentence about them — what they do, what they built, what they care about. If unknown say "Details about their background not provided."]

WHAT: [EXACTLY what they want from Robert in 1-2 sentences. Be specific — if they want a podcast appearance say "Wants Robert to appear as a guest on their podcast." If they want sponsorship say "Offering $X for Y. If no amount, say "Compensation TBD." If they want a meeting say "Wants to schedule a call/meeting to discuss..."]

VALUE: ${estimated_value:,} — this is their estimated deal value. Include it directly in this format: "$X,XXX". If no value was provided, write "TBD — no budget discussed."

WHY ROBERT: [Why they specifically reached out to Robert Scoble. Their stated reason or your best inference based on their title/company/intent. Be specific — "They follow Robert's spatial computing coverage" is good. "They want to collaborate" is too vague. If unclear say "Specific motivation not clear from available data."]

Rules:
- Use the actual data from the card — do NOT fabricate information
- If a field is empty, say "Not provided" for that specific detail
- Write like a smart sales rep, not a robot
- Keep it punchy and scannable
- Maximum 6 sentences total across all four sections

Return ONLY the description string, no JSON, no markdown, no preamble.
"""

BATCH_PROMPT_TEMPLATE = """You are rewriting lead card descriptions for a sales pipeline. For EACH of the {count} cards below, write a rich description in the exact WHO/WHAT/VALUE/WHY format. Return a JSON array with {count} objects, each having a "card_id" and "description" field.

CARDS:
{cards}

FORMAT for each:
WHO: [name], [job title/role] at [company]. [One sentence about them]
WHAT: [EXACTLY what they want — specific ask, specific numbers]
VALUE: $[estimated value] or "TBD"
WHY ROBERT: [Why they reached out to Robert specifically]

Return ONLY valid JSON array like: [{{"card_id":"123","description":"WHO:..."}}, ...]
Return ONLY the JSON, no markdown, no explanation.
"""

def build_single_prompt(card):
    title = card.get('title', 'Unknown')
    contact = card.get('contactName', 'Not provided')
    email = card.get('email', 'Not provided')
    business = card.get('businessName', 'Not provided')
    intent = card.get('intent', 'Not provided')
    priority = card.get('priority', 'Not provided')
    ev = card.get('estimatedValue', 'Not provided')
    ls = card.get('leadSource', 'Not provided')
    desc = card.get('description', 'Not provided')
    subject = card.get('originalSubject', title)
    
    return PROMPT_TEMPLATE.format(
        title=title,
        contact_name=contact,
        email=email,
        business_name=business,
        intent=intent,
        priority=priority,
        estimated_value=ev,
        lead_source=ls,
        existing_desc=desc,
        original_subject=subject
    )

def rewrite_single(client, card, card_id):
    prompt = build_single_prompt(card)
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a sales lead description writer. Return ONLY the description string, nothing else."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=600,
            timeout=30.0
        )
        desc = response.choices[0].message.content.strip()
        # Strip markdown if any
        if desc.startswith('```'):
            for marker in ['```json', '```JSON', '```']:
                if desc.startswith(marker):
                    desc = desc[len(marker):]
                    break
            desc = desc.split('```')[0].strip()
        return desc
    except Exception as e:
        return None

def rewrite_batch(client, cards_batch):
    """cards_batch = list of (card_id, card_data)"""
    cards_text = []
    for i, (cid, card) in enumerate(cards_batch):
        title = card.get('title', 'Unknown')
        contact = card.get('contactName', 'Not provided')
        email = card.get('email', 'Not provided')
        business = card.get('businessName', 'Not provided')
        intent = card.get('intent', 'Not provided')
        ev = card.get('estimatedValue', 'Not provided')
        ls = card.get('leadSource', 'Not provided')
        desc = card.get('description', '')[:200]
        cards_text.append(f"""
CARD {i+1} (id={cid}):
- Title: {title}
- Contact: {contact}
- Email: {email}
- Business: {business}
- Intent: {intent}
- Value: {ev}
- Source: {ls}
- Existing description snippet: {desc}
""")
    
    prompt = BATCH_PROMPT_TEMPLATE.format(
        count=len(cards_batch),
        cards=''.join(cards_text)
    )
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a sales lead description writer. Return ONLY valid JSON array."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=4000,
            timeout=60.0
        )
        raw = response.choices[0].message.content.strip()
        # Try to extract JSON
        if '```json' in raw:
            raw = raw.split('```json')[1].split('```')[0]
        elif '```' in raw:
            raw = raw.split('```')[1].split('```')[0]
        
        result = json.loads(raw)
        return {item['card_id']: item['description'] for item in result}
    except Exception as e:
        print(f"  [batch error: {e}]")
        return {}

def main():
    print("🔄 Full Description Rewrite — WHO/WHAT/VALUE/WHY for ALL cards\n")
    print("No Gmail lookup needed — using existing card data directly.\n")
    
    cred = fb_credentials.Certificate(FIREBASE_SERVICE_ACCOUNT)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    client = openai.OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    
    doc_ref = db.document("boards/shared-board")
    doc = doc_ref.get()
    if not doc.exists:
        print("❌ No board found")
        return
    
    all_cards = doc.to_dict().get('cards', {})
    print(f"Total cards: {len(all_cards)}\n")
    
    # Determine which cards need rewriting
    needs_rewrite = []
    already_rich = []
    for cid, card in all_cards.items():
        desc = card.get('description', '')
        # Rewrite if: no WHO:, or old format (starts with 📧), or too short
        if desc.startswith('WHO:') and 'VALUE:' in desc and 'WHY ROBERT:' in desc:
            already_rich.append(cid)
        else:
            needs_rewrite.append(cid)
    
    print(f"Already rich (skip):    {len(already_rich)}")
    print(f"Need rewrite:          {len(needs_rewrite)}")
    print()
    
    # Process in batches of 10
    BATCH_SIZE = 10
    total_batches = (len(needs_rewrite) + BATCH_SIZE - 1) // BATCH_SIZE
    
    updated = 0
    failed = 0
    
    for batch_num in range(total_batches):
        batch_ids = needs_rewrite[batch_num * BATCH_SIZE : (batch_num + 1) * BATCH_SIZE]
        batch_cards = [(cid, all_cards[cid]) for cid in batch_ids]
        
        print(f"Batch {batch_num + 1}/{total_batches}: processing {len(batch_cards)} cards...", end="", flush=True)
        
        results = rewrite_batch(client, batch_cards)
        
        for cid, card in batch_cards:
            if cid in results and results[cid]:
                all_cards[cid]['description'] = results[cid]
                updated += 1
                print(" ✅", end="", flush=True)
            else:
                # Fallback to single rewrite
                desc = rewrite_single(client, card, cid)
                if desc:
                    all_cards[cid]['description'] = desc
                    updated += 1
                    print(" ✅", end="", flush=True)
                else:
                    failed += 1
                    print(" ⚠️", end="", flush=True)
        
        print(f" ({updated} total updated)")
        
        # Save every 20 batches to avoid losing progress
        if (batch_num + 1) % 20 == 0:
            print(f"\n  💾 Checkpoint saving {updated} updates so far...")
            doc_ref.update({'cards': all_cards})
    
    # Final save
    print(f"\n\n💾 Saving all {updated} updates to Firestore...")
    doc_ref.update({'cards': all_cards})
    
    print(f"\n{'='*55}")
    print(f"✅ Updated:  {updated}")
    print(f"❌ Failed:   {failed}")
    print(f"⏭️  Skipped (rich): {len(already_rich)}")
    print(f"📊 Total:    {len(all_cards)}")

if __name__ == '__main__':
    main()
