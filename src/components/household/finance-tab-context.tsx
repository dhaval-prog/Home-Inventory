"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type FinanceTab = "goal" | "split";

const FinanceTabContext = createContext<{
  tab: FinanceTab;
  setTab: (t: FinanceTab) => void;
} | null>(null);

/**
 * Shared New Goal / Let's Split selection, lifted out of the finance card so
 * the segmented toggle can live in the Home header (beside Invite) while the
 * card content it drives stays further down the page — one source of truth,
 * never a second toggle rendered anywhere else.
 */
export function FinanceTabProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<FinanceTab>("goal");
  return (
    <FinanceTabContext.Provider value={{ tab, setTab }}>
      {children}
    </FinanceTabContext.Provider>
  );
}

export function useFinanceTab() {
  const ctx = useContext(FinanceTabContext);
  if (!ctx)
    throw new Error("useFinanceTab must be used within a FinanceTabProvider");
  return ctx;
}
