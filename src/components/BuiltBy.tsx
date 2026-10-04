import { BUILT_BY_TEXT } from '../config/credits';

/** Small "Built by …" credit at the bottom of a page. */
export function BuiltBy({ className = '' }: { className?: string }) {
  return <div className={`built-by ${className}`}>{BUILT_BY_TEXT}</div>;
}
