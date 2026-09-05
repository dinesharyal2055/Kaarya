/**
 * Service categories for Kaarya
 * Icons use MaterialCommunityIcons from @expo/vector-icons
 */

export interface Category {
  id: string;
  name: string;
  nameNp?: string; // Nepali name
  icon: string; // MaterialCommunityIcons name
  description: string;
  color: string;
  jobCount?: number;
}

export const CATEGORIES: Category[] = [
  {
    id: 'plumbing',
    name: 'Plumbing',
    nameNp: 'प्लम्बिङ',
    icon: 'toilet',
    description: 'Pipes, leaks, installations & repairs',
    color: '#3B82F6',
  },
  {
    id: 'electrical',
    name: 'Electrical',
    nameNp: 'बिजुली',
    icon: 'lightning-bolt',
    description: 'Wiring, switches, fans & appliance repair',
    color: '#F59E0B',
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    nameNp: 'सफाई',
    icon: 'broom',
    description: 'Home, office & deep cleaning',
    color: '#10B981',
  },
  {
    id: 'carpentry',
    name: 'Carpentry',
    nameNp: 'काठको काम',
    icon: 'hammer-wrench',
    description: 'Furniture repair, assembly & custom woodwork',
    color: '#8B5CF6',
  },
  {
    id: 'painting',
    name: 'Painting',
    nameNp: 'रंग',
    icon: 'format-paint',
    description: 'Interior, exterior & touch-up painting',
    color: '#EF4444',
  },
  {
    id: 'moving',
    name: 'Moving',
    nameNp: 'होइजिङ',
    icon: 'truck-fast',
    description: 'Home shifting & furniture transport',
    color: '#6366F1',
  },
  {
    id: 'appliance',
    name: 'Appliance Repair',
    nameNp: 'उपकरण मर्मत',
    icon: 'washing-machine',
    description: 'AC, fridge, microwave & electronics',
    color: '#0EA5E9',
  },
  {
    id: 'gardening',
    name: 'Gardening',
    nameNp: 'बगान',
    icon: 'flower',
    description: 'Plant care, landscaping & lawn maintenance',
    color: '#22C55E',
  },
  {
    id: 'beauty',
    name: 'Beauty & Salon',
    nameNp: 'सौन्दर्य',
    icon: 'content-cut',
    description: 'Hair, makeup, nails & grooming',
    color: '#EC4899',
  },
  {
    id: 'tutoring',
    name: 'Tutoring',
    nameNp: 'पढाइ',
    icon: 'school',
    description: 'Academic & skill-based tutoring',
    color: '#14B8A6',
  },
  {
    id: 'photography',
    name: 'Photography',
    nameNp: 'फोटोग्राफी',
    icon: 'camera',
    description: 'Events, portraits & product photography',
    color: '#F97316',
  },
  {
    id: 'others',
    name: 'Others',
    nameNp: 'अन्य',
    icon: 'dots-horizontal-circle',
    description: 'Everything else',
    color: '#6B7280',
  },
];

export const KATHMANDU_AREAS = [
  'Baneshwor',
  'Thamel',
  'Lalitpur / Patan',
  'Kalanki',
  'Koteshwor',
  'Chabahil',
  'Kirtipur',
  'Bhaktapur',
  'Balaju',
  'Bouddha',
  'New Road',
  'Maharajgunj',
  'Budhanilkantha',
  'Sankhamul',
  'Jawlakhel',
  'Sanepa',
  'Putalisadak',
  'Teku',
  'Gongabu',
  'Samakhushi',
] as const;

export type KathmanduArea = (typeof KATHMANDU_AREAS)[number];
