export type MovieDraft = {
  title: string;
  durationMinutes: number;
  distributorName: string;
  distributorId: string | null;
};

export const emptyMovieForm: MovieDraft = {
  title: "",
  durationMinutes: 100,
  distributorName: "",
  distributorId: null
};

export type MovieSearchState = "idle" | "searching" | "error";

export type MovieSearchResult = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  year: string | null;
  durationMinutes: number | null;
};

export type MovieSearchResponse = {
  results?: MovieSearchResult[];
  error?: string;
};
