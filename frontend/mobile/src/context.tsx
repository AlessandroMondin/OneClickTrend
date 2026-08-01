import { createContext, useContext } from "react";

export interface SharedLinksContextValue {
  refreshUnseen: () => void;
}

export const SharedLinksContext = createContext<SharedLinksContextValue>({
  refreshUnseen: () => {},
});

export function useSharedLinksContext(): SharedLinksContextValue {
  return useContext(SharedLinksContext);
}
