const admin = require('firebase-admin');
const serviceAccount = require('/Users/asherweisberger/Downloads/unaligned-fc556-firebase-adminsdk-fbsvc-c2b93df971.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const boardRef = db.collection('boards').doc('shared-board');

// Gmail leads to import
const gmailLeads = [
  { subject: 'Secret for Scoble Gmail', from: 'unknown', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: Long term cooperation with Robert from Buzzy', from: 'Buzzy', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: Physical AI', from: 'unknown', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: Speaker Invitation: April 29', from: 'unknown', keywords: ['scoble', 'unaligned'] },
  { subject: 'AI INFRA SUMMIT, May 1', from: 'Maryam Scoble', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: Kind Follow-up on Minimax Draft Timing', from: 'unknown', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: Exploring Potential Collaboration with Qodo', from: 'Krisxan Mendoza', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: LLABS Agent Customer Intro', from: 'Marcus Brotman', keywords: ['scoble', 'unaligned'] },
  { subject: 'Unaligned interview', from: 'unknown', keywords: ['scoble', 'unaligned'] },
  { subject: 'Re: Paid Collaboration With Lovart - Seedance 2.0', from: 'Sam Levin', keywords: ['scoble', 'unaligned'] },
];

async function importLeads() {
  const doc = await boardRef.get();
  const currentCards = doc.data().cards || {};
  
  // Find highest ID
  const ids = Object.keys(currentCards).map(Number);
  const maxId = Math.max(...ids, 0);
  
  let newId = maxId + 1;
  
  for (const lead of gmailLeads) {
    // Check if already exists
    const exists = Object.values(currentCards).some(c => 
      c.title.includes(lead.subject.substring(0, 30))
    );
    
    if (exists) {
      console.log('⚠️ Skipping (exists):', lead.subject.substring(0, 40));
      continue;
    }
    
    currentCards[newId] = {
      id: newId,
      title: lead.subject.substring(0, 100),
      listId: 'discovery',
      labels: lead.keywords,
      description: `From: ${lead.from}\nSource: Gmail`,
      checklist: [],
      activity: [{
        user: 'Hubble',
        initials: 'HB',
        action: 'imported from Gmail',
        time: new Date().toISOString()
      }],
      assignee: '',
      dueDate: '',
      createdBy: 'Hubble',
      createdAt: new Date().toISOString(),
      contactName: lead.from,
      email: '',
      phone: '',
      businessName: '',
      leadSource: 'gmail',
      estimatedValue: '500',
      priority: 'medium'
    };
    
    console.log('✅ Added:', lead.subject.substring(0, 40));
    newId++;
  }
  
  await boardRef.update({
    cards: currentCards,
    updatedAt: new Date().toISOString()
  });
  
  console.log(`\n🎉 Imported ${gmailLeads.length} leads to Kanban board!`);
  process.exit(0);
}

importLeads().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
