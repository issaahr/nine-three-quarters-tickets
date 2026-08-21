export interface TmdbMovieSearchResult {
  id: number;
  title: string;
  overview?: string;
  poster_path?: string | null;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
}

export interface TmdbMovieSearchResponse {
  page: number;
  total_pages: number;
  results: TmdbMovieSearchResult[];
}

export type TmdbMovieDetails = TmdbMovieSearchResult;

export interface TmdbGenreListResponse {
  genres: Array<{ id: number; name: string }>;
}

export interface TmdbConfigurationResponse {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
  };
}
