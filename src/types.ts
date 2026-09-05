export type PlasticAction = 'used' | 'purchased' | 'avoided' | 'disposed' | 'reused' | 'replaced';

export interface PlasticAlternative {
  title: string;
  whyBetter: string;
  costLevel: string;
  convenienceScore: string;
}

export interface PlasticItem {
  id: string;
  name: string;
  category: string;
  action: PlasticAction;
  quantity: number;
  estimatedImpactNote?: string;
  alternative?: PlasticAlternative;
  plasticType?: string;
  resinCode?: string;
  imageUrl?: string;
}

export interface QuickAddMetadata {
  categoryKey?: string;
  plasticType?: string;
  resinCode?: string;
  note?: string;
  imageUrl?: string;
  imagePath?: string;
  contributedToImpact: boolean;
}

export interface JournalEntry {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  text: string;
  reflection: string;
  encouragement: string;
  items: PlasticItem[];
  clarifyingQuestions?: string[];
  source?: 'journal' | 'quick_add' | 'scanner';
  quickAddMetadata?: QuickAddMetadata;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  relatedEntryId?: string;
}

export interface SustainabilitySummary {
  id: string;
  userId: string;
  timeframe: 'weekly' | 'monthly';
  periodTitle: string;
  headline: string;
  topObservedHabits: string[];
  achievements: string[];
  highImpactSwaps: Array<{
    targetItem: string;
    recommendation: string;
    estimatedCostBenefit: string;
  }>;
  areasForImprovement: string[];
  encouragingClosing: string;
  createdAt: number;
}

export interface UserStats {
  totalLoggedEntries: number;
  totalItemsUsed: number;
  totalItemsAvoided: number;
  topCategories: Array<{ category: string; count: number }>;
  frequentlyUsedItems: Array<{ name: string; count: number }>;
  currentStreakDays: number;
}

// ==========================================
// Impact Wall Data Types
// ==========================================

export type ImpactCategoryKey = 'bags' | 'bottles' | 'containers' | 'cups' | 'other';

export interface ImpactMetrics {
  plasticBagsAvoided: number;
  plasticBottlesAvoided: number;
  plasticContainersAvoided: number;
  disposableCupsAvoided: number;
  otherItemsAvoided: number;
  plasticItemsReused: number;
  totalItemsAvoided: number;
}

export interface ImpactAdjustment {
  id: string;
  itemName: string;
  categoryKey: ImpactCategoryKey | 'reused';
  action: 'avoided' | 'reused';
  quantityDelta: number; // e.g. +2, -1, or override
  note?: string;
  timestamp: number;
}

export interface MilestoneAchievement {
  threshold: number;
  title: string;
  description: string;
  achieved: boolean;
}

export interface MonthlyImpact {
  monthKey: string; // YYYY-MM
  monthName: string; // e.g. "September 2026"
  totalAvoided: number;
  totalReused: number;
  mostAvoidedCategory: string;
  previousMonthAvoided: number;
  differenceVsPrevMonth: number;
  hasPreviousMonthData: boolean;
}

export interface ImpactWallData {
  userId: string;
  metrics: ImpactMetrics;
  monthly: MonthlyImpact;
  adjustments: ImpactAdjustment[];
  positiveMessage?: {
    text: string;
    generatedAt: number;
  };
  lastUpdated: number;
}

// ==========================================
// Plastic Scanner Data Types
// ==========================================

export type ResinCode = '#1' | '#2' | '#3' | '#4' | '#5' | '#6' | '#7' | 'unknown' | 'none';

export type PlasticTypeOption =
  | 'PET / PETE (#1)'
  | 'HDPE (#2)'
  | 'PVC (#3)'
  | 'LDPE (#4)'
  | 'PP (#5)'
  | 'PS (#6)'
  | 'Other / mixed plastic (#7)'
  | 'Not plastic / unable to determine';

export type ScanConfidenceLevel = 'High' | 'Moderate' | 'Low' | 'Unable to confidently identify';

export interface PlasticScanResult {
  detectedMaterial: string;
  resinCode?: string;
  confidenceLevel: ScanConfidenceLevel;
  itemDescription: string;
  explanation: string;
  disposalGuidance: string;
  recommendedAlternative: string;
  visibleSymbolFound: boolean;
  isPlastic: boolean;
  requiresSeparation?: boolean;
  notes?: string;
}

export interface PlasticScanRecord {
  id: string;
  userId: string;
  timestamp: number;
  imageUrl?: string;
  imagePath?: string;
  detectedItem: string;
  detectedPlasticType: string;
  resinCode?: string;
  confidenceLevel: ScanConfidenceLevel;
  explanation: string;
  disposalGuidance: string;
  recommendedAlternative: string;
  userCorrectedType?: string;
  actionTaken?: PlasticAction;
}
