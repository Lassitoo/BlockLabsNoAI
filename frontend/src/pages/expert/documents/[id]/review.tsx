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
    page_id: number;
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
  const [relationships, setRelationships] = useState<any[]>([]);
  const [showRelationships, setShowRelationships] = useState(false);
  const [editingRelationship, setEditingRelationship] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [rejectedRelationships, setRejectedRelationships] = useState<Set<number>>(new Set());
  const [editForm, setEditForm] = useState({
    source_annotation_id: '',
    target_annotation_id: '',
    relationship_name: '',
    description: ''
  });

  useEffect(() => {
  if (id) {
    fetchDocument();
  }
}, [id]);

useEffect(() => {
  if (document) {
    fetchRelationships();
  }
}, [document]);

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

  const fetchRelationships = async () => {
  if (!document) return;

  try {
    const allRelationships: any[] = [];

    // Iterate through pages and fetch relationships using the actual page_id
    for (const [pageNum, pageData] of Object.entries(document.pages_with_annotations)) {
      const pageId = (pageData as any).page_id;

      if (!pageId) {
        console.warn(`No page_id found for page ${pageNum}`);
        continue;
      }

      try {
        const response = await axios.get(`/annotation/relationships/page/${pageId}/`);
        if (response.data.success) {
          allRelationships.push(...response.data.relationships);
        }
      } catch (error) {
        console.error(`Error fetching relationships for page ${pageNum} (ID: ${pageId}):`, error);
      }
    }

    setRelationships(allRelationships);
  } catch (error) {
    console.error('Error fetching relationships:', error);
  }
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


  const approveRelationship = async (relationshipId: number) => {
  try {
    await axios.post(`/expert/relationships/${relationshipId}/validate/`, { action: 'validate' });
    setRelationships(prev => prev.filter(rel => rel.id !== relationshipId));
    showNotification('Relation approuvée avec succès', 'success');
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de l\'approbation', 'error');
  }
};


const rejectRelationship = (relationshipId: number) => {
  setRejectedRelationships(prev => new Set(prev).add(relationshipId));
};

const openEditModal = (relationship: any) => {
  setEditingRelationship(relationship);
  setEditForm({
    source_annotation_id: relationship.source.id.toString(),
    target_annotation_id: relationship.target.id.toString(),
    relationship_name: relationship.relationship_name,
    description: relationship.description || ''
  });
  setShowEditModal(true);
};

const deleteRelationship = async (relationshipId: number) => {
  if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement cette relation ?')) {
    return;
  }

  try {
    await axios.delete(`/expert/relationships/${relationshipId}/delete/`);
    setRejectedRelationships(prev => {
      const newSet = new Set(prev);
      newSet.delete(relationshipId);
      return newSet;
    });
    setRelationships(prev => prev.filter(rel => rel.id !== relationshipId));
    showNotification('Relation supprimée avec succès', 'success');
  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la suppression', 'error');
  }
};

