// Аватар-узор из ключа (или старого id): симметричная сетка 5×5.
// Старые аватары были ссылками на CDN соцсетей и почти все умерли.

function fnv(s: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function Avatar({ seed, size = 20 }: { seed: string; size?: number }) {
  const bits = fnv(seed, 1);
  const hue = fnv(seed, 2) % 360;
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((bits >> (y * 3 + x)) & 1) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  return (
    <svg class="avatar" width={size} height={size} viewBox="-0.5 -0.5 6 6" aria-hidden="true">
      <rect x="-0.5" y="-0.5" width="6" height="6" fill="#f2f2f2" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={`hsl(${hue} 45% 45%)`} />
      ))}
    </svg>
  );
}
