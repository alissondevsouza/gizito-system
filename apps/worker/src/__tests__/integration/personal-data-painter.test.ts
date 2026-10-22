import { afterAll, describe, expect, it } from "bun:test";
import { computeContentHash } from "@gizito/integrations";
import sharp from "sharp";
import { createPersonalDataPainter } from "#src/regression/personal-data-painter.ts";

const painter = createPersonalDataPainter();

afterAll(async () => {
  await painter.close();
});

const label = {
  lineList: ["Nome: Nome Inventado Teste", "Escola: Escola Inventada", "Tel.: (11) 91234-5678"],
  leftPercent: 10,
  topPercent: 60,
};

async function blankPage(): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width: 480, height: 360, channels: 3, background: { r: 250, g: 250, b: 245 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

async function inkPixelCount(image: Uint8Array): Promise<number> {
  const { data } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let index = 0; index < data.length; index += 3) {
    const [red = 0, green = 0, blue = 0] = [data[index], data[index + 1], data[index + 2]];
    if (blue - red > 40 && blue - green > 20) count += 1;
  }
  return count;
}

describe("variação com dado pessoal pelo Chromium (spec F1-10, RF-03)", () => {
  it("escreve o texto em azul sobre a página, no tamanho da imagem, sempre com o mesmo resultado", async () => {
    const page = await blankPage();
    const first = await painter.paint(page, label);
    const second = await painter.paint(page, label);
    const metadata = await sharp(first).metadata();
    expect([metadata.width, metadata.height, metadata.format]).toEqual([480, 360, "png"]);
    expect(await inkPixelCount(page)).toBe(0);
    expect(await inkPixelCount(first)).toBeGreaterThan(200);
    expect(computeContentHash(second)).toBe(computeContentHash(first));
  });
});
