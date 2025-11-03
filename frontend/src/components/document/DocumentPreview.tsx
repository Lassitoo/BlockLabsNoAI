// src/components/document/DocumentPreview.tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MetadataForm } from './MetadataForm';
import { SplitView } from './SplitView';
import { RawDocument } from '@/types/document';
import { ArrowLeft, FileText, Columns } from 'lucide-react';

interface DocumentPreviewProps {
  document: RawDocument;
  onBackToList: () => void;
}

export const DocumentPreview = ({ document: initialDocument, onBackToList }: DocumentPreviewProps) => {
  const [activeTab, setActiveTab] = useState('metadata');
  const [currentDocument, setCurrentDocument] = useState<RawDocument>(initialDocument);

  // Callback pour mettre à jour le document après sauvegarde
  const handleDocumentUpdate = (updatedDoc: RawDocument) => {
    if (!updatedDoc) {
      console.error('handleDocumentUpdate: updatedDoc est undefined');
      return;
    }

    console.log('DocumentPreview: Document mis à jour reçu !', updatedDoc.metadata.title);
    setCurrentDocument(updatedDoc);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBackToList}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">
            {currentDocument.metadata.title || currentDocument.file_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Document importé • {new Date(currentDocument.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="metadata" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Métadonnées
          </TabsTrigger>
          <TabsTrigger value="split" className="flex items-center gap-2">
            <Columns className="w-4 h-4" />
            Vue divisée
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metadata">
          <MetadataForm
            document={currentDocument}
            onUpdate={handleDocumentUpdate}
          />
        </TabsContent>

        <TabsContent value="split">
          <SplitView doc={currentDocument} />
        </TabsContent>
      </Tabs>
    </div>
  );
};