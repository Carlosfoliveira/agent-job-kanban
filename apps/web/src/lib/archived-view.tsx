import { createContext, useContext, useState, type ReactNode } from "react";

interface ArchivedView {
  /** false → the server's truncated archived list; true → the full set. */
  allArchived: boolean;
  showAllArchived: () => void;
}

const ArchivedViewContext = createContext<ArchivedView>({
  allArchived: false,
  showAllArchived: () => {},
});

/**
 * Whether jobs queries request the full archived set or the server's
 * truncated default. Lives above the router outlet so the detail sheet
 * and unmatched tray resolve jobs from the same cache the board renders.
 */
export function ArchivedViewProvider({ children }: { children: ReactNode }) {
  const [allArchived, setAllArchived] = useState(false);
  return (
    <ArchivedViewContext.Provider
      value={{ allArchived, showAllArchived: () => setAllArchived(true) }}
    >
      {children}
    </ArchivedViewContext.Provider>
  );
}

export function useArchivedView() {
  return useContext(ArchivedViewContext);
}
