import firebase_admin, warnings, re, os
warnings.filterwarnings('ignore')
from firebase_admin import credentials, firestore
cred = credentials.Certificate(os.path.expanduser('~/.config/google-credentials/firebase-service-account.json'))
if not firebase_admin._apps: firebase_admin.initialize_app(cred)
db = firestore.client()
doc = db.document('boards/shared-board').get()
cards = doc.to_dict().get('cards', {})

no_bn = [(cid, c.get('title','?'), c.get('contactName','?'), c.get('email','?')) for cid, c in cards.items() if not c.get('businessName')]
print(f'{len(no_bn)} still missing businessName')
print('\nSamples:')
for cid, title, cn, email in no_bn[:20]:
    print(f'  [{cid}] title={title[:50]:<52} cn={cn:<25} email={email}')
