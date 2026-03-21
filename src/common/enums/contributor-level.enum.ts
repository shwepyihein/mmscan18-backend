export enum ContributorLevel {
  BRONZE = 'BRONZE',
  SILVER = 'SILVER',
  GOLD = 'GOLD',
  PLATINUM = 'PLATINUM',
  DIAMOND = 'DIAMOND',
}

// Level thresholds based on chapters translated
export const LEVEL_THRESHOLDS: Record<ContributorLevel, number> = {
  [ContributorLevel.BRONZE]: 0,
  [ContributorLevel.SILVER]: 10,
  [ContributorLevel.GOLD]: 50,
  [ContributorLevel.PLATINUM]: 100,
  [ContributorLevel.DIAMOND]: 250,
};

export function calculateLevel(chaptersTranslated: number): ContributorLevel {
  if (chaptersTranslated >= LEVEL_THRESHOLDS[ContributorLevel.DIAMOND]) {
    return ContributorLevel.DIAMOND;
  }
  if (chaptersTranslated >= LEVEL_THRESHOLDS[ContributorLevel.PLATINUM]) {
    return ContributorLevel.PLATINUM;
  }
  if (chaptersTranslated >= LEVEL_THRESHOLDS[ContributorLevel.GOLD]) {
    return ContributorLevel.GOLD;
  }
  if (chaptersTranslated >= LEVEL_THRESHOLDS[ContributorLevel.SILVER]) {
    return ContributorLevel.SILVER;
  }
  return ContributorLevel.BRONZE;
}
