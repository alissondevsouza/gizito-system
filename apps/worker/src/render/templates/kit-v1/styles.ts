export const kitV1Stylesheet = `
:root {
  --color-board: #214c45;
  --color-ink: #22352f;
  --color-muted: #54635f;
  --color-line: #d8d5c9;
}
* { box-sizing: border-box; }
html {
  font-family: "Nunito Sans", sans-serif;
  font-size: 12pt;
  line-height: 1.4;
  color: var(--color-ink);
  background: #ffffff;
}
body { margin: 0; overflow-wrap: anywhere; }
h1, h2, h3 { color: var(--color-board); line-height: 1.2; margin: 0; break-after: avoid; }
h1 { font-size: 20pt; font-weight: 800; margin: 0 0 5mm; }
h2 { font-size: 16pt; font-weight: 800; margin: 5mm 0 2.5mm; }
h3 { font-size: 12pt; font-weight: 800; margin: 3mm 0 1.5mm; }
p { margin: 0 0 2mm; }
ul, ol { margin: 0 0 2mm; padding-left: 6mm; }
li { margin: 0 0 1mm; }
.label { font-weight: 800; }
.katex { font-size: 1.1em; }
.katex .katex-base:has(.mfrac) { margin: 0.3em 0; }
.section-break { break-before: page; }
.cover-main { display: flex; align-items: flex-start; gap: 8mm; }
.cover-text { flex: 1; }
.cover-subject { font-size: 20pt; }
.cover-grade { font-size: 14pt; font-weight: 700; margin: 0 0 6mm; }
.cover-logo { width: 66mm; height: auto; flex: none; }
.cover-box { border: 1pt solid var(--color-board); border-radius: 3mm; padding: 4mm 5mm; margin: 8mm 0 6mm; }
.cover-box h2 { margin-top: 0; }
.cover-date { font-weight: 700; }
.sample-mark { border: 1pt dashed var(--color-board); border-radius: 3mm; padding: 2.5mm 4mm; margin: 6mm 0 0; }
.sample-label { font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 1.5mm; }
.cover-short .sample-mark { margin: 3mm 0 0; padding: 2mm 4mm; }
.ai-note { font-size: 9pt; color: var(--color-muted); border-top: 0.5pt solid var(--color-line); padding-top: 2mm; margin-top: 8mm; }
.cover-short { border-bottom: 1pt solid var(--color-line); padding: 0 0 4mm; margin: 0 0 7mm; }
.cover-short .cover-main { align-items: center; }
.cover-short h1 { margin-bottom: 1.5mm; }
.cover-short .cover-grade { font-size: 12pt; margin: 0 0 2mm; }
.cover-short .cover-topics { margin-bottom: 2mm; }
.cover-short .cover-date { margin: 0; }
.cover-short .cover-logo { width: 46mm; }
.cover-short .cover-box { margin: 3mm 0 0; padding: 2.5mm 4mm; }
.cover-short .cover-box p { margin: 0; }
.cover-short .ai-note { margin-top: 3mm; }
.review-topic { margin: 0 0 6mm; }
.review-topic h2 { margin-top: 0; }
.key-points { border-left: 2pt solid var(--color-board); padding: 1mm 0 1mm 4mm; margin: 3mm 0 0; break-inside: avoid; }
.key-points h3 { margin-top: 0; }
.example { border: 1pt solid var(--color-line); border-radius: 3mm; padding: 4mm 5mm; margin: 0 0 6mm; break-inside: avoid; }
.example h2 { margin-top: 0; }
.statement { margin: 0 0 2mm; }
.kit-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 2mm 0 3mm; font-size: 11pt; }
.kit-table th, .kit-table td { border: 0.75pt solid var(--color-muted); padding: 1.2mm 2mm; text-align: left; vertical-align: top; }
.kit-table th { font-weight: 800; }
.tip { display: flex; align-items: center; gap: 5mm; border: 1pt solid var(--color-board); border-radius: 3mm; padding: 3mm 5mm; margin: 0 0 6mm; break-inside: avoid; }
.tip img { height: 30mm; width: auto; flex: none; }
.tip h2 { margin-top: 0; }
.base-text { border-left: 2pt solid var(--color-board); padding: 1mm 0 1mm 4mm; margin: 0 0 7mm; }
.base-text h2 { margin-top: 0; }
.base-text-ref { font-size: 10pt; font-weight: 800; color: var(--color-muted); margin: 0 0 1mm; }
.question, .answer { display: flex; gap: 3mm; margin: 0 0 6mm; break-inside: avoid; }
.question-number { flex: none; width: 8mm; height: 8mm; border: 1pt solid var(--color-board); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; color: var(--color-board); }
.question-body, .answer-body { flex: 1; min-width: 0; }
.options { list-style: none; padding: 0; margin: 2mm 0 0; }
.options li { display: flex; align-items: baseline; gap: 2mm; margin: 0 0 1.5mm; }
.options.compact { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6mm; }
.option-label { flex: none; width: 6mm; height: 6mm; border: 0.75pt solid var(--color-ink); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10pt; font-weight: 800; }
.work-space { border: 0.75pt solid var(--color-muted); border-radius: 2mm; padding: 1mm 2mm; margin: 2mm 0 0; font-size: 9pt; color: var(--color-muted); }
.work-space.open { height: 30mm; }
.work-space.choice { height: 20mm; }
.answer-line { display: flex; align-items: flex-end; gap: 2mm; margin: 3mm 0 0; }
.answer-line .line { flex: 1; height: 6mm; border-bottom: 0.75pt solid var(--color-muted); }
.writing-lines { margin: 2mm 0 0; }
.writing-lines .line { height: 8mm; border-bottom: 0.75pt solid var(--color-muted); }
.exam-header { border: 1.25pt solid var(--color-ink); border-radius: 2mm; padding: 3mm 5mm; margin: 0 0 7mm; }
.exam-header h1 { margin-bottom: 3mm; }
.exam-fields { display: flex; gap: 6mm; align-items: flex-end; }
.exam-field { display: flex; align-items: flex-end; gap: 2mm; }
.exam-field.name { flex: 1; }
.exam-field .line { flex: 1; min-width: 22mm; height: 6mm; border-bottom: 0.75pt solid var(--color-muted); }
.exam-instructions { margin: 3mm 0 0; font-size: 11pt; }
.answer-main { font-weight: 800; margin: 0 0 1.5mm; }
.steps { margin: 1mm 0 2mm; }
.accepted-item + .accepted-item::before { content: " · "; color: var(--color-muted); font-weight: 800; }
.answer-key { font-size: 11pt; line-height: 1.35; }
.answer-key .answer { margin-bottom: 4.5mm; }
.evidence { border-left: 1.5pt solid var(--color-muted); padding-left: 3mm; }
`;
