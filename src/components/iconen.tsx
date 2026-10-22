const basis = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const KlokIcoon = () => (
  <svg {...basis} width={13} height={13}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const HerhaalIcoon = () => (
  <svg {...basis} width={13} height={13}>
    <path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" />
  </svg>
);
export const PlusIcoon = () => (<svg {...basis} width={16} height={16}><path d="M12 5v14M5 12h14" /></svg>);
export const PijlLinks = () => (<svg {...basis} width={16} height={16}><path d="M15 18l-6-6 6-6" /></svg>);
export const PijlRechts = () => (<svg {...basis} width={16} height={16}><path d="M9 18l6-6-6-6" /></svg>);
export const KruisIcoon = () => (<svg {...basis} width={16} height={16}><path d="M18 6L6 18M6 6l12 12" /></svg>);
export const PinIcoon = () => (
  <svg {...basis} width={13} height={13}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" />
  </svg>
);
