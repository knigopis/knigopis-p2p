import { renderSVG } from 'uqr';

export function QR({ text }: { text: string }) {
  return <div class="qr" dangerouslySetInnerHTML={{ __html: renderSVG(text, { border: 1 }) }} />;
}
