import firebase_admin, warnings, re, os
warnings.filterwarnings('ignore')
from firebase_admin import credentials, firestore
cred = credentials.Certificate(os.path.expanduser('~/.config/google-credentials/firebase-service-account.json'))
if not firebase_admin._apps: firebase_admin.initialize_app(cred)
db = firestore.client()
doc = db.document('boards/shared-board').get()
cards = doc.to_dict().get('cards', {})

# Free email providers to skip (no company to extract)
FREE_PROVIDERS = {
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'icloud.com', 'aol.com', 'protonmail.com', 'live.com',
    'msn.com', 'me.com', 'mac.com', 'googlemail.com',
}

updated = 0
skipped_free = 0
still_blank = []

for cid, c in cards.items():
    if c.get('businessName'):
        continue

    email = c.get('email', '')
    if not email or '@' not in email:
        still_blank.append(cid)
        continue

    domain = email.split('@')[1].lower()

    # Skip free providers
    if domain in FREE_PROVIDERS:
        skipped_free += 1
        continue

    # Extract company from domain
    # e.g. jj@leonardo.ai -> leonardo.ai -> Leonardo AI
    # e.g. brandon.watts@storyblok.com -> storyblok.com -> Storyblok
    parts = domain.replace('.com', '').replace('.io', '').replace('.ai', '').replace('.co', '').replace('.org', '').split('.')
    company = parts[0].replace('-', ' ').replace('_', ' ').title()

    # Manual mappings for known domains
    DOMAIN_MAP = {
        'influencermarketing.ai': 'Influence Marketing',
        'humense.com': 'Humense',
        'mitrarobot.com': 'Mitra Robot',
        'hofcapital.com': 'HOF Capital',
        'beme.ai': 'BeMe AI',
        'wild.ai': 'Wild.AI',
        'nothing.tech': 'Nothing Tech',
        'oklinklimited.com': 'Oklink',
        'plough.tv': 'Plough',
        'dmkglobal.co.kr': 'DMK Global',
        'docusign.net': 'DocuSign',
        'aiify.io': 'Aiify',
        'finaiconference.com': 'Fin+AI Conference',
        'gmass.co': 'GMass',
        'mailchimp.com': 'Mailchimp',
        'dovetail.fm': 'Dovetail',
        'luma-mail.com': 'Luma',
        'calendly.com': 'Calendly',
        'cal.com': 'Cal.com',
        'notion.so': 'Notion',
        'slack.com': 'Slack',
        'zoom.us': 'Zoom',
        'linear.app': 'Linear',
        'github.com': 'GitHub',
        'figma.com': 'Figma',
    }

    if domain in DOMAIN_MAP:
        company = DOMAIN_MAP[domain]
    elif not company:
        still_blank.append(cid)
        continue

    cards[cid]['businessName'] = company
    updated += 1

print(f'Updated {updated} from email domain')
print(f'{skipped_free} skipped (free email providers)')
print(f'{len(still_blank)} still have no company')
db.document('boards/shared-board').update({'cards': cards})
print('Saved')
