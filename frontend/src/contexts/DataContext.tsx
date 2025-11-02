import { createContext, useContext, useState, ReactNode } from 'react';
import { Document, AnnotationLabel } from '@/types';

interface DataContextType {
  documents: Document[];
  setDocuments: (docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  deleteDocument: (id: string) => void;
  annotationLabels: AnnotationLabel[];
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};

// Mock annotation labels
const defaultLabels: AnnotationLabel[] = [
  { id: '1', name: 'ENTITY', color: 'hsl(var(--annotation-entity))' },
  { id: '2', name: 'LABEL', color: 'hsl(var(--annotation-label))' },
  { id: '3', name: 'DATE', color: 'hsl(var(--annotation-date))' },
  { id: '4', name: 'NUMBER', color: 'hsl(var(--annotation-number))' },
  { id: '5', name: 'LOCATION', color: 'hsl(var(--annotation-location))' },
];

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [annotationLabels] = useState<AnnotationLabel[]>(defaultLabels);

  const addDocument = (doc: Document) => {
    setDocuments(prev => [...prev, doc]);
  };

  const updateDocument = (id: string, updates: Partial<Document>) => {
    setDocuments(prev =>
      prev.map(doc => (doc.id === id ? { ...doc, ...updates } : doc))
    );
  };

  const deleteDocument = (id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id));
  };

  return (
    <DataContext.Provider
      value={{
        documents,
        setDocuments,
        addDocument,
        updateDocument,
        deleteDocument,
        annotationLabels,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};
