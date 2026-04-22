import dmcList from "./dmc-threads.json";

export type DmcEntry = { id: string; n: string; c: string };

const list = dmcList as DmcEntry[];

const byId = new Map<string, DmcEntry>(list.map((e) => [e.id, e]));

export function getDmcList(): readonly DmcEntry[] {
  return list;
}

export function getDmcById(id: string): DmcEntry | undefined {
  return byId.get(id);
}

export function dmcIdToColor(id: string): string {
  const e = byId.get(id);
  if (!e) return "#888888";
  return `#${e.c}`;
}
