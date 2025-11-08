import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import {
  ClipboardCheck,
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  Layers,
  Check,
  X,
  ChevronDown,
  Highlighter,
  Brain,
  AlertCircle
} from 'lucide-react';
import axios from '@/lib/axios';

interface Annotation {
  id: number;
  selected_text: string;
  start_pos: number;
  end_pos: number;
  annotation_type: {
    display_name: string;
    color: string;
  };
  created_by: {
    username: string;
  };
  created_at: string;
}

interface PageAnnotations {
  [pageNum: string]: {
    page_text_preview: string;
    annotations: Annotation[];
  };
}

interface DocumentData {
  id: number;
  title: string;
  created_at: string;
  total_pending: number;
  validated_annotations: number;
  rejected_annotations: number;
  total_annotations: number;
  completion_percentage: number;
  pages_with_annotations: PageAnnotations;
}

export default function ReviewAnnotations() {
  const router = useRouter();
  const { id } = router.query;
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsedPages, setCollapsedPages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (id) {
      fetchDocument();
    }
  }, [id]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      console.log('Fetching document with ID:', id);
      const response = await axios.get(`/expert/documents/${id}/review/`);
      
      console.log('Full response:', response);
      console.log('Response data:', response.data);
      console.log('Response status:', response.status);
      
      if (response.data && response.data.success) {
        // L'API retourne les données directement, pas dans un sous-objet
        const documentData = {
          id: response.data.id,
          title: response.data.title,
          created_at: response.data.created_at,
          total_pending: response.data.total_pending || 0,
          validated_annotations: response.data.validated_annotations || 0,
          rejected_annotations: response.data.rejected_annotations || 0,
          total_annotations: response.data.total_annotations || 0,
          completion_percentage: response.data.completion_percentage || 0,
          pages_with_annotations: response.data.pages_with_annotations || {}
        };
        console.log('Document data structured:', documentData);
        setDocument(documentData);
      } else {
        console.error('API returned success=false:', response.data);
        alert(`Erreur: ${response.data.error || 'Document non trouvé'}`);
      }
    } catch (error: any) {
      console.error('Error fetching document:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);
      if (error.response) {
        alert(`Erreur ${error.response.status}: ${error.response.data?.error || 'Erreur serveur'}`);
      } else {
        alert('Erreur de connexion au serveur');
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePage = (pageNum: string) => {
    const newCollapsed = new Set(collapsedPages);
    if (newCollapsed.has(pageNum)) {
      newCollapsed.delete(pageNum);
    } else {
      newCollapsed.add(pageNum);
    }
    setCollapsedPages(newCollapsed);
  };

  const toggleAllPages = () => {
    if (!document) return;
    const allPages = Object.keys(document.pages_with_annotations);
    if (collapsedPages.size === allPages.length) {
      setCollapsedPages(new Set());
    } else {
      setCollapsedPages(new Set(allPages));
    }
  };

  const validateAnnotation = async (annotationId: number, action: 'validate' | 'reject') => {
    try {
      await axios.post(`/expert/annotations/${annotationId}/validate/`, { action });
      // Rafraîchir les données
      fetchDocument();
      showNotification(
        action === 'validate' ? 'Annotation validée avec succès' : 'Annotation rejetée',
        'success'
      );
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors de la validation', 'error');
    }
  };

  const validateAllAnnotations = async () => {
    if (!confirm('Voulez-vous vraiment valider TOUTES les annotations en attente ?')) {
      return;
    }
    try {
      await axios.post(`/expert/documents/${id}/bulk-validate/`);
      showNotification('Toutes les annotations ont été validées', 'success');
      setTimeout(() => router.reload(), 1000);
    } catch (error) {
      console.error('Erreur:', error);
      showNotification('Erreur lors de la validation', 'error');
    }
  };

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    // TODO: Implémenter un système de notifications (toast)
    alert(message);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement du document...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!document) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Document non trouvé</h3>
          <p className="text-gray-600 mb-4">
            Le document avec l'ID {id} n'a pas pu être chargé.
          </p>
          <button
            onClick={() => router.push('/expert/documents')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retour à la liste
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* En-tête */}
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-r from-blue-500 to-teal-600 text-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
                  <ClipboardCheck className="w-7 h-7" />
                  Révision Expert
                </h1>
                <div className="flex items-center gap-4 text-sm opacity-90">
                  <span className="flex items-center gap-1">
                    <ClipboardCheck className="w-4 h-4" />
                    {document.title}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {new Date(document.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => router.push('/expert')}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all backdrop-blur-sm"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="p-6 bg-gradient-to-br from-blue-50 to-teal-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{document.total_pending}</div>
                  <div className="text-xs text-gray-600">En attente</div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{document.validated_annotations}</div>
                  <div className="text-xs text-gray-600">Validées</div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{document.rejected_annotations}</div>
                  <div className="text-xs text-gray-600">Rejetées</div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white p-4 rounded-xl shadow-sm">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Layers className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{document.total_annotations}</div>
                  <div className="text-xs text-gray-600">Total</div>
                </div>
              </div>
            </div>

            {/* Barre de progression */}
            <div>
              <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                <span>Progression de validation</span>
                <span className="font-bold">{document.completion_percentage}%</span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-300"
                  style={{ width: `${document.completion_percentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t bg-white flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/annotation/document/${id}/annotate`)}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all flex items-center gap-2"
              >
                <Highlighter className="w-4 h-4" />
                Annoter Document
              </button>

              <button
                onClick={validateAllAnnotations}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Valider Tout ({document.total_pending})
              </button>

              <button
                onClick={() => router.push(`/expert/documents/${id}/json`)}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all flex items-center gap-2"
              >
                <Brain className="w-4 h-4" />
                JSON
              </button>
            </div>
          </div>
        </Card>

        {/* Annotations par page */}
        {Object.keys(document.pages_with_annotations).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(document.pages_with_annotations).map(([pageNum, pageData]) => (
              <Card key={pageNum} className="overflow-hidden">
                <div
                  onClick={() => togglePage(pageNum)}
                  className="p-4 bg-gradient-to-r from-blue-50 to-teal-50 cursor-pointer hover:from-blue-100 hover:to-teal-100 transition-colors border-b"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                        {pageNum}
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">Page {pageNum}</h4>
                        <p className="text-sm text-gray-600">{pageData.page_text_preview}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold">
                        {pageData.annotations.length} annotation(s)
                      </span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-600 transition-transform ${
                          collapsedPages.has(pageNum) ? '-rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {!collapsedPages.has(pageNum) && (
                  <CardContent className="p-0">
                    {pageData.annotations.map((annotation) => (
                      <div
                        key={annotation.id}
                        className="p-6 border-b last:border-b-0 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <span
                                className="px-3 py-1 rounded-lg text-white text-sm font-semibold"
                                style={{ backgroundColor: annotation.annotation_type.color }}
                              >
                                {annotation.annotation_type.display_name}
                              </span>
                              <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {annotation.created_by.username} •{' '}
                                {new Date(annotation.created_at).toLocaleString('fr-FR')}
                              </span>
                            </div>

                            <div className="bg-gray-50 border-l-4 border-blue-500 p-4 rounded font-mono text-sm mb-2">
                              &quot;{annotation.selected_text}&quot;
                            </div>

                            <div className="text-xs text-gray-500 italic">
                              Position: {annotation.start_pos} - {annotation.end_pos}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => validateAnnotation(annotation.id, 'validate')}
                              className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2"
                            >
                              <Check className="w-4 h-4" />
                              Valider
                            </button>
                            <button
                              onClick={() => validateAnnotation(annotation.id, 'reject')}
                              className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all flex items-center gap-2"
                            >
                              <X className="w-4 h-4" />
                              Rejeter
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                ✨ Toutes les annotations ont été révisées !
              </h3>
              <p className="text-gray-600 mb-6">
                Aucune annotation en attente de validation pour ce document.
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => router.push(`/annotation/document/${id}/annotate`)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
                >
                  Annoter Document
                </button>
                <button
                  onClick={() => router.push(`/expert/documents/${id}/json`)}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all"
                >
                  JSON
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
