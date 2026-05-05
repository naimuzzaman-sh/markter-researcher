type QuestionCategory =
  | 'background'
  | 'usage'
  | 'pain-points'
  | 'value-proposition'
  | 'competitor'
  | 'pricing';

type ResearchQuestion = {
  id: string;
  text: string;
  followUp: string;
  category: QuestionCategory;
};

type IcpAttribute = {
  name: string;
  value: string;
};

type Icp = {
  audience: string;
  problem: string;
  attributes: IcpAttribute[];
  geography?: string;
  signals?: string[];
  excludes?: string[];
  summary: string;
};

type ResearchContext = {
  company: {
    name: string;
    industry: string;
    description: string;
  };
  product: {
    name: string;
    description: string;
    keyFeatures: string[];
    icp: Icp;
  };
  research: {
    objective: string;
    questions: ResearchQuestion[];
    concerns: string[];
    productMarketFit: {
      hypothesis: string;
      signals: string[];
    };
  };
  interviewSettings: {
    maxDurationMinutes: number;
    tone: string;
    language: string;
  };
};

export type {
  ResearchContext,
  ResearchQuestion,
  QuestionCategory,
  Icp,
  IcpAttribute,
};
