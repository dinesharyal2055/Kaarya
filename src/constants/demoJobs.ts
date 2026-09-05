/**
 * Demo jobs data for testing the Kaarya app
 */

export interface DemoJob {
  id: string;
  title: string;
  description: string;
  category: string;
  area: string;
  budget: string;
  urgency: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'completed';
  postedBy: string;
  postedAt: string;
  bids: number;
}

export const DEMO_JOBS: DemoJob[] = [
  {
    id: '1',
    title: 'Fix leaking kitchen tap',
    description: 'Kitchen tap has been dripping for 2 days. Need a plumber to fix it ASAP.',
    category: 'plumbing',
    area: 'Thamel',
    budget: '₹800 - ₹1,200',
    urgency: 'high',
    status: 'open',
    postedBy: 'Rajesh K.',
    postedAt: '2 hours ago',
    bids: 3,
  },
  {
    id: '2',
    title: 'Paint 2 bedroom walls',
    description: 'Looking for someone to paint two bedrooms. Approximately 400 sq ft total. White color preferred.',
    category: 'painting',
    area: 'Lazimpat',
    budget: '₹8,000 - ₹12,000',
    urgency: 'medium',
    status: 'open',
    postedBy: 'Sita M.',
    postedAt: '5 hours ago',
    bids: 7,
  },
  {
    id: '3',
    title: 'AC not cooling properly',
    description: 'My split AC is running but not cooling. Needs gas refill or repair.',
    category: 'appliance',
    area: 'Jhamsikhel',
    budget: '₹2,000 - ₹3,500',
    urgency: 'high',
    status: 'open',
    postedBy: 'Prakash S.',
    postedAt: '1 day ago',
    bids: 5,
  },
  {
    id: '4',
    title: 'Move 3-seater sofa to 2nd floor',
    description: 'Need help moving a heavy 3-seater sofa from ground floor to 2nd floor apartment.',
    category: 'moving',
    area: 'Kumaripati',
    budget: '₹1,500 - ₹2,000',
    urgency: 'low',
    status: 'open',
    postedBy: 'Anita B.',
    postedAt: '1 day ago',
    bids: 2,
  },
  {
    id: '5',
    title: 'Deep clean 2BHK apartment',
    description: 'Moving out clean needed. 2 bedrooms, 1 hall, 1 kitchen. Includes bathroom cleaning.',
    category: 'cleaning',
    area: 'Baneshwor',
    budget: '₹3,500 - ₹5,000',
    urgency: 'medium',
    status: 'open',
    postedBy: 'Krishna P.',
    postedAt: '2 days ago',
    bids: 8,
  },
  {
    id: '6',
    title: 'Fix electrical switchboard',
    description: 'Two switches in living room are sparking. Need immediate attention for safety.',
    category: 'electrical',
    area: 'Putalisadak',
    budget: '₹500 - ₹800',
    urgency: 'high',
    status: 'open',
    postedBy: 'Deepa T.',
    postedAt: '3 days ago',
    bids: 4,
  },
  {
    id: '7',
    title: 'Assemble IKEA wardrobes',
    description: 'Bought two IKEA PAX wardrobes. Need someone to assemble and mount on wall.',
    category: 'carpentry',
    area: 'Samakhushi',
    budget: '₹2,500 - ₹4,000',
    urgency: 'low',
    status: 'open',
    postedBy: 'Niraj G.',
    postedAt: '4 days ago',
    bids: 1,
  },
  {
    id: '8',
    title: 'Computer virus removal',
    description: 'Windows laptop running very slow, suspect virus. Need cleaning and antivirus setup.',
    category: 'appliance',
    area: 'Maharajgunj',
    budget: '₹1,000 - ₹1,500',
    urgency: 'medium',
    status: 'open',
    postedBy: 'Bibek R.',
    postedAt: '5 days ago',
    bids: 6,
  },
];
