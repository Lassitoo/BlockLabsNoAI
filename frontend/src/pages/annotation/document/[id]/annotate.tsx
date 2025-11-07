import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, EyeOff, Bot, CheckCircle, FileText, Plus, Trash2, Copy } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
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
  selected_text?: string;
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

  useEffect(() => {
    if (documentId && currentPage) {
      fetchStructuredHtml();
    }
  }, [currentPage]);

  useEffect(() => {
    if (structuredHtml && annotations.length > 0) {
      setTimeout(() => {
        applyAnnotationHighlights();
      }, 100);
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
      const response = await axiosInstance.get(`/document/${documentId}/structured/?page=${currentPage}`);
      const data = response.data as { success: boolean; structured_html?: string; structured_html_css?: string };

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

  const applyAnnotationHighlights = () => {
  const container = document.querySelector('.structured-html-view');
  if (!container) {
    console.log('❌ Container not found');
    return;
  }

  // Remove old highlights first
  container.querySelectorAll('.inline-annotation').forEach(el => {
    const textContent = el.textContent || '';
    const textNode = document.createTextNode(textContent);
    el.parentNode?.replaceChild(textNode, el);
  });
  container.normalize();

  console.log(`🎨 Applying ${annotations.length} annotations`);

  // Apply each annotation
  annotations.forEach((annotation) => {
    const searchText = (annotation.text || annotation.selected_text || '').trim();
    if (!searchText) {
      console.warn('⚠️ Skipping empty annotation:', annotation.id);
      return;
    }

    console.log(`🔍 Searching for: "${searchText.substring(0, 50)}..."`);

    // Create tree walker to find text
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if already inside an annotation
          let parent = node.parentNode;
          while (parent && parent !== container) {
            if (parent instanceof Element && parent.classList?.contains('inline-annotation')) {
              return NodeFilter.FILTER_REJECT;
            }
            parent = parent.parentNode;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let textNode: Node | null;
    let found = false;

    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent || '';
      const index = text.indexOf(searchText);

      if (index !== -1) {
        found = true;
        console.log(`✅ Found at index ${index}`);

        const parent = textNode.parentNode;
        if (!parent) continue;

        const before = text.substring(0, index);
        const match = text.substring(index, index + searchText.length);
        const after = text.substring(index + searchText.length);

        // Create annotation span
        const span = document.createElement('span');
        span.className = 'inline-annotation';
        span.dataset.annotationId = annotation.id.toString();
        span.style.cssText = `
          background-color: ${annotation.color}30;
          border-bottom: 2px solid ${annotation.color};
          padding: 2px 4px;
          margin: 0 1px;
          border-radius: 3px;
          cursor: pointer;
          display: inline;
          position: relative;
        `;
        span.textContent = match;

        // Add type label
        const label = document.createElement('span');
        label.className = 'ann-label';
        label.style.cssText = `
          font-size: 0.65rem;
          font-weight: 700;
          margin-left: 4px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(0,0,0,0.8);
          color: white;
          white-space: nowrap;
          display: inline;
        `;
        label.textContent = annotation.type_display;
        span.appendChild(label);

        // Click to delete
        span.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (confirm(`Supprimer cette annotation?\n"${searchText.substring(0, 50)}..."`)) {
            handleDeleteAnnotation(annotation.id);
          }
        };

        // Replace text node with annotated version
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(span);
        if (after) fragment.appendChild(document.createTextNode(after));

        parent.replaceChild(fragment, textNode);
        break; // Only highlight first occurrence
      }
    }

    if (!found) {
      console.warn(`❌ Text not found: "${searchText.substring(0, 50)}..."`);
    }
  });

  console.log('✨ Highlighting complete');
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

      if (viewMode === 'structured' && xpathData) {
        payload.start_xpath = xpathData.start_xpath;
        payload.end_xpath = xpathData.end_xpath;
        payload.start_offset = xpathData.start_offset;
        payload.end_offset = xpathData.end_offset;
      }

      const response = await axiosInstance.post('/annotation/add/', payload);
      const data = response.data;

      if (data.success) {
        await fetchDocument();
        setSelectedText('');
      }
    } catch (error) {
      console.error('Error adding annotation:', error);
    }
  };

  const handleAiAnnotate = async () => {
  if (!documentData) return;

  setAnnotating(true);
  try {
    const page = documentData.pages.find(p => p.page_number === currentPage);
    if (!page) return;

    const response = await axiosInstance.post(`/annotation/ai/page/${page.id}/`, {
      mode: 'structured'
    });
    const data = response.data;

    if (data.success) {
      console.log(`✅ AI created ${data.annotations_created} annotations`);

      // CRITICAL: Reload document data first
      await fetchDocument();

      // THEN reload structured HTML
      await fetchStructuredHtml();

      // Wait a bit for DOM to update, then apply highlights
      setTimeout(() => {
        applyAnnotationHighlights();
      }, 300);

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
        await fetchDocument();
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
        color: `#${Math.floor(Math.random()*16777215).toString(16)}`
      });

      if (response.data.success) {
        const newType = response.data.annotation_type;
        setAnnotationTypes([...annotationTypes, newType]);
        setSelectedAnnotationType(newType.id.toString());
        setShowAddTypeModal(false);
        setNewTypeDisplayName('');
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

  try {
    const page = documentData?.pages.find(p => p.page_number === currentPage);
    if (!page) return;

    const payload = {
      page_id: page.id,
      selected_text: selectedText,
      annotation_type_id: parseInt(selectedAnnotationType),
      start_pos: 0,
      end_pos: selectedText.length,
      mode: 'structured'
    };

    const response = await axiosInstance.post('/annotation/add/', payload);
    const data = response.data;

    if (data.success) {
      await fetchDocument();
      setSelectedText('');
      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }
      alert('✅ Annotation ajoutée!');
    }
  } catch (error) {
    console.error('Error adding annotation:', error);
    alert('❌ Erreur lors de l\'ajout de l\'annotation');
  }
};

  const copyJSONToClipboard = () => {
    const json = JSON.stringify({
      page_number: currentPage,
      page_id: currentPageData?.id,
      total_annotations: currentPageData?.annotations?.length || 0,
      is_validated: currentPageData?.is_validated_by_human || false,
      validated_by: currentPageData?.validated_by || null,
      annotations: currentPageData?.annotations?.map(ann => ({
        id: ann.id,
        text: ann.text || ann.selected_text,
        type: ann.type_display,
        color: ann.color,
        confidence: ann.confidence,
        created_by: ann.created_by,
        mode: ann.mode
      })) || []
    }, null, 2);

    navigator.clipboard.writeText(json);
    alert('✅ JSON copié dans le presse-papier!');
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => router.push('/annotation/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <FileText className="w-8 h-8" />
                Annotate Document
              </h1>
              <p className="text-muted-foreground mt-1">{documentData.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Page {currentPage} of {documentData.total_pages}</Badge>
            {currentPageData?.is_validated_by_human && (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Validated
              </Badge>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
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
                  <Button variant="outline" size="sm" onClick={() => setShowAddTypeModal(true)} className="border-dashed">
                    <Plus className="w-4 h-4 mr-2" />
                    Ajouter Type
                  </Button>
                </div>
              </div>

              {selectedText && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">Texte sélectionné:</p>
                    <p className="text-sm text-blue-700 truncate">{selectedText}</p>
                  </div>
                  <Button size="sm" onClick={handleAnnotateSelection} disabled={!selectedAnnotationType} className="bg-blue-600 hover:bg-blue-700">
                    Annoter
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAiAnnotations(!showAiAnnotations)}>
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
                  <Button variant="outline" size="sm" onClick={handleAiAnnotate} disabled={annotating} className="bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-300">
                    <Bot className="w-4 h-4 mr-2" />
                    {annotating ? 'Annotation en cours...' : 'AI Annotate'}
                  </Button>

                  <Button size="sm" onClick={handleValidatePage} disabled={validating || currentPageData?.is_validated_by_human} className="bg-green-600 hover:bg-green-700">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {validating ? 'Validation...' : 'Validate Page'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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
                  <input type="text" className="w-full px-3 py-2 border rounded-md" value={newTypeDisplayName} onChange={(e) => setNewTypeDisplayName(e.target.value)} placeholder="Ex: Produit, Autorité, Délai..." />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setShowAddTypeModal(false); setNewTypeDisplayName(''); }} className="flex-1">
                    Annuler
                  </Button>
                  <Button onClick={handleCreateAnnotationType} className="flex-1 bg-blue-600 hover:bg-blue-700">
                    Créer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-xl border-gray-200">
            <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white border-b">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5" />
                Page {currentPage} / {documentData.total_pages}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[700px] overflow-y-auto p-4 bg-background">
                {/* Inject CSS dynamically if available */}
                {structuredHtmlCss && (
                  <style dangerouslySetInnerHTML={{ __html: structuredHtmlCss }} />
                )}

                {loadingStructured ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900"></div>
                    <span className="ml-3 text-gray-600">Chargement...</span>
                  </div>
                ) : structuredHtml ? (
                  <div
                    className="pdf-document-container prose prose-sm max-w-none bg-white structured-html-view"
                    dangerouslySetInnerHTML={{ __html: structuredHtml }}
                    onMouseUp={handleTextSelection}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p className="mb-4">Aucun contenu pour cette page</p>
                      <Button variant="outline" onClick={fetchStructuredHtml}>Recharger</Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-xl border-gray-200 bg-slate-950">
            <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-lg">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                  </svg>
                  JSON - Page {currentPage}
                </CardTitle>
                <Button size="sm" variant="ghost" onClick={copyJSONToClipboard} className="text-white hover:bg-gray-700">
                  <Copy className="w-4 h-4 mr-2" />
                  Copier
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-900 rounded-lg border border-slate-800">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {currentPageData?.annotations?.length || 0} annotations
                </Badge>
                {currentPageData?.is_validated_by_human && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Validée
                  </Badge>
                )}
              </div>

              {currentPageData?.annotations && currentPageData.annotations.length > 0 ? (
                <div className="space-y-3 max-h-[calc(70vh-120px)] overflow-y-auto">
                  {currentPageData.annotations.map((ann) => (
                    <div key={ann.id} className="p-4 bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-all group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge style={{ backgroundColor: `${ann.color}20`, borderColor: ann.color, color: ann.color }} className="text-xs font-semibold">
                              {ann.type_display}
                            </Badge>
                            <span className="text-xs text-slate-500">#{ann.id}</span>
                          </div>
                          <p className="text-sm text-slate-200 mb-2 leading-relaxed">
                            "{ann.text || ann.selected_text}"
                          </p>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                              {ann.confidence}% confiance
                            </span>
                            <span>•</span>
                            <span>{ann.created_by}</span>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteAnnotation(ann.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-12 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucune annotation sur cette page</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1}>
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
                      className={`w-10 h-10 ${page?.is_annotated ? 'bg-blue-100 text-blue-800' : ''} ${page?.is_validated_by_human ? 'bg-green-100 text-green-800' : ''}`}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>

              <Button variant="outline" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= documentData.total_pages}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        {documentData.metadata && (
          <Card>
            <CardHeader>
              <CardTitle>Document Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-medium">Type:</span> {documentData.metadata.type}</div>
                <div><span className="font-medium">Language:</span> {documentData.metadata.language}</div>
                <div><span className="font-medium">Source:</span> {documentData.metadata.source}</div>
                <div><span className="font-medium">Country:</span> {documentData.metadata.country}</div>
                {documentData.metadata.publication_date && (
                  <div><span className="font-medium">Publication Date:</span> {documentData.metadata.publication_date}</div>
                )}
                {documentData.metadata.version && (
                  <div><span className="font-medium">Version:</span> {documentData.metadata.version}</div>
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