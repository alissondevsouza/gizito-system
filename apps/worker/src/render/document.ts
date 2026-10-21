export type KitItemAttribute = "data-kit-item" | "data-kit-answer";

export type RenderDocument = {
  readonly html: string;
  readonly headerHtml: string;
  readonly footerHtml: string;
  readonly itemAttribute: KitItemAttribute;
  readonly expectedItemIdList: readonly string[];
};
