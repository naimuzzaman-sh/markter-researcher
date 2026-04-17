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
    targetAudience: string;
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

export type { ResearchContext, ResearchQuestion, QuestionCategory };
