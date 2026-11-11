declare module "gltf-validator" {
  interface Message {
    code: string;
    message: string;
    severity: 0 | 1 | 2 | 3;
    pointer?: string;
  }
  interface Report {
    issues: { numErrors: number; numWarnings: number; messages: Message[] };
  }
  const validator: {
    validateBytes(data: Uint8Array, options?: { maxIssues?: number }): Promise<Report>;
  };
  export default validator;
}
