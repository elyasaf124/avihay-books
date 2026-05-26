import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  emptyFilters,
  normalizeUnitFilterState,
  type UnitFilterState,
} from "../components/unit/UnitFilterBar";

interface StoreMapFilterContextValue {
  filters: UnitFilterState;
  setFilters: (next: UnitFilterState) => void;
  resetFilters: () => void;
}

const StoreMapFilterContext = createContext<StoreMapFilterContextValue | null>(null);

export function StoreMapFilterProvider({ children }: { children: ReactNode }): JSX.Element {
  const [filters, setFiltersState] = useState<UnitFilterState>(emptyFilters);

  const setFilters = useCallback((next: UnitFilterState) => {
    setFiltersState(normalizeUnitFilterState(next));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(emptyFilters);
  }, []);

  const value = useMemo(
    () => ({
      filters: normalizeUnitFilterState(filters),
      setFilters,
      resetFilters,
    }),
    [filters, setFilters, resetFilters],
  );

  return (
    <StoreMapFilterContext.Provider value={value}>{children}</StoreMapFilterContext.Provider>
  );
}

export function useStoreMapFilters(): StoreMapFilterContextValue {
  const ctx = useContext(StoreMapFilterContext);
  if (!ctx) {
    throw new Error("useStoreMapFilters must be used within StoreMapFilterProvider");
  }
  return ctx;
}
