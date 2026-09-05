import type {
  JournalEntry,
  ImpactMetrics,
  ImpactAdjustment,
  MonthlyImpact,
  MilestoneAchievement,
  ImpactCategoryKey,
} from '../types';

export const MILESTONES: Array<{ threshold: number; title: string; description: string }> = [
  { threshold: 10, title: 'Seedling Starter', description: 'Avoided your first 10 single-use plastic items.' },
  { threshold: 25, title: 'Sprout Guardian', description: 'Surpassed 25 avoided plastic products with conscious choices.' },
  { threshold: 50, title: 'Habit Pioneer', description: 'Reached 50 plastic items avoided—a true daily habit.' },
  { threshold: 100, title: 'Centurion of Change', description: 'Over 100 plastics avoided! Impressive dedication.' },
  { threshold: 250, title: 'Eco Champion', description: 'Prevented 250 plastic items from ever entering the waste stream.' },
  { threshold: 500, title: 'Plastic-Free Master', description: 'An outstanding milestone of 500 avoided plastic items.' },
];

export function categorizeAvoidedItem(name: string, category?: string): ImpactCategoryKey {
  const text = `${name} ${category || ''}`.toLowerCase();

  if (text.includes('bag') || text.includes('tote') || text.includes('carrier') || text.includes('sack')) {
    return 'bags';
  }
  if (text.includes('bottle') || text.includes('flask') || text.includes('jug')) {
    return 'bottles';
  }
  if (
    text.includes('container') ||
    text.includes('box') ||
    text.includes('takeout') ||
    text.includes('tray') ||
    text.includes('clam') ||
    text.includes('tub')
  ) {
    return 'containers';
  }
  if (text.includes('cup') || text.includes('mug') || text.includes('tumbler') || text.includes('straw') || text.includes('lid')) {
    return 'cups';
  }
  return 'other';
}

export function calculateImpactMetrics(
  entries: JournalEntry[],
  adjustments: ImpactAdjustment[] = []
): ImpactMetrics {
  let bags = 0;
  let bottles = 0;
  let containers = 0;
  let cups = 0;
  let other = 0;
  let reused = 0;

  // Process all historical entries
  for (const entry of entries) {
    for (const item of entry.items || []) {
      const qty = Math.max(1, item.quantity || 1);
      if (item.action === 'avoided' || item.action === 'replaced') {
        const cat = categorizeAvoidedItem(item.name, item.category);
        switch (cat) {
          case 'bags':
            bags += qty;
            break;
          case 'bottles':
            bottles += qty;
            break;
          case 'containers':
            containers += qty;
            break;
          case 'cups':
            cups += qty;
            break;
          default:
            other += qty;
            break;
        }
      } else if (item.action === 'reused') {
        reused += qty;
      }
    }
  }

  // Apply user adjustments / manual corrections
  for (const adj of adjustments) {
    if (adj.action === 'reused') {
      reused = Math.max(0, reused + adj.quantityDelta);
    } else {
      switch (adj.categoryKey) {
        case 'bags':
          bags = Math.max(0, bags + adj.quantityDelta);
          break;
        case 'bottles':
          bottles = Math.max(0, bottles + adj.quantityDelta);
          break;
        case 'containers':
          containers = Math.max(0, containers + adj.quantityDelta);
          break;
        case 'cups':
          cups = Math.max(0, cups + adj.quantityDelta);
          break;
        case 'other':
        default:
          other = Math.max(0, other + adj.quantityDelta);
          break;
      }
    }
  }

  const totalItemsAvoided = bags + bottles + containers + cups + other;

  return {
    plasticBagsAvoided: bags,
    plasticBottlesAvoided: bottles,
    plasticContainersAvoided: containers,
    disposableCupsAvoided: cups,
    otherItemsAvoided: other,
    plasticItemsReused: reused,
    totalItemsAvoided,
  };
}

