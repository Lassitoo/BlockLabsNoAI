import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RawDocument } from '@/types/document';
import { MetadataForm } from './MetadataForm';
import { SplitView } from './SplitView';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle,
  Clock,
  Columns,
  
} from 'lucide-react';

interface MultiDocumentPreviewProps {
  documents: RawDocument[];
  onBackToList: () => void;
}

export const MultiDocumentPreview = ({ documents, onBackToList }: MultiDocumentPreviewProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeView, setActiveView] = useState<'metadata' | 'split' | 'pdf'>('metadata');

  const currentDoc = documents[currentIndex];


  const navigateDocument = (direction: number) => {
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < documents.length) {
      setCurrentIndex(newIndex);
      setActiveView('metadata'); // Reset to metadata view on navigation
    }
  };

  const handleUpdate = (updatedDoc: RawDocument) => {
    // Update the document in the list
    documents[currentIndex] = updatedDoc;
  };


  return (
    <div className="space-y-6">
      {/* Document Tabs Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {documents.length} document{documents.length > 1 ? 's' : ''}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Document {currentIndex + 1} sur {documents.length}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDocument(-1)}
                disabled={currentIndex === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateDocument(1)}
                disabled={currentIndex === documents.length - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Document Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {documents.map((doc, index) => (
              <button
                key={doc.id}
                onClick={() => {
                  setCurrentIndex(index);
                  setActiveView('metadata'); // ← FORCER LE RETOUR AUX MÉTADONNÉES
                }}

                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg border transition-all
                  ${
                    currentIndex === index
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border'
                  }
                `}
              >
                <span className="font-medium text-sm">#{index + 1}</span>
                <div className="flex flex-col items-start max-w-[200px]">
                  <span className="text-sm font-medium truncate w-full">
                    {doc.metadata.title || doc.file_name}
                  </span>
                  {doc.metadata.type && (
                    <span className="text-xs opacity-70">
                      {doc.metadata.type}
                    </span>
                  )}
                </div>
                {doc.is_validated ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Clock className="w-4 h-4 text-yellow-500" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* View Tabs */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Button
              variant={activeView === 'metadata' ? 'default' : 'outline'}
              onClick={() => setActiveView('metadata')}
              className="flex-1"
            >
              <FileText className="w-4 h-4 mr-2" />
              Métadonnées
            </Button>
            <Button
              variant={activeView === 'split' ? 'default' : 'outline'}
              onClick={() => setActiveView('split')}
              className="flex-1"
            >
              <Columns className="w-4 h-4 mr-2" />
              Vue divisée
            </Button>

          </div>
        </CardContent>
      </Card>

      {/* Content Views */}
      {activeView === 'metadata' && (
        <MetadataForm
          key={currentDoc.id}  // FORCER LE REMOUNT
          document={currentDoc}
          onUpdate={handleUpdate}
        />
      )}
      {activeView === 'split' && <SplitView doc={currentDoc} />}



    </div>
  );
};