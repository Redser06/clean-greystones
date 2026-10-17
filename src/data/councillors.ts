import type { Councillor } from '../types';

/** Greystones Municipal District councillors. Emails kept from the existing app. */
export const GREYSTONES_COUNCILLORS: Councillor[] = [
  { id: 'cllr-stokes', name: 'Cllr Stephen Stokes', email: 'sstokes@wicklowcoco.ie' },
  { id: 'cllr-scott', name: 'Cllr Lourda Scott', email: 'lscott@wicklowcoco.ie' },
  { id: 'cllr-finn', name: 'Cllr Orla Finn', email: 'ofinn@wicklowcoco.ie' },
  { id: 'cllr-fortune', name: 'Cllr Tom Fortune', email: 'tfortune@wicklowcoco.ie' },
  { id: 'cllr-gaskin', name: 'Cllr Louise Fenelon Gaskin', email: 'lfenelongaskin@wicklowcoco.ie' },
  { id: 'cllr-barry', name: 'Cllr Mark Barry', email: 'mbarry@wicklowcoco.ie' },
];

export const ENVIRONMENT_OFFICE_EMAIL = 'envcomplaints@wicklowcoco.ie';

export const COUNCILLOR_EMAILS = GREYSTONES_COUNCILLORS.map((councillor) => councillor.email);
