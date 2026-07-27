import { createContext, useContext, useMemo, useState } from "react";

interface SearchContextValue {
  search: string;
  setSearch: (value: string) => void;
}

// Default value (not null) so useSearch() is safe to call with no provider mounted -- native
// screens and tests never wrap one, and should just see an always-empty, no-op search rather
// than needing every call site to guard against a missing provider.
const SearchContext = createContext<SearchContextValue>({ search: "", setSearch: () => {} });

export function useSearch(): SearchContextValue {
  return useContext(SearchContext);
}

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const value = useMemo(() => ({ search, setSearch }), [search]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}
