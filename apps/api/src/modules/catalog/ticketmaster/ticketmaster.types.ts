export interface TicketmasterImage {
  url: string;
  width?: number;
  height?: number;
  fallback?: boolean;
}

export interface TicketmasterClassificationLevel {
  id?: string;
  name?: string;
}

export interface TicketmasterClassification {
  segment?: TicketmasterClassificationLevel;
  genre?: TicketmasterClassificationLevel;
  subGenre?: TicketmasterClassificationLevel;
}

export interface TicketmasterAttraction {
  id: string;
  name: string;
  description?: string;
  additionalInfo?: string;
  images?: TicketmasterImage[];
  classifications?: TicketmasterClassification[];
}

export interface TicketmasterPageMetadata {
  size: number;
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface TicketmasterAttractionSearchResponse {
  _embedded?: {
    attractions: TicketmasterAttraction[];
  };
  page: TicketmasterPageMetadata;
}

export interface TicketmasterEvent {
  _embedded?: {
    attractions?: TicketmasterAttraction[];
  };
}

export interface TicketmasterEventSearchResponse {
  _embedded?: {
    events: TicketmasterEvent[];
  };
  page: TicketmasterPageMetadata;
}
