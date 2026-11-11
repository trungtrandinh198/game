/** URL công khai của một khóa object storage (`*_key`) qua CDN. */
export function cdnUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
}
