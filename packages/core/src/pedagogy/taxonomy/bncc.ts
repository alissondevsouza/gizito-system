import type { Grade, Subject } from "#src/enums.ts";

export type BnccSkillBand = {
  readonly prefix: string;
  readonly subject: Subject;
  readonly gradeList: readonly Grade[];
  readonly lastNumber: number;
};

export const bnccSkillBandList: readonly BnccSkillBand[] = [
  { prefix: "EF04MA", subject: "math", gradeList: ["4"], lastNumber: 28 },
  { prefix: "EF05MA", subject: "math", gradeList: ["5"], lastNumber: 25 },
  { prefix: "EF06MA", subject: "math", gradeList: ["6"], lastNumber: 34 },
  { prefix: "EF07MA", subject: "math", gradeList: ["7"], lastNumber: 37 },
  { prefix: "EF15LP", subject: "portuguese", gradeList: ["4", "5"], lastNumber: 19 },
  { prefix: "EF35LP", subject: "portuguese", gradeList: ["4", "5"], lastNumber: 31 },
  { prefix: "EF04LP", subject: "portuguese", gradeList: ["4"], lastNumber: 27 },
  { prefix: "EF05LP", subject: "portuguese", gradeList: ["5"], lastNumber: 28 },
  { prefix: "EF69LP", subject: "portuguese", gradeList: ["6", "7"], lastNumber: 56 },
  { prefix: "EF67LP", subject: "portuguese", gradeList: ["6", "7"], lastNumber: 38 },
  { prefix: "EF06LP", subject: "portuguese", gradeList: ["6"], lastNumber: 12 },
  { prefix: "EF07LP", subject: "portuguese", gradeList: ["7"], lastNumber: 14 },
];

const BNCC_SKILL_PREFIX_LENGTH = 6;

export function isBnccSkillOfGrade(code: string, grade: Grade, subject: Subject): boolean {
  const band = bnccSkillBandList.find(
    (candidate) => candidate.prefix === code.slice(0, BNCC_SKILL_PREFIX_LENGTH),
  );
  if (band === undefined || band.subject !== subject || !band.gradeList.includes(grade)) {
    return false;
  }
  const numberText = code.slice(BNCC_SKILL_PREFIX_LENGTH);
  if (!/^\d{2}$/.test(numberText)) return false;
  const number = Number(numberText);
  return number >= 1 && number <= band.lastNumber;
}
