/// <reference types="vite/client" />

declare const __SIMPLEFRONT_SIMULATION_BUILD__: string;

declare module "*.bin" {
  const binContent: string;
  export default binContent;
}

declare module "*.md" {
  const mdContent: string;
  export default mdContent;
}

declare module "*.html" {
  const htmlContent: string;
  export default htmlContent;
}

declare module "*.xml" {
  const xmlContent: string;
  export default xmlContent;
}

declare module "*.txt" {
  const txtContent: string;
  export default txtContent;
}

declare module "*.txt?raw" {
  const txtRawContent: string;
  export default txtRawContent;
}

declare module "*.webp" {
  const webpContent: string;
  export default webpContent;
}
