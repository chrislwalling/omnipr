export type ScoreTier = 'High' | 'Medium' | 'Low' | 'Discard';

export interface ArticleInput {
  headline: string;
  url: string;
  outlet: string;
  author: string;
  publishDate: string;
  uvm: string;
}

export interface ScoredArticle {
  headline: string;
  url: string;
  outlet: string;
  author: string;
  publishDate: string;
  uvm: string;
  scoreTier: ScoreTier;
  articleType: string;
  competitorProperty: string;
  scoringExplanation: string;
  pitchAngle: string;
  syndicationCount: number;
  knownContact: boolean;
  isCanonical: boolean;
}

export interface MediaContact {
  outlet: string;
  first: string;
  last: string;
  contact: string;
  newContact: string;
  sourceArticleUrl: string;
  competitorPropertyCovered: string;
  pitchAngle: string;
  dateAdded: string;
  rowIndex?: number;
}

export interface SavedPitch {
  journalistFirst: string;
  journalistLast: string;
  outlet: string;
  omniProperty: string;
  subjectLine: string;
  body: string;
  dateSaved: string;
  status: string;
  rowIndex?: number;
}

export type PitchStatus = 'Draft' | 'Sent' | 'Followed Up' | 'Responded' | 'Closed';

export interface ScoringCorrection {
  headline: string;
  articleUrl: string;
  originalScore: string;
  correctedScore: string;
  reason: string;
  timestamp: string;
}

export interface ConnectionStatus {
  configured: boolean;
  reachable: boolean;
  error: string | null;
}

export interface AllConnectionStatus {
  googleSheets: ConnectionStatus;
  claude: ConnectionStatus;
  slack: ConnectionStatus;
}

export interface PitchContext {
  journalistName: string;
  outlet: string;
  competitorProperty: string;
  articleHeadline: string;
  articleUrl: string;
  pitchAngle: string;
}