export function calculateMilestoneProgress(totalAvoided: number): {
  currentMilestone: MilestoneAchievement | null;
  nextMilestone: MilestoneAchievement | null;
  progressPercent: number;
  itemsToNext: number;
  allMilestones: MilestoneAchievement[];
} {
  const allMilestones: MilestoneAchievement[] = MILESTONES.map((m) => ({
    ...m,
    achieved: totalAvoided >= m.threshold,
  }));

  const achievedMilestones = allMilestones.filter((m) => m.achieved);
  const currentMilestone = achievedMilestones.length > 0 ? achievedMilestones[achievedMilestones.length - 1] : null;

  const upcomingMilestones = allMilestones.filter((m) => !m.achieved);
  const nextMilestone = upcomingMilestones.length > 0 ? upcomingMilestones[0] : null;

  if (!nextMilestone) {
    return {
      currentMilestone,
      nextMilestone: null,
      progressPercent: 100,
      itemsToNext: 0,
      allMilestones,
    };
  }

  const previousThreshold = currentMilestone ? currentMilestone.threshold : 0;
  const range = nextMilestone.threshold - previousThreshold;
  const progressInRange = Math.max(0, totalAvoided - previousThreshold);
  const progressPercent = Math.min(100, Math.round((progressInRange / range) * 100));
  const itemsToNext = Math.max(0, nextMilestone.threshold - totalAvoided);

  return {
    currentMilestone,
    nextMilestone,
    progressPercent,
    itemsToNext,
    allMilestones,
  };
}

export function calculateMonthlyImpact(
  entries: JournalEntry[],
  adjustments: ImpactAdjustment[] = []
): MonthlyImpact {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  let currentMonthAvoided = 0;
  let currentMonthReused = 0;
  const categoryCounts: Record<string, number> = {
    'Plastic Bags': 0,
    'Plastic Bottles': 0,
    'Food Containers': 0,
    'Disposable Cups': 0,
    'Other Items': 0,
  };

  let prevMonthAvoided = 0;
  let hasPrevMonthEntries = false;

  for (const entry of entries) {
    const entryMonthKey = entry.date ? entry.date.slice(0, 7) : '';

    if (entryMonthKey === currentMonthKey) {
      for (const item of entry.items || []) {
        const qty = Math.max(1, item.quantity || 1);
        if (item.action === 'avoided' || item.action === 'replaced') {
          currentMonthAvoided += qty;
          const cat = categorizeAvoidedItem(item.name, item.category);
          switch (cat) {
            case 'bags':
              categoryCounts['Plastic Bags'] += qty;
              break;
            case 'bottles':
              categoryCounts['Plastic Bottles'] += qty;
              break;
            case 'containers':
              categoryCounts['Food Containers'] += qty;
              break;
            case 'cups':
              categoryCounts['Disposable Cups'] += qty;
              break;
            default:
              categoryCounts['Other Items'] += qty;
              break;
          }
        } else if (item.action === 'reused') {
          currentMonthReused += qty;
        }
      }
    } else if (entryMonthKey === prevMonthKey) {
      hasPrevMonthEntries = true;
      for (const item of entry.items || []) {
        if (item.action === 'avoided' || item.action === 'replaced') {
          prevMonthAvoided += Math.max(1, item.quantity || 1);
        }
      }
    }
  }

  // Adjustments made in current month
  for (const adj of adjustments) {
    const adjMonthKey = new Date(adj.timestamp).toISOString().slice(0, 7);
    if (adjMonthKey === currentMonthKey) {
      if (adj.action === 'reused') {
        currentMonthReused = Math.max(0, currentMonthReused + adj.quantityDelta);
      } else {
        currentMonthAvoided = Math.max(0, currentMonthAvoided + adj.quantityDelta);
      }
    }
  }

  // Determine top category this month
  let mostAvoidedCategory = 'None yet';
  let maxCatCount = 0;
  for (const [catName, count] of Object.entries(categoryCounts)) {
    if (count > maxCatCount) {
      maxCatCount = count;
      mostAvoidedCategory = catName;
    }
  }

  const monthName = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const differenceVsPrevMonth = currentMonthAvoided - prevMonthAvoided;

  return {
    monthKey: currentMonthKey,
    monthName,
    totalAvoided: currentMonthAvoided,
    totalReused: currentMonthReused,
    mostAvoidedCategory: maxCatCount > 0 ? mostAvoidedCategory : 'Diverse items',
    previousMonthAvoided: prevMonthAvoided,
    differenceVsPrevMonth,
    hasPreviousMonthData: hasPrevMonthEntries,
  };
}
