// Adaptive layout engine — chooses how a product collection is presented
// from product count, content length and template. Admin override always wins.
export type LayoutMode = 'featured' | 'cards' | 'grid' | 'catalog';

export interface LayoutDecision {
  mode: LayoutMode;
  colClass: string; // bootstrap column class for each card
  toolbar: boolean; // sort / filter bar
  search: boolean; // free-text search
  pageSize: number; // 0 = no pagination
  compare: boolean; // comparison table under cards
  expandable: boolean; // collapse long feature lists / descriptions
  reason: string;
}

export function chooseLayout(opts: { count: number; override?: string; maxFeatures?: number; maxDescLen?: number; template?: string }): LayoutDecision {
  const { count, maxFeatures = 0, maxDescLen = 0, template = 'plan-card' } = opts;
  const override = opts.override && opts.override !== 'auto' ? (opts.override as LayoutMode) : undefined;
  let mode: LayoutMode = override ?? (count <= 1 ? 'featured' : count <= 4 ? 'cards' : count <= 12 ? 'grid' : 'catalog');
  const reason = override ? `admin override: ${override}` : `${count} product(s) → ${mode}`;
  const expandable = maxFeatures > 8 || maxDescLen > 600;
  if (template === 'server-row') {
    return { mode, colClass: '', toolbar: count > 4, search: count > 12, pageSize: 0, compare: false, expandable: false, reason };
  }
  const colClass =
    mode === 'featured' ? 'col-xl-8 col-lg-10' :
    mode === 'cards' ? (count === 2 ? 'col-lg-5 col-md-6' : count === 4 ? 'col-xl-3 col-lg-6 col-md-6' : 'col-lg-4 col-md-6 col-sm-8') :
    'col-xl-3 col-lg-4 col-md-6';
  return {
    mode, colClass,
    toolbar: mode === 'grid' || mode === 'catalog',
    search: mode === 'catalog',
    pageSize: mode === 'catalog' ? 12 : 0,
    compare: mode === 'cards' && count >= 2,
    expandable, reason,
  };
}
