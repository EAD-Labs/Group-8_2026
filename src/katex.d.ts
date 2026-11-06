// Minimal types for the part of KaTeX the lecture board uses.
declare module "katex" {
  const katex: {
    renderToString(
      tex: string,
      options?: {
        displayMode?: boolean;
        throwOnError?: boolean;
        strict?: string | boolean;
        trust?: boolean;
      },
    ): string;
  };
  export default katex;
}
