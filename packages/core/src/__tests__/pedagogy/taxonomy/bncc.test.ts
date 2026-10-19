import { describe, expect, it } from "bun:test";
import { bnccSkillBandList, isBnccSkillOfGrade } from "#src/pedagogy/taxonomy/bncc.ts";

describe("isBnccSkillOfGrade", () => {
  it("aceita o primeiro e o último código de cada faixa no ano e na disciplina dela", () => {
    for (const band of bnccSkillBandList) {
      const lastCode = `${band.prefix}${String(band.lastNumber).padStart(2, "0")}`;
      for (const grade of band.gradeList) {
        expect(isBnccSkillOfGrade(`${band.prefix}01`, grade, band.subject)).toBe(true);
        expect(isBnccSkillOfGrade(lastCode, grade, band.subject)).toBe(true);
      }
    }
  });

  it("recusa número fora da faixa, ano errado, disciplina errada e formato inválido", () => {
    expect(isBnccSkillOfGrade("EF04MA28", "4", "math")).toBe(true);
    expect(isBnccSkillOfGrade("EF04MA29", "4", "math")).toBe(false);
    expect(isBnccSkillOfGrade("EF04MA00", "4", "math")).toBe(false);
    expect(isBnccSkillOfGrade("EF05MA01", "4", "math")).toBe(false);
    expect(isBnccSkillOfGrade("EF35LP03", "6", "portuguese")).toBe(false);
    expect(isBnccSkillOfGrade("EF69LP56", "5", "portuguese")).toBe(false);
    expect(isBnccSkillOfGrade("EF06MA01", "6", "portuguese")).toBe(false);
    expect(isBnccSkillOfGrade("EF89LP01", "7", "portuguese")).toBe(false);
    expect(isBnccSkillOfGrade("EF04MA1", "4", "math")).toBe(false);
    expect(isBnccSkillOfGrade("EF04MA1x", "4", "math")).toBe(false);
  });

  it("cobre os quatro anos nas duas disciplinas", () => {
    for (const subject of ["math", "portuguese"] as const) {
      for (const grade of ["4", "5", "6", "7"] as const) {
        expect(
          bnccSkillBandList.some(
            (band) => band.subject === subject && band.gradeList.includes(grade),
          ),
        ).toBe(true);
      }
    }
  });
});
