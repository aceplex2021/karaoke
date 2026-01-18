'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface PreviewContextType {
  activePreviewId: string | null;
  setActivePreview: (id: string | null) => void;
}

const PreviewContext = createContext<PreviewContextType>({
  activePreviewId: null,
  setActivePreview: () => {},
});

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  return (
    <PreviewContext.Provider value={{ activePreviewId, setActivePreview: setActivePreviewId }}>
      {children}
    </PreviewContext.Provider>
  );
}

export const usePreview = () => useContext(PreviewContext);
