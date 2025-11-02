import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AnnotationToolbar } from '@/components/annotation/AnnotationToolbar';
import { AnnotationView } from '@/components/annotation/AnnotationView';
import { JsonView } from '@/components/annotation/JsonView';
import { RelationshipDialog } from '@/components/annotation/RelationshipDialog';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { Annotation, AnnotationRelationship } from '@/types';
import { toast } from 'sonner';
import { ArrowLeft, Save, Link2 } from 'lucide-react';

const DocumentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { documents, updateDocument, annotationLabels } = useData();
  const { user } = useAuth();
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [relationshipDialogOpen, setRelationshipDialogOpen] = useState(false);

  const document = documents.find(d => d.id === id);

  if (!document) {
    return (
      <DashboardLayout>
        <div className="text-center">Document not found</div>
      </DashboardLayout>
    );
  }

  const currentPage = document.pages[0] || { pageNumber: 1, content: '', annotations: [], relationships: [] };

  const handleAddAnnotation = (text: string, startIndex: number, endIndex: number) => {
    if (!selectedLabel || !user) return;

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      labelId: selectedLabel,
      text,
      startIndex,
      endIndex,
      pageNumber: currentPage.pageNumber,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
    };

    const updatedPages = document.pages.map(page =>
      page.pageNumber === currentPage.pageNumber
        ? { ...page, annotations: [...page.annotations, newAnnotation] }
        : page
    );

    updateDocument(document.id, { pages: updatedPages });
    toast.success('Annotation added');
  };

  const handleRemoveAnnotation = (annotationId: string) => {
    const updatedPages = document.pages.map(page =>
      page.pageNumber === currentPage.pageNumber
        ? { ...page, annotations: page.annotations.filter(a => a.id !== annotationId) }
        : page
    );

    updateDocument(document.id, { pages: updatedPages });
    toast.success('Annotation removed');
  };

  const handleCreateRelationship = (name: string, sourceId: string, targetId: string, description?: string) => {
    if (!user) return;

    const newRelationship: AnnotationRelationship = {
      id: Date.now().toString(),
      name,
      sourceAnnotationId: sourceId,
      targetAnnotationId: targetId,
      description,
      createdAt: new Date().toISOString(),
      createdBy: user.id,
    };

    const updatedPages = document.pages.map(page =>
      page.pageNumber === currentPage.pageNumber
        ? { ...page, relationships: [...page.relationships, newRelationship] }
        : page
    );

    updateDocument(document.id, { pages: updatedPages });
    toast.success('Relationship created');
  };

  const handleValidate = () => {
    updateDocument(document.id, { status: 'validated' });
    toast.success('Document validated successfully!');
    navigate('/document-manager');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate('/document-manager')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{document.name}</h1>
              <p className="text-sm text-muted-foreground">Page {currentPage.pageNumber} of {document.pages.length}</p>
            </div>
          </div>
          <Button onClick={handleValidate}>
            <Save className="w-4 h-4 mr-2" />
            Validate Document
          </Button>
        </div>

        <Tabs defaultValue="extraction" className="space-y-6">
          <TabsList>
            <TabsTrigger value="extraction">Text & Metadata Extraction</TabsTrigger>
            <TabsTrigger value="annotation">Annotation</TabsTrigger>
          </TabsList>

          <TabsContent value="extraction" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(document.metadata).map(([key, value]) => (
                    <div key={key}>
                      <label className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</label>
                      <Input defaultValue={String(value)} className="mt-1" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>Extracted Content</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={currentPage.content} rows={15} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="annotation" className="space-y-6">
            <div className="flex justify-between items-start gap-4">
              <AnnotationToolbar
                labels={annotationLabels}
                selectedLabel={selectedLabel}
                onSelectLabel={setSelectedLabel}
              />
              <Button onClick={() => setRelationshipDialogOpen(true)}>
                <Link2 className="w-4 h-4 mr-2" />
                Create Relationship
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold">Annotate Content</h3>
                <AnnotationView
                  content={currentPage.content}
                  annotations={currentPage.annotations}
                  labels={annotationLabels}
                  selectedLabel={selectedLabel}
                  onAddAnnotation={handleAddAnnotation}
                  onRemoveAnnotation={handleRemoveAnnotation}
                />
              </div>

              <JsonView
                annotations={currentPage.annotations}
                relationships={currentPage.relationships}
                labels={annotationLabels}
              />
            </div>
          </TabsContent>
        </Tabs>

        <RelationshipDialog
          open={relationshipDialogOpen}
          onOpenChange={setRelationshipDialogOpen}
          annotations={currentPage.annotations}
          labels={annotationLabels}
          onCreateRelationship={handleCreateRelationship}
        />
      </div>
    </DashboardLayout>
  );
};

export default DocumentDetail;
