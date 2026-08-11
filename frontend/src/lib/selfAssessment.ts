export interface SelfAssessmentQuestion {
  key: string;
  question: string;
  options: { value: string; label: string }[];
}

export const SELF_ASSESSMENT_QUESTIONS: SelfAssessmentQuestion[] = [
  {
    key: "collaboration_style",
    question: "Ekip içinde nasıl çalışmayı tercih edersin?",
    options: [
      { value: "independent", label: "Bağımsız çalışıp sonucu paylaşmayı tercih ederim" },
      { value: "frequent_feedback", label: "Sık sık geri bildirim alarak ilerlemeyi tercih ederim" },
      { value: "pair", label: "Görevleri birlikte, eş zamanlı yürütmeyi tercih ederim" },
    ],
  },
  {
    key: "problem_solving_style",
    question: "Yeni bir problemle karşılaştığında ilk refleksin ne olur?",
    options: [
      { value: "dive_in", label: "Hemen çözüm denemeye başlarım" },
      { value: "plan_first", label: "Önce planlayıp adım adım ilerlerim" },
      { value: "ask_others", label: "Başkalarına danışarak fikir alırım" },
    ],
  },
  {
    key: "deadline_style",
    question: "Sıkı bir teslim tarihin olduğunda nasıl davranırsın?",
    options: [
      { value: "prioritize_fast", label: "Hızlıca önceliklendirip ilerlerim" },
      { value: "flag_early", label: "Riskleri erkenden işaret ederim" },
      { value: "extra_hours", label: "Ekstra zaman ayırıp yetiştiririm" },
    ],
  },
];

export function selfAssessmentLabel(key: string, value: string): string | null {
  const question = SELF_ASSESSMENT_QUESTIONS.find((q) => q.key === key);
  return question?.options.find((option) => option.value === value)?.label ?? null;
}
