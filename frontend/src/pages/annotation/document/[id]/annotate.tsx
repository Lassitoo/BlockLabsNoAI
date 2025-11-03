import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Save, Eye, EyeOff, Bot, CheckCircle, Clock, FileText, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import { AnnotationView } from '@/components/annotation/AnnotationView';
import { AnnotationToolbar } from '@/components/annotation/AnnotationToolbar';
import axiosInstance from '@/lib/axios';

interface Document {
  id: number;
  title: string;
  total_pages: number;
  pages: Page[];
  metadata?: {
    title: string;
    type: string;
    publication_date: string;
    version: string;
    source: string;
    country: string;
    language: string;
    url_source: string;
    context: string;
  };
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
  start_xpath?: string;
  end_xpath?: string;
}

interface AnnotationType {
  id: number;
  name: string;
  display_name: string;
  color: string;
  description?: string;
}

const DocumentAnnotate = () => {
  const router = useRouter();
  const { id } = router.query;
  const documentId = parseInt(id as string);

  const [documentData, setDocumentData] = useState<Document | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [annotationTypes, setAnnotationTypes] = useState<AnnotationType[]>([]);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [showAiAnnotations, setShowAiAnnotations] = useState(true);
  const [viewMode, setViewMode] = useState<'raw' | 'structured'>('structured');
  const [structuredHtml, setStructuredHtml] = useState<string>('');
  const [structuredHtmlCss, setStructuredHtmlCss] = useState<string>('');
  const [loadingStructured, setLoadingStructured] = useState(false);
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDisplayName, setNewTypeDisplayName] = useState('');
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    if (documentId) {
      fetchDocument();
      fetchAnnotationTypes();
      fetchStructuredHtml();
    }
  }, [documentId]);

  useEffect(() => {
    if (documentData && documentData.pages.length > 0) {
      const page = documentData.pages.find(p => p.page_number === currentPage);
      if (page) {
        setAnnotations(page.annotations);
      }
    }
  }, [currentPage, documentData]);

  // Highlight annotations in the structured HTML
  useEffect(() => {
    if (structuredHtml && annotations.length > 0) {
      highlightAnnotations();
    }
  }, [annotations, structuredHtml]);

  const fetchDocument = async () => {
    try {
      const response = await axiosInstance.get(`/annotation/document/${documentId}/`);
      const data = response.data;

      if (data.success) {
        setDocumentData(data.document);
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
      const response = await axiosInstance.get('/annotation/types/');
      const data = response.data;

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

  const fetchStructuredHtml = async () => {
    setLoadingStructured(true);
    try {
      const response = await axiosInstance.get(`/document/${documentId}/structured/`);
      const data = response.data;

      if (data.success) {
        setStructuredHtml(data.structured_html || '');
        setStructuredHtmlCss(data.structured_html_css || '');
      }
    } catch (error) {
      console.error('Error fetching structured HTML:', error);
    } finally {
      setLoadingStructured(false);
    }
  };

  const handleAddAnnotation = async (text: string, startIndex: number, endIndex: number, xpathData?: any) => {
    if (!selectedAnnotationType) return;

    try {
      const page = documentData?.pages.find(p => p.page_number === currentPage);
      if (!page) return;

      const payload: any = {
        page_id: page.id,
        selected_text: text,
        annotation_type_id: parseInt(selectedAnnotationType),
        start_pos: startIndex,
        end_pos: endIndex,
        mode: viewMode
      };

      // Add XPath data if in structured mode
      if (viewMode === 'structured' && xpathData) {
        payload.start_xpath = xpathData.start_xpath;
        payload.end_xpath = xpathData.end_xpath;
        payload.start_offset = xpathData.start_offset;
        payload.end_offset = xpathData.end_offset;
      }

      const response = await axiosInstance.post('/annotation/add/', payload);
      const data = response.data;

      if (data.success) {
        setAnnotations([...annotations, data.annotation]);
        // Update document state
        if (documentData) {
          const updatedPages = documentData.pages.map(p =>
            p.page_number === currentPage
              ? { ...p, annotations: [...p.annotations, data.annotation], is_annotated: true }
              : p
          );
          setDocumentData({ ...documentData, pages: updatedPages });
        }
      }
    } catch (error) {
      console.error('Error adding annotation:', error);
    }
  };

  const highlightAnnotations = () => {
    const container = document.querySelector('.structured-html-view');
    if (!container) return;

    // Remove existing highlights
    container.querySelectorAll('.annotation-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    // Sort annotations by position
    const sortedAnnotations = [...annotations].sort((a, b) => a.startPos - b.startPos);

    // Apply highlights
    sortedAnnotations.forEach((annotation) => {
      const text = annotation.text;
      const color = annotation.color;
      
      // Find and highlight text
      highlightTextInElement(container, text, color, annotation.type_display);
    });
  };

  const highlightTextInElement = (element: Element, searchText: string, color: string, typeName: string) => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToReplace: { node: Node; text: string; index: number }[] = [];
    let currentNode;

    while ((currentNode = walker.nextNode())) {
      const text = currentNode.textContent || '';
      const index = text.indexOf(searchText);
      
      if (index !== -1) {
        nodesToReplace.push({ node: currentNode, text: searchText, index });
      }
    }

    // Replace nodes with highlighted versions
    nodesToReplace.forEach(({ node, text, index }) => {
      const parent = node.parentNode;
      if (!parent) return;

      const nodeText = node.textContent || '';
      const before = nodeText.substring(0, index);
      const after = nodeText.substring(index + text.length);

      const span = document.createElement('span');
      span.className = 'annotation-highlight';
      span.textContent = text;
      span.style.backgroundColor = `${color}40`; // 40 = 25% opacity
      span.style.borderBottom = `2px solid ${color}`;
      span.style.padding = '2px 4px';
      span.style.borderRadius = '3px';
      span.style.cursor = 'pointer';
      span.title = typeName;

      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      fragment.appendChild(span);
      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, node);
    });
  };

  const handleAiAnnotate = async () => {
    if (!documentData) return;

    setAnnotating(true);
    try {
      const page = documentData.pages.find(p => p.page_number === currentPage);
      if (!page) return;

      const response = await axiosInstance.post(`/annotation/ai/page/${page.id}/`, {
        mode: viewMode
      });
      const data = response.data;

      if (data.success) {
        // Refresh the document to get updated annotations
        await fetchDocument();
        
        // Show success message
        alert(`✅ ${data.annotations_created} annotations créées avec l'IA !`);
      }
    } catch (error: any) {
      console.error('Error with AI annotation:', error);
      const errorMsg = error.response?.data?.error || 'Erreur lors de l\'annotation IA';
      alert(`❌ ${errorMsg}`);
    } finally {
      setAnnotating(false);
    }
  };

  const handleValidatePage = async () => {
    if (!documentData) return;

    setValidating(true);
    try {
      const page = documentData.pages.find(p => p.page_number === currentPage);
      if (!page) return;

      const response = await axiosInstance.post(`/annotation/validate-page/${page.id}/`);
      const data = response.data;

      if (data.success) {
        // Refresh the document to get updated validation status
        await fetchDocument();
      }
    } catch (error) {
      console.error('Error validating page:', error);
    } finally {
      setValidating(false);
    }
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleDeleteAnnotation = async (annotationId: number) => {
    try {
      const response = await axiosInstance.post(`/annotation/delete/${annotationId}/`);
      const data = response.data;

      if (data.success) {
        // Remove annotation from state
        setAnnotations(annotations.filter(ann => ann.id !== annotationId));
        
        // Update document state
        if (documentData) {
          const updatedPages = documentData.pages.map(p =>
            p.page_number === currentPage
              ? { ...p, annotations: p.annotations.filter(ann => ann.id !== annotationId) }
              : p
          );
          setDocumentData({ ...documentData, pages: updatedPages });
        }
      }
    } catch (error) {
      console.error('Error deleting annotation:', error);
    }
  };

  const handleCreateAnnotationType = async () => {
    if (!newTypeDisplayName.trim()) {
      alert('Veuillez entrer un nom pour le type d\'annotation');
      return;
    }

    try {
      const name = newTypeDisplayName.toLowerCase().replace(/\s+/g, '_');
      const response = await axiosInstance.post('/annotation/types/create/', {
        name: name,
        display_name: newTypeDisplayName,
        color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color
      });

      if (response.data.success) {
        const newType = response.data.annotation_type;
        setAnnotationTypes([...annotationTypes, newType]);
        setSelectedAnnotationType(newType.id.toString());
        setShowAddTypeModal(false);
        setNewTypeDisplayName('');
        setNewTypeName('');
      }
    } catch (error) {
      console.error('Error creating annotation type:', error);
      alert('Erreur lors de la création du type d\'annotation');
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim());
    }
  };

  const handleAnnotateSelection = async () => {
    if (!selectedText || !selectedAnnotationType) {
      alert('Veuillez sélectionner du texte et un type d\'annotation');
      return;
    }

    // Check if we're in browser environment
    if (typeof window === 'undefined') return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const container = typeof window !== 'undefined' && typeof window.document !== 'undefined' 
      ? window.document.querySelector('.structured-html-view') 
      : null;
    if (!container) {
      // Fallback: use simple position calculation
      const page = documentData?.pages.find(p => p.page_number === currentPage);
      if (page) {
        const textContent = page.text_content;
        const startPos = textContent.indexOf(selectedText);
        if (startPos !== -1) {
          const endPos = startPos + selectedText.length;
          await handleAddAnnotation(selectedText, startPos, endPos);
          setSelectedText('');
          selection.removeAllRanges();
        }
      }
      return;
    }

    // Calculate positions
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(container);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const startPos = preSelectionRange.toString().length;
    const endPos = startPos + selectedText.length;

    await handleAddAnnotation(selectedText, startPos, endPos);
    setSelectedText('');
    selection.removeAllRanges();
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

  if (!documentData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-red-600">Document not found</div>
        </div>
      </DashboardLayout>
    );
  }

  const currentPageData = documentData.pages.find(p => p.page_number === currentPage);

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
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <FileText className="w-8 h-8" />
                Annotate Document
              </h1>
              <p className="text-muted-foreground mt-1">
                {documentData.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Page {currentPage} of {documentData.total_pages}
            </Badge>
            {currentPageData?.is_validated_by_human && (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Validated
              </Badge>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Annotation Types */}
              <div>
                <label className="text-sm font-medium mb-2 block">Types d'Annotation</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {annotationTypes.map((type) => (
                    <Button
                      key={type.id}
                      variant={selectedAnnotationType === type.id.toString() ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedAnnotationType(type.id.toString())}
                      style={{
                        backgroundColor: selectedAnnotationType === type.id.toString() ? type.color : 'transparent',
                        borderColor: type.color,
                        color: selectedAnnotationType === type.id.toString() ? 'white' : type.color
                      }}
                    >
                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: type.color }} />
                      {type.display_name}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddTypeModal(true)}
                    className="border-dashed"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter Type
                  </Button>
                </div>
              </div>

              {/* Selection Info */}
              {selectedText && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">Texte sélectionné:</p>
                    <p className="text-sm text-blue-700 truncate">{selectedText}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAnnotateSelection}
                    disabled={!selectedAnnotationType}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Annoter
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAiAnnotations(!showAiAnnotations)}
                  >
                    {showAiAnnotations ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                    {showAiAnnotations ? 'Hide' : 'Show'} AI
                  </Button>
                  
                  {annotations.length > 0 && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      {annotations.length} annotation{annotations.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAiAnnotate}
                    disabled={annotating}
                    className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-300"
                  >
                    <Bot className="w-4 h-4 mr-2" />
                    {annotating ? 'Annotation en cours...' : 'AI Annotate'}
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleValidatePage}
                    disabled={validating || currentPageData?.is_validated_by_human}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {validating ? 'Validation...' : 'Validate Page'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Modal pour ajouter un type */}
        {showAddTypeModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Ajouter un Type d'Annotation</CardTitle>
                <CardDescription>Créez un nouveau type pour annoter vos documents</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Nom d'affichage</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md"
                    value={newTypeDisplayName}
                    onChange={(e) => setNewTypeDisplayName(e.target.value)}
                    placeholder="Ex: Produit, Autorité, Délai..."
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddTypeModal(false);
                      setNewTypeDisplayName('');
                    }}
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleCreateAnnotationType}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    Créer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Annotation View */}
        <Card>
          <CardContent className="pt-6">
            <div className="structured-content-container">
              {loadingStructured ? (
                <div className="flex items-center justify-center p-8">
                  <div className="text-lg">Loading structured content...</div>
                </div>
              ) : structuredHtml ? (
                <>
                  {/* Inject CSS dynamically if available */}
                  {structuredHtmlCss && (
                    <style dangerouslySetInnerHTML={{ __html: structuredHtmlCss }} />
                  )}
                  <div 
                    className="pdf-document-container structured-html-view"
                    dangerouslySetInnerHTML={{ __html: structuredHtml }}
                    onMouseUp={handleTextSelection}
                    style={{
                      padding: '20px',
                      background: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      minHeight: '500px',
                      userSelect: 'text',
                      cursor: 'text'
                    }}
                  />
                </>
              ) : (
                <div className="text-center p-8 text-gray-500">
                  No structured content available for this document.
                  <br />
                  <Button 
                    variant="outline" 
                    onClick={fetchStructuredHtml}
                    className="mt-4"
                  >
                    Reload Structured Content
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Page Navigation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Previous
              </Button>

              <div className="flex items-center gap-1 flex-wrap max-w-3xl">
                {Array.from({ length: documentData.total_pages }, (_, i) => i + 1).map((pageNum) => {
                  const page = documentData.pages.find(p => p.page_number === pageNum);
                  return (
                    <Button
                      key={pageNum}
                      variant={pageNum === currentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-10 h-10 ${
                        page?.is_annotated ? 'bg-blue-100 text-blue-800' : ''
                      } ${
                        page?.is_validated_by_human ? 'bg-green-100 text-green-800' : ''
                      }`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button
                variant="outline"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= documentData.total_pages}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Document Metadata (Optional) */}
        {documentData.metadata && (
          <Card>
            <CardHeader>
              <CardTitle>Document Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Type:</span> {documentData.metadata.type}
                </div>
                <div>
                  <span className="font-medium">Language:</span> {documentData.metadata.language}
                </div>
                <div>
                  <span className="font-medium">Source:</span> {documentData.metadata.source}
                </div>
                <div>
                  <span className="font-medium">Country:</span> {documentData.metadata.country}
                </div>
                {documentData.metadata.publication_date && (
                  <div>
                    <span className="font-medium">Publication Date:</span> {documentData.metadata.publication_date}
                  </div>
                )}
                {documentData.metadata.version && (
                  <div>
                    <span className="font-medium">Version:</span> {documentData.metadata.version}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default DocumentAnnotate;