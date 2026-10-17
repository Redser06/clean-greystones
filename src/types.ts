export type Impact = 'on_the_path' | 'stepped_in' | 'buggy' | 'wheelchair';

export interface Report {
  id: string;
  createdAt: string;
  lat: number;
  lng: number;
  impact: Impact | null;
}

export interface LitterBin {
  id: string;
  lat: number;
  lng: number;
}
