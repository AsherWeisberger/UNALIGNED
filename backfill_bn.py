import firebase_admin, warnings, re, os
warnings.filterwarnings('ignore')
from firebase_admin import credentials, firestore
cred = credentials.Certificate(os.path.expanduser('~/.config/google-credentials/firebase-service-account.json'))
if not firebase_admin._apps: firebase_admin.initialize_app(cred)
db = firestore.client()
doc = db.document('boards/shared-board').get()
cards = doc.to_dict().get('cards', {})

updated = 0
no_match = []
for cid, c in cards.items():
    if c.get('businessName'):
        continue
    title = c.get('title', '')
    # Extract from '| CompanyName' at end of title
    m = re.search(r'\|\s*([A-Za-z0-9][A-Za-z0-9 .\-+&\'()]{1,30})$', title)
    if m:
        cards[cid]['businessName'] = m.group(1).strip()
        updated += 1
    else:
        no_match.append((cid, title[:60]))

print(f'Updated {updated} from title pattern')
print(f'{len(no_match)} no match -- sample:')
for cid, t in no_match[:5]:
    print(f'  [{cid}] {t}')
db.document('boards/shared-board').update({'cards': cards})
print('Saved')
