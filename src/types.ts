export type Entry = { name: string; path: string; is_dir: boolean; size: number; modified: number | null };
export type Project = { name: string; path: string; stack: string; marker: string };
export type TreeEntry = { name: string; path: string; is_dir: boolean; size: number; children: TreeEntry[] };
export type SearchHit = { name: string; path: string; is_dir: boolean; size: number; modified: number | null };
export type DiskInfo = { name: string; mount: string; total: number; available: number };
export type ComponentsSnapshot = { cpu: number; memory_total: number; memory_used: number; disks: DiskInfo[] };
export type Location = { name: string; path: string; icon: string; group: string };
