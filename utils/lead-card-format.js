// CARD FORMAT - Matches your Firebase structure
// Used for lead cards created from Robert Scoble's online presence
const cardTemplate = {
  id: null, // Will be auto-generated
  title: null, // Lead name
  listId: 'Lead In',
  labels: [
    { name: 'Important', color: 'red' },
    { name: 'New Lead', color: 'blue' }
  ],
  description: null, // Will contain: name, number, business inquiry, email, pricing, summary
  checklist: [],
  assignee: 'Flow AI',
  dueDate: null,
  createdBy: 'Flow AI',
  createdAt: new Date().toISOString(),
  activity: [
    { user: 'Flow AI', initials: 'FA', action: 'created lead from source', time: new Date().toISOString() }
  ]
}

// Robert Scoble's online presence - update with actual URLs
const scobleDataSources = {
  linkedin: 'https://www.linkedin.com/in/robert-scoble-52031/',
  twitter: 'https://twitter.com/RScoble',
  website: 'https://scoble8.net/'
}

// Export for use
module.exports = { cardTemplate, scobleDataSources }