const saveEditedRelationship = async () => {
  if (!editingRelationship) return;

  try {
    const response = await axios.put(`/expert/relationships/${editingRelationship.id}/update/`, {
      source_annotation_id: parseInt(editForm.source_annotation_id),
      target_annotation_id: parseInt(editForm.target_annotation_id),
      relationship_name: editForm.relationship_name,
      description: editForm.description,
      validate: true
    });

    setShowEditModal(false);
setEditingRelationship(null);

setRejectedRelationships(prev => {
  const newSet = new Set(prev);
  newSet.delete(editingRelationship.id);
  return newSet;
});

// Remove it from the displayed list
setRelationships(prev => prev.filter(rel => rel.id !== editingRelationship.id));

showNotification('Relation modifiée et approuvée', 'success');

  } catch (error) {
    console.error('Erreur:', error);
    showNotification('Erreur lors de la modification', 'error');
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
              <button
                onClick={() => setShowRelationships(!showRelationships)}
                className={`px-4 py-2 ${showRelationships ? 'bg-gradient-to-r from-indigo-600 to-purple-700' : 'bg-gradient-to-r from-indigo-500 to-purple-600'} text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center gap-2`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Relations ({relationships.length})
              </button>
            </div>
          </div>
        </Card>

        {/* Relationships Section */}
          {showRelationships && (
            <Card className="mb-6">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Relations ({relationships.length})
                </h2>
                <p className="text-indigo-100 mt-1">Validez ou corrigez les relations entre annotations</p>
              </div>

              <CardContent className="p-6">
                {relationships.length === 0 ? (
                  <div className="text-center py-12">
                    <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <p className="text-gray-600">Aucune relation trouvée</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {relationships.map((rel) => (
                      <div key={rel.id} className="border rounded-lg p-6 bg-gradient-to-r from-indigo-50 to-purple-50 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            {/* Source */}
                            <div className="mb-3">
                              <div className="text-xs text-gray-600 mb-1 font-medium">SOURCE</div>
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rel.source.color }}></div>
                                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: rel.source.color + '30', color: rel.source.color }}>
                                  {rel.source.type}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-800 pl-4">
                                &quot;{rel.source.text.substring(0, 80)}{rel.source.text.length > 80 ? '...' : ''}&quot;
                              </p>
                            </div>

                            {/* Relationship */}
                            <div className="flex items-center justify-center my-3">
                              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2">
                                <span>→</span>
                                <span>{rel.relationship_name.replace(/_/g, ' ').toUpperCase()}</span>
                                <span>→</span>
                              </div>
                            </div>

                            {/* Target */}
                            <div className="mb-3">
                              <div className="text-xs text-gray-600 mb-1 font-medium">CIBLE</div>
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rel.target.color }}></div>
                                <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: rel.target.color + '30', color: rel.target.color }}>
                                  {rel.target.type}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-gray-800 pl-4">
                                &quot;{rel.target.text.substring(0, 80)}{rel.target.text.length > 80 ? '...' : ''}&quot;
                              </p>
                            </div>

                            {/* Description */}
                            {rel.description && (
                              <div className="mt-3 pt-3 border-t border-indigo-200">
                                <div className="text-xs text-gray-600 mb-1 font-medium">DESCRIPTION</div>
                                <p className="text-sm text-gray-700 italic pl-4 border-l-2 border-indigo-300">
                                  {rel.description}
                                </p>
                              </div>
                            )}

                            {/* Meta */}
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
                              <span className="font-medium">Créé par:</span>
                              <span>{rel.created_by}</span>
                              <span>•</span>
                              <span>{new Date(rel.created_at).toLocaleString('fr-FR')}</span>
                              {rel.is_validated && (
                                <>
                                  <span>•</span>
                                  <span className="text-green-600 font-medium flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" />
                                    Validé
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                            <div className="flex flex-col gap-2 ml-4">

                              {/* NOT VALIDATED */}
                              {!rel.is_validated && (
                                <>
                                  {/* If NOT rejected → show Approve + Reject */}
                                  {!rejectedRelationships.has(rel.id) && (
                                    <>
                                      <button
                                        onClick={() => approveRelationship(rel.id)}
                                        className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2 whitespace-nowrap"
                                      >
                                        Approuver
                                      </button>

                                      <button
                                        onClick={() => rejectRelationship(rel.id)}
                                        className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all flex items-center gap-2 whitespace-nowrap"
                                      >
                                        Rejeter
                                      </button>
                                    </>
                                  )}

                                  {/* If rejected → show EDIT + DELETE (old beautiful design) */}
                                  {rejectedRelationships.has(rel.id) && (
                                    <>
                                      <button
                                        onClick={() => openEditModal(rel)}
                                        className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all flex items-center gap-2 whitespace-nowrap"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Éditer
                                      </button>

                                      <button
                                        onClick={() => deleteRelationship(rel.id)}
                                        className="px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 text-white rounded-lg hover:from-gray-800 hover:to-gray-900 transition-all flex items-center gap-2 whitespace-nowrap"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Supprimer
                                      </button>
                                    </>
                                  )}
                                </>
                              )}

                              {/* VALIDATED */}
                              {rel.is_validated && (
                                <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg flex items-center gap-2 whitespace-nowrap">
                                  <CheckCircle className="w-4 h-4" />
                                  Approuvé
                                </div>
                              )}
                            </div>

                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
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
      {/* Edit Relationship Modal */}
        {showEditModal && editingRelationship && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl">
              <div className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white p-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Éditer la Relation
                </h2>
                <p className="text-yellow-100 mt-1">Corrigez la relation puis validez</p>
              </div>

              <CardContent className="p-6 space-y-4">
                {/* Source Annotation Selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Annotation Source *</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    value={editForm.source_annotation_id}
                    onChange={(e) => setEditForm({...editForm, source_annotation_id: e.target.value})}
                  >
                    <option value="">-- Sélectionner annotation source --</option>
                    {document && Object.values(document.pages_with_annotations).flatMap((page: any) =>
                      page.annotations.map((ann: any) => (
                        <option key={ann.id} value={ann.id}>
                          [{ann.annotation_type.display_name}] {ann.selected_text.substring(0, 60)}{ann.selected_text.length > 60 ? '...' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Target Annotation Selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Annotation Cible *</label>
                  <select
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    value={editForm.target_annotation_id}
                    onChange={(e) => setEditForm({...editForm, target_annotation_id: e.target.value})}
                  >
                    <option value="">-- Sélectionner annotation cible --</option>
                    {document && Object.values(document.pages_with_annotations).flatMap((page: any) =>
                      page.annotations.map((ann: any) => (
                        <option key={ann.id} value={ann.id}>
                          [{ann.annotation_type.display_name}] {ann.selected_text.substring(0, 60)}{ann.selected_text.length > 60 ? '...' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Relationship Type */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Type de Relation *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    value={editForm.relationship_name}
                    onChange={(e) => setEditForm({...editForm, relationship_name: e.target.value})}
                    placeholder="Ex: approuvé_par, requis_pour..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Suggestions : approuvé_par, requis_pour, délivré_par, dépend_de, remplace
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Description</label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    rows={3}
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    placeholder="Description de la relation..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingRelationship(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={saveEditedRelationship}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Sauvegarder et Approuver
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
    </DashboardLayout>
  );
}