import Link from "next/link";
import { PROVINCE_COORDS } from "@/modules/red/catalog";

// Mapa liviano de la Red (sin servicios externos ni teselas): contorno
// aproximado de la Argentina en SVG y un punto por estudio en el centro de su
// provincia. Si hay varios en la misma provincia, se reparten alrededor.

const K = 12;
const LNG0 = -74;
const LAT0 = -21.5;
const xy = (lat: number, lng: number) => [((lng - LNG0) * K).toFixed(1), ((LAT0 - lat) * K).toFixed(1)] as const;
const path = (pts: [number, number][]) => "M" + pts.map(([lng, lat]) => xy(lat, lng).join(",")).join(" L") + " Z";

const MAINLAND: [number, number][] = [
  [-65.7, -22.1], [-64.3, -22.8], [-62.8, -22.0], [-61.0, -23.6], [-58.0, -25.6], [-54.6, -25.6], [-53.7, -26.2], [-53.8, -27.2],
  [-55.7, -28.1], [-57.6, -30.2], [-58.2, -32.5], [-58.4, -34.0], [-57.2, -35.3], [-56.7, -36.4], [-57.6, -38.2], [-62.3, -38.8],
  [-62.1, -40.6], [-65.0, -40.8], [-64.4, -42.5], [-65.0, -45.0], [-67.5, -46.5], [-65.8, -47.9], [-68.4, -50.1], [-68.3, -52.4],
  [-71.9, -52.0], [-72.3, -51.0], [-73.4, -49.5], [-72.0, -47.7], [-71.7, -45.5], [-71.9, -43.5], [-71.6, -41.0], [-71.0, -39.0],
  [-70.5, -37.0], [-70.0, -35.0], [-69.8, -33.0], [-70.4, -31.0], [-69.6, -29.0], [-68.4, -27.0], [-67.7, -24.5], [-66.9, -22.1],
];
const FUEGO: [number, number][] = [[-68.6, -52.6], [-65.3, -54.8], [-66.4, -55.0], [-68.6, -54.9]];

export type MapStudio = { studioId: string; slug: string; name: string; province: string | null };

export function StudiosMap({ items }: { items: MapStudio[] }) {
  const byProvince = new Map<string, MapStudio[]>();
  const unplaced: MapStudio[] = [];
  for (const x of items) {
    if (x.province && x.province in PROVINCE_COORDS) byProvince.set(x.province, [...(byProvince.get(x.province) ?? []), x]);
    else unplaced.push(x);
  }
  const pins = [...byProvince.entries()].flatMap(([prov, list]) => {
    const [lat, lng] = PROVINCE_COORDS[prov as keyof typeof PROVINCE_COORDS];
    return list.map((x, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const r = list.length > 1 ? 0.6 : 0;
      const [cx, cy] = xy(lat + Math.sin(a) * r, lng + Math.cos(a) * r);
      return { ...x, cx, cy, prov };
    });
  });
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
      <svg viewBox={`0 0 ${(-53 - LNG0) * K} ${(LAT0 + 55.5) * K}`} role="img" aria-label={`Mapa de la Argentina con ${pins.length} estudios`} className="mx-auto w-full max-w-[320px]">
        <path d={path(MAINLAND)} className="fill-navy-soft stroke-line" strokeWidth={1.5} />
        <path d={path(FUEGO)} className="fill-navy-soft stroke-line" strokeWidth={1.5} />
        {pins.map((p) => (
          <Link key={p.studioId} href={`/red-contable/${p.slug}`} aria-label={`${p.name}, ${p.prov}`}>
            <title>{`${p.name} · ${p.prov}`}</title>
            <circle cx={p.cx} cy={p.cy} r={7} className="fill-rose-deep stroke-surface hover:fill-navy" strokeWidth={2} />
          </Link>
        ))}
      </svg>
      <div className="min-w-0">
        <ul className="grid gap-2">
          {[...byProvince.entries()]
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
            .map(([prov, list]) => (
              <li key={prov} className="rounded-md border border-line bg-surface p-3">
                <p className="text-meta text-muted">
                  {prov} · <span className="num">{list.length}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-ui">
                  {list.map((x) => (
                    <Link key={x.studioId} href={`/red-contable/${x.slug}`} className="text-ink underline-offset-4 hover:underline">
                      {x.name}
                    </Link>
                  ))}
                </p>
              </li>
            ))}
        </ul>
        {unplaced.length > 0 && (
          <p className="mt-3 text-meta text-muted">
            Sin provincia cargada:{" "}
            {unplaced.map((x, i) => (
              <span key={x.studioId}>
                {i > 0 && ", "}
                <Link href={`/red-contable/${x.slug}`} className="underline underline-offset-4">
                  {x.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
