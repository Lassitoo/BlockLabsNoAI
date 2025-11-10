import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Eye, EyeOff, CheckCircle, FileText, Plus, Trash2, Copy, Link as LinkIcon } from 'lucide-react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import axiosInstance from '@/lib/axios';
import { AnnotationPanel } from '@/components/annotation/AnnotationPanel';

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
interface AnnotationRelationship {
  id: number;
  source: {
    id: number;
    text: string;
    type: string;
    color: string;
  };
  target: {
    id: number;
    text: string;
    type: string;
    color: string;
  };
  relationship_name: string;
  description: string;
  created_by: string;
  created_at: string;
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
  const [validating, setValidating] = useState(false);
  const [showAiAnnotations, setShowAiAnnotations] = useState(true);
  const [viewMode, setViewMode] = useState<'raw' | 'structured'>('structured');
  const [structuredHtml, setStructuredHtml] = useState<string>('');
  const [structuredHtmlCss, setStructuredHtmlCss] = useState<string>('');
  const [loadingStructured, setLoadingStructured] = useState(false);
  const [relationships, setRelationships] = useState<AnnotationRelationship[]>([]);
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);
  const [showRelationshipsList, setShowRelationshipsList] = useState(false);
  const [newRelationship, setNewRelationship] = useState({
    source_annotation_id: '',
    target_annotation_id: '',
    relationship_name: '',
    description: ''
  });
  const [relationshipErrors, setRelationshipErrors] = useState<any>({});
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [newTypeDisplayName, setNewTypeDisplayName] = useState('');

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
        fetchPageRelationships();
      }
    }
  }, [currentPage, documentData]);

  useEffect(() => {
    if (documentId && !structuredHtml) {
      fetchStructuredHtml();
    }
  }, [documentId]);

  useEffect(() => {
    if (structuredHtml && documentData) {
      setTimeout(() => {
        filterPageContent();
        applyAnnotationHighlights();
      }, 100);
    }
  }, [structuredHtml, currentPage, documentData, selectedAnnotationType, annotations]);

  const filterPageContent = () => {
    const container = document.querySelector('.structured-html-view');
    if (!container) return;

    // Chercher tous les éléments qui pourraient représenter des pages
    const allPages = container.querySelectorAll('[class*="page"], [id*="page"], section, .page-content');
    
    console.log(`📄 Found ${allPages.length} potential page elements`);
    
    if (allPages.length > 0) {
      // Afficher uniquement la page actuelle (index = currentPage - 1)
      allPages.forEach((page, index) => {
        const pageElement = page as HTMLElement;
        pageElement.style.display = (index === currentPage - 1) ? 'block' : 'none';
      });
      console.log(`✅ Showing page ${currentPage} (index ${currentPage - 1})`);
    } else {
      console.log('⚠️ No page markers found, showing all content');
    }
  };

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

  const fetchPageRelationships = async () => {
  if (!currentPageData) return;
  
  try {
    const response = await axiosInstance.get(`/annotation/relationships/page/${currentPageData.id}/`);
    const data = response.data as { success: boolean; relationships: AnnotationRelationship[] };

    if (data.success) {
      setRelationships(data.relationships);
    }
  } catch (error) {
    console.error('Error fetching relationships:', error);
  }
};


  const fetchStructuredHtml = async () => {
    setLoadingStructured(true);
    try {
      const response = await axiosInstance.get(`/document/${documentId}/structured/`);
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

  const resolveXPath = (xpath: string, container: Element): { node: Node; offset: number } | null => {
    if (!xpath) return null;
    
    const parts = xpath.split('::');
    const pathPart = parts[0];
    const offset = parseInt(parts[1] || '0');
    
    const segments = pathPart.split('/').filter(s => s);
    let currentNode: Node = container;
    
    for (const segment of segments) {
      const match = segment.match(/^(\w+)\[(\d+)\]$/) || segment.match(/^text\(\)\[(\d+)\]$/);
      if (!match) continue;
      
      if (segment.startsWith('text()')) {
        const index = parseInt(match[1]) - 1;
        const textNodes = Array.from(currentNode.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
        if (textNodes[index]) {
          currentNode = textNodes[index];
        }
      } else {
        const tagName = match[1];
        const index = parseInt(match[2]) - 1;
        const elements = Array.from(currentNode.childNodes).filter(
          n => n.nodeType === Node.ELEMENT_NODE && n.nodeName.toLowerCase() === tagName
        );
        if (elements[index]) {
          currentNode = elements[index];
        }
      }
    }
    
    return { node: currentNode, offset };
  };

  const createAnnotationSpan = (annotation: any, matchText: string): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = 'inline-annotation';
    span.dataset.annotationId = annotation.id.toString();
    span.dataset.annotationType = annotation.type_display;
    span.dataset.annotationColor = annotation.color;
    span.style.cssText = `
      background-color: ${annotation.color}30;
      border-bottom: 2px solid ${annotation.color};
      padding: 2px 4px;
      margin: 0 1px;
      border-radius: 3px;
      cursor: pointer;
      display: inline;
      position: relative;
      transition: all 0.2s ease;
    `;
    span.textContent = matchText;

    // Click to delete
    span.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`Supprimer cette annotation?\n"${matchText.substring(0, 50)}..."`)) {
        handleDeleteAnnotation(annotation.id);
      }
    };

    return span;
  };

  const applyAnnotationHighlights = () => {
  const container = document.querySelector('.structured-html-view');
  if (!container) {
    console.log('❌ Container not found');
    return;
  }

  // Get annotations for current page only
  const currentPageData = documentData?.pages.find(p => p.page_number === currentPage);
  const pageAnnotations = currentPageData?.annotations || [];

  // Remove old highlights first
  container.querySelectorAll('.inline-annotation').forEach(el => {
    const textContent = el.textContent || '';
    const textNode = document.createTextNode(textContent);
    el.parentNode?.replaceChild(textNode, el);
  });
  container.normalize();

  console.log(`🎨 Applying ${pageAnnotations.length} annotations for page ${currentPage}`);

  // Apply each annotation
  pageAnnotations.forEach((annotation) => {
    const searchText = (annotation.text || annotation.selected_text || '').trim();
    if (!searchText) {
      console.warn('⚠️ Skipping empty annotation:', annotation.id);
      return;
    }

    // Try to use XPath if available
    if (annotation.start_xpath && annotation.end_xpath) {
      const startInfo = resolveXPath(annotation.start_xpath, container);
      const endInfo = resolveXPath(annotation.end_xpath, container);
      
      if (startInfo && endInfo && startInfo.node.nodeType === Node.TEXT_NODE) {
        const textNode = startInfo.node;
        const text = textNode.textContent || '';
        const parent = textNode.parentNode;
        
        if (!parent) return;
        
        const before = text.substring(0, startInfo.offset);
        const match = text.substring(startInfo.offset, endInfo.node === startInfo.node ? endInfo.offset : text.length);
        const after = text.substring(endInfo.node === startInfo.node ? endInfo.offset : text.length);
        
        console.log(`✅ Using XPath for annotation ${annotation.id}`);
        
        // Create annotation span
        const span = createAnnotationSpan(annotation, match);
        
        // Replace text node with annotated version
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(span);
        if (after) fragment.appendChild(document.createTextNode(after));
        
        parent.replaceChild(fragment, textNode);
        return;
      }
    }

    // Fallback: search for first occurrence (old behavior)
    console.log(`🔍 Searching for: "${searchText.substring(0, 50)}..." (no XPath)`);

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
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
        const span = createAnnotationSpan(annotation, match);

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

  const handleCreateRelationship = async () => {
  // Validation
  const errors: any = {};
  if (!newRelationship.source_annotation_id) {
    errors.source = 'Veuillez sélectionner une annotation source';
  }
  if (!newRelationship.target_annotation_id) {
    errors.target = 'Veuillez sélectionner une annotation cible';
  }
  if (newRelationship.source_annotation_id === newRelationship.target_annotation_id) {
    errors.same = 'Les annotations source et cible doivent être différentes';
  }
  if (!newRelationship.relationship_name.trim()) {
    errors.relationship = 'Veuillez entrer un nom de relation';
  }

  if (Object.keys(errors).length > 0) {
    setRelationshipErrors(errors);
    return;
  }

  try {
    const response = await axiosInstance.post('/annotation/relationships/create/', newRelationship);
      const data = response.data as { 
        success: boolean; 
        relationship: AnnotationRelationship;
        message: string;
        error?: string;
      };


    if (data.success) {
      setRelationships([...relationships, data.relationship]);
      setShowRelationshipModal(false);
      setNewRelationship({
        source_annotation_id: '',
        target_annotation_id: '',
        relationship_name: '',
        description: ''
      });
      setRelationshipErrors({});
      alert('Relation créée avec succès !');
    }
  } catch (error: any) {
    console.error('Error creating relationship:', error);
    alert(error.response?.data?.error || 'Erreur lors de la création de la relation');
  }
};

const handleDeleteRelationship = async (relationshipId: number) => {
  if (!confirm('Êtes-vous sûr de vouloir supprimer cette relation ?')) return;

  try {
    const response = await axiosInstance.delete(`/annotation/relationships/delete/${relationshipId}/`);
    const data = response.data as { success: boolean; message: string };

    if (data.success) {
      setRelationships(relationships.filter(r => r.id !== relationshipId));
      alert('Relation supprimée avec succès');
    }
  } catch (error) {
    console.error('Error deleting relationship:', error);
    alert('Erreur lors de la suppression de la relation');
  }
};



  const getXPath = (node: Node, offset: number): string => {
    const container = document.querySelector('.structured-html-view');
    if (!container || !node) return '';
    
    let path = '';
    let currentNode: Node | null = node;
    
    while (currentNode && currentNode !== container) {
      if (currentNode.nodeType === Node.ELEMENT_NODE) {
        const element = currentNode as Element;
        let index = 0;
        let sibling = element.previousSibling;
        
        while (sibling) {
          if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
            index++;
          }
          sibling = sibling.previousSibling;
        }
        
        const tagName = element.nodeName.toLowerCase();
        path = `/${tagName}[${index + 1}]${path}`;
      } else if (currentNode.nodeType === Node.TEXT_NODE) {
        let textIndex = 0;
        let sibling = currentNode.previousSibling;
        
        while (sibling) {
          if (sibling.nodeType === Node.TEXT_NODE) {
            textIndex++;
          }
          sibling = sibling.previousSibling;
        }
        
        path = `/text()[${textIndex + 1}]${path}`;
      }
      
      currentNode = currentNode.parentNode;
    }
    
    return path + `::${offset}`;
  };

  const handleTextSelection = async () => {
    const selection = window.getSelection();
    const selectedTextContent = selection?.toString().trim();
    
    if (!selectedTextContent || !selection || selection.rangeCount === 0) return;
    
    // Vérifier qu'un type d'annotation est sélectionné
    if (!selectedAnnotationType) {
      alert('⚠️ Veuillez d\'abord sélectionner un type d\'annotation');
      return;
    }

    // Créer automatiquement l'annotation
    try {
      const page = documentData?.pages.find(p => p.page_number === currentPage);
      if (!page) return;

      const range = selection.getRangeAt(0);
      const startXPath = getXPath(range.startContainer, range.startOffset);
      const endXPath = getXPath(range.endContainer, range.endOffset);

      const payload = {
        page_id: page.id,
        selected_text: selectedTextContent,
        annotation_type_id: parseInt(selectedAnnotationType),
        start_xpath: startXPath,
        end_xpath: endXPath,
        start_pos: 0,
        end_pos: selectedTextContent.length,
        mode: 'structured'
      };

      const response = await axiosInstance.post('/annotation/add/', payload);
      const data = response.data;

      if (data.success) {
        console.log('✅ Annotation créée automatiquement');
        
        // Recharger les données du document
        await fetchDocument();
        
        // Nettoyer la sélection immédiatement
        if (window.getSelection) {
          window.getSelection()?.removeAllRanges();
        }
        
        // Réappliquer le filtre de page et les highlights
        setTimeout(() => {
          filterPageContent();
          applyAnnotationHighlights();
        }, 100);
      }
    } catch (error) {
      console.error('Error adding annotation:', error);
      alert('❌ Erreur lors de l\'ajout de l\'annotation');
    }
  };

  const handleAnnotateSelection = async () => {
    // Cette fonction n'est plus nécessaire mais on la garde pour compatibilité
    await handleTextSelection();
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
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Types d'Annotation</label>
                  {selectedAnnotationType && (
                    <span className="text-xs text-green-600 font-medium">
                      ✓ Sélectionnez du texte pour annoter automatiquement
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                  <Button variant="outline" size="sm" onClick={() => setShowRelationshipModal(true)} className="bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100">
                    <Plus className="w-4 h-4 mr-2" />
                    Créer Relation
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowRelationshipsList(!showRelationshipsList)} className="bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Relations ({relationships.length})
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {annotationTypes.map((type) => (
                    <Button
                      key={type.id}
                      variant={selectedAnnotationType === type.id.toString() ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedAnnotationType(type.id.toString())}
                      className={selectedAnnotationType === type.id.toString() ? 'bg-blue-600' : ''}
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
        {showRelationshipModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="w-5 h-5" />
                  Créer une Relation entre Annotations
                </CardTitle>
                <CardDescription className="text-purple-100">
                  Liez deux annotations pour créer une relation sémantique
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">Annotation Source *</label>
                  <select 
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    value={newRelationship.source_annotation_id}
                    onChange={(e) => setNewRelationship({...newRelationship, source_annotation_id: e.target.value})}
                  >
                    <option value="">-- Sélectionner annotation source --</option>
                    {annotations.map((ann) => (
                      <option key={ann.id} value={ann.id}>
                        [{ann.type_display}] {ann.text.substring(0, 60)}{ann.text.length > 60 ? '...' : ''}
                      </option>
                    ))}
                  </select>
                  {relationshipErrors.source && <p className="text-red-600 text-xs mt-1">{relationshipErrors.source}</p>}
                  {relationshipErrors.same && <p className="text-red-600 text-xs mt-1">{relationshipErrors.same}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Annotation Cible *</label>
                  <select 
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    value={newRelationship.target_annotation_id}
                    onChange={(e) => setNewRelationship({...newRelationship, target_annotation_id: e.target.value})}
                  >
                    <option value="">-- Sélectionner annotation cible --</option>
                    {annotations.map((ann) => (
                      <option key={ann.id} value={ann.id}>
                        [{ann.type_display}] {ann.text.substring(0, 60)}{ann.text.length > 60 ? '...' : ''}
                      </option>
                    ))}
                  </select>
                  {relationshipErrors.target && <p className="text-red-600 text-xs mt-1">{relationshipErrors.target}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Type de Relation *</label>
                  <input 
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    value={newRelationship.relationship_name}
                    onChange={(e) => setNewRelationship({...newRelationship, relationship_name: e.target.value})}
                    placeholder="Ex: approuvé_par, requis_pour, dépend_de..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Suggestions : approuvé_par, requis_pour, délivré_par, dépend_de, remplace, fait_référence_à, valide_pour
                  </p>
                  {relationshipErrors.relationship && <p className="text-red-600 text-xs mt-1">{relationshipErrors.relationship}</p>}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Description (optionnel)</label>
                  <textarea 
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                    value={newRelationship.description}
                    onChange={(e) => setNewRelationship({...newRelationship, description: e.target.value})}
                    placeholder="Ajoutez une description pour cette relation..."
                  />
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setShowRelationshipModal(false);
                      setNewRelationship({
                        source_annotation_id: '',
                        target_annotation_id: '',
                        relationship_name: '',
                        description: ''
                      });
                      setRelationshipErrors({});
                    }} 
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                  <Button 
                    onClick={handleCreateRelationship} 
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                  >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    Créer Relation
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {showRelationshipsList && relationships.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <CardHeader className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <LinkIcon className="w-5 h-5" />
                    Relations - Page {currentPage}
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowRelationshipsList(false)}
                    className="text-white hover:bg-white/20"
                  >
                    ✕
                  </Button>
                </div>
                <CardDescription className="text-indigo-100">
                  {relationships.length} relation(s) trouvée(s) sur cette page
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {relationships.map((rel) => (
                  <div key={rel.id} className="border rounded-lg p-4 bg-gradient-to-r from-purple-50 to-indigo-50 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="text-xs text-gray-600 mb-1">Source</div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rel.source.color }}></div>
                              <Badge variant="outline" className="text-xs" style={{ borderColor: rel.source.color, color: rel.source.color }}>
                                {rel.source.type}
                              </Badge>
                              <span className="text-sm font-medium">{rel.source.text.substring(0, 50)}{rel.source.text.length > 50 ? '...' : ''}</span>
                            </div>
                          </div>
                          <div className="px-3">
                            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                              <span>→</span>
                              <span>{rel.relationship_name.replace(/_/g, ' ')}</span>
                              <span>→</span>
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="text-xs text-gray-600 mb-1">Cible</div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rel.target.color }}></div>
                              <Badge variant="outline" className="text-xs" style={{ borderColor: rel.target.color, color: rel.target.color }}>
                                {rel.target.type}
                              </Badge>
                              <span className="text-sm font-medium">{rel.target.text.substring(0, 50)}{rel.target.text.length > 50 ? '...' : ''}</span>
                            </div>
                          </div>
                        </div>
                        {rel.description && (
                          <div className="text-sm text-gray-600 italic pl-4 border-l-2 border-purple-300">
                            {rel.description}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>Créé par: {rel.created_by}</span>
                          <span>•</span>
                          <span>{new Date(rel.created_at).toLocaleString('fr-FR')}</span>
                        </div>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => handleDeleteRelationship(rel.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
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

          <AnnotationPanel
            pageNumber={currentPage}
            totalPages={documentData.total_pages}
            annotations={currentPageData?.annotations || []}
            allDocumentAnnotations={documentData.pages.flatMap(page => page.annotations)}
            annotationTypes={annotationTypes}
            onDeleteAnnotation={handleDeleteAnnotation}
            onRefresh={fetchDocument}
            documentId={documentData.id}
          />
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
                  const isCurrentPage = pageNum === currentPage;
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={isCurrentPage ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-10 h-10 ${
                        isCurrentPage 
                          ? 'bg-blue-600 text-white hover:bg-blue-700' 
                          : page?.is_validated_by_human 
                            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                            : page?.is_annotated 
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                              : ''
                      }`}
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