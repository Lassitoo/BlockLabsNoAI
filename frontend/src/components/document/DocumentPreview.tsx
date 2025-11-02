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

export const DocumentPreview = ({ document, onBackToList }: DocumentPreviewProps) => {
  const [activeTab, setActiveTab] = useState('metadata');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBackToList}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{document.metadata.title || document.file_name}</h2>
          <p className="text-sm text-muted-foreground">
            Document importé • {new Date(document.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metadata" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Métadonnées
          </TabsTrigger>
          <TabsTrigger value="split" className="flex items-center gap-2">
            <Columns className="w-4 h-4" />
            Vue divisée
          </TabsTrigger>
          <TabsTrigger value="pdf" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            PDF Original
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metadata">
          <MetadataForm document={document} />
        </TabsContent>

        <TabsContent value="split">
          <SplitView document={document} />
        </TabsContent>

        <TabsContent value="pdf">
          <Card>
            <CardHeader>
              <CardTitle>PDF Original</CardTitle>
            </CardHeader>
            <CardContent>
              <iframe
                src={`/rawdocs/view-original/${document.id}/`}
                className="w-full h-[800px] border rounded"
                title="PDF Original"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};