/**
 * "Download all reports": each report component lists its downloads in a slot; the Reports page
 * mounts every report off-screen inside a provider and runs the slots one after another.
 * Outside that provider the hook does nothing.
 */
import { createContext, useContext, useEffect, useRef, type MutableRefObject } from 'react';

export interface BulkJob {
  label: string;
  run: () => Promise<void>;
}
export type BulkRegistry = Map<string, MutableRefObject<BulkJob[]>>;
export const BulkContext = createContext<BulkRegistry | null>(null);

/** Returns a slot; assign `slot.current = [...]` after the download functions are defined. */
export function useBulkDownloads(id: string): MutableRefObject<BulkJob[]> {
  const reg = useContext(BulkContext);
  const slot = useRef<BulkJob[]>([]);
  useEffect(() => {
    if (!reg) return;
    reg.set(id, slot);
    return () => {
      reg.delete(id);
    };
  }, [reg, id]);
  return slot;
}
