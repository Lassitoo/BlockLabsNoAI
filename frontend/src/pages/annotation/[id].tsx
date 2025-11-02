import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Eye, EyeOff, Bot, CheckCircle, Clock } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { AnnotationView } from '@/components/annotation/AnnotationView';
import { AnnotationToolbar } from '@/components/annotation/AnnotationToolbar';

interface Document {
  id: number;
  title: string;
  total_pages: number;
  pages: Page[];
}

interface Page {
  id: number;
  page_number: number;
  text_content: string;
  annotations: Annotation[];
  is_annotated: boolean;
  is_validated_by_human: boolean;
  annotated_at?: string;
  validated_by?: string;
}

interface Annotation {
  id: number;
  text: string;
  type: string;
  type_display: string;
  color: string;
  startPos: number;
  endPos: number;
  confidence: number;
  reasoning?: string;
  is_validated: boolean;
  mode: string;
  created_by: string;
}

interface AnnotationType {
  id: number;
  name: string;
  display_name: string;
  color: string;
  description?: string;
}

const DocumentAnnotation = () => {
  const router = useRouter();
  const { id } = router.query;
  const documentId = parseInt(id as string);

  const [document, setDocument] = useState<Document | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [annotationTypes, setAnnotationTypes] = useState<AnnotationType[]>([]);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showAiAnnotations, setShowAiAnnotations] = useState(true);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
      fetchAnnotationTypes();
    }
  }, [documentId]);

  useEffect(() => {
    if (document && document.pages.length > 0) {
      const page = document.pages.find(p => p.page_number === currentPage);
      if (page) {
        setAnnotations(page.annotations);
      }
    }
  }, [currentPage, document]);

  const fetchDocument = async () => {
    try {
      const response = await fetch(`/api/rawdocs/annotation/document/${documentId}/`);
      const data = await response.json();

      if (data.success) {
        setDocument(data.document);
        if (data.document.pages.length > 0) {
          setAnnotations(data.document.pages[0].annotations);
        }
      }
    } catch (error) {
      console.error('Error fetching document:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnotationTypes = async () => {
    try {
      const response = await fetch('/api/rawdocs/annotation/types/');
      const data = await response.json();

      if (data.success) {
        setAnnotationTypes(data.annotation_types);
        if (data.annotation_types.length > 0) {
          setSelectedAnnotationType(data.annotation_types[0].id.toString());
        }
      }
    } catch (error) {
      console.error('Error fetching annotation types:', error);
    }
  };

  const handleAddAnnotation = async (text: string, startIndex: number, endIndex: number) => {
    if (!selectedAnnotationType) return;

    try {
      const page = document?.pages.find(p => p.page_number === currentPage);
      if (!page) return;

      const response = await fetch('/api/rawdocs/annotation/add/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page_id: page.id,
          selected_text: text,
          annotation_type_id: parseInt(selectedAnnotationType),
          start_pos: startIndex,
          end_pos: endIndex,
          mode: 'manual'
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAnnotations([...annotations, data.annotation]);
        // Update document state
        if (document) {
          const updatedPages = document.pages.map(p =>
            p.page_number === currentPage
              ? { ...p, annotations: [...p.annotations, data.annotation], is_annotated: true }
              : p
          );
          setDocument({ ...document, pages: updatedPages });
        }
      }
    } catch (error) {
      console.error('Error adding annotation:', error);
    }
  };

  const handleRemoveAnnotation = async (annotationId: string) => {
    try {
      const response = await fetch(`/api/rawdocs/annotation/delete/${annotationId}/`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setAnnotations(annotations.filter(a => a.id.toString() !== annotationId));
        // Update document state
        if (document) {
          const updatedPages = document.pages.map(p =>
            p.page_number === currentPage
              ? { ...p, annotations: p.annotations.filter(a => a.id.toString() !== annotationId) }
              : p
          );
          setDocument({ ...document, pages: updatedPages });
        }
      }
    } catch (error) {
      console.error('Error removing annotation:', error);
    }
  };

  const handleAiAnnotate = async () => {
    const page = document?.pages.find(p => p.page_number === currentPage);
    if (!page) return;

    setAnnotating(true);
    try {
      const response = await fetch(`/api/rawdocs/annotation/ai/page/${page.id}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'raw'
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh the page data to get new annotations
        await fetchDocument();
      }
    } catch (error) {
      console.error('Error with AI annotation:', error);
    } finally {
      setAnnotating(false);
    }
  };

  const handleValidatePage = async () => {
    const page = document?.pages.find(p => p.page_number === currentPage);
    if (!page) return;

    setValidating(true);
    try {
      const response = await fetch(`/api/rawdocs/annotation/validate-page/${page.id}/`, {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        // Refresh the page data
        await fetchDocument();
        alert(data.message);
      }
    } catch (error) {
      console.error('Error validating page:', error);
    } finally {
      setValidating(false);
    }
  };

  const getCurrentPage = () => {
    return document?.pages.find(p => p.page_number === currentPage);
  };

  const getStatusColor = (status: boolean) => {
    return status ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading document...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!document) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Document not found</div>
        </div>
      </DashboardLayout>
    );
  }

  const currentPageData = getCurrentPage();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => router.push('/annotation/dashboard')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{document.title}</h1>
              <p className="text-muted-foreground">
                Page {currentPage} of {document.total_pages}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge className={getStatusColor(currentPageData?.is_validated_by_human || false)}>
              {currentPageData?.is_validated_by_human ? (
                <>
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Validated
                </>
              ) : (
                <>
                  <Clock className="w-3 h-3 mr-1" />
                  Not Validated
                </>
              )}
            </Badge>

            <Button
              variant="outline"
              onClick={() => setShowAiAnnotations(!showAiAnnotations)}
            >
              {showAiAnnotations ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showAiAnnotations ? 'Hide' : 'Show'} AI
            </Button>

            <Button
              onClick={handleAiAnnotate}
              disabled={annotating}
              variant="outline"
            >
              <Bot className="w-4 h-4 mr-2" />
              {annotating ? 'Annotating...' : 'AI Annotate'}
            </Button>

            <Button
              onClick={handleValidatePage}
              disabled={validating || !currentPageData?.is_annotated}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {validating ? 'Validating...' : 'Validate Page'}
            </Button>
          </div>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            Previous
          </Button>
          <div className="flex items-center gap-2">
            {Array.from({ length: Math.min(10, document.total_pages) }, (_, i) => i + 1).map(pageNum => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            onClick={() => setCurrentPage(Math.min(document.total_pages, currentPage + 1))}
            disabled={currentPage >= document.total_pages}
          >
            Next
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Annotation Toolbar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Annotation Tools</CardTitle>
                <CardDescription>Select text and choose annotation type</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Annotation Type</label>
                  <Select value={selectedAnnotationType} onValueChange={setSelectedAnnotationType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select annotation type" />
                    </SelectTrigger>
                    <SelectContent>
                      {annotationTypes.map(type => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: type.color }}
                            />
                            {type.display_name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Current Annotations</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {annotations.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No annotations yet</p>
                    ) : (
                      annotations.map(annotation => (
                        <div
                          key={annotation.id}
                          className="p-2 rounded border text-xs"
                          style={{ borderColor: annotation.color }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium" style={{ color: annotation.color }}>
                              {annotation.type_display}
                            </span>
                            <span className="text-muted-foreground">
                              {Math.round(annotation.confidence)}%
                            </span>
                          </div>
                          <p className="text-muted-foreground truncate">
                            {annotation.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Document Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Page {currentPage} Content</CardTitle>
                <CardDescription>
                  Select text to create annotations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentPageData && (
                  <AnnotationView
                    content={currentPageData.text_content}
                    annotations={annotations
                      .filter(a => showAiAnnotations || a.mode !== 'ai')
                      .map(a => ({
                        id: a.id.toString(),
                        text: a.text,
                        labelId: a.type,
                        startIndex: a.startPos,
                        endIndex: a.endPos
                      }))}
                    labels={annotationTypes.map(t => ({
                      id: t.id.toString(),
                      name: t.display_name,
                      color: t.color
                    }))}
                    selectedLabel={selectedAnnotationType}
                    onAddAnnotation={handleAddAnnotation}
                    onRemoveAnnotation={handleRemoveAnnotation}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default DocumentAnnotation;