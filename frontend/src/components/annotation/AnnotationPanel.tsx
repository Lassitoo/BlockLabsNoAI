import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileCode, Code, Copy, Edit, Trash2, CheckCircle, Save, AlertCircle } from 'lucide-react';
import axiosInstance from '@/lib/axios';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Annotation {
  id: number;
  start_pos: number;
  end_pos: number;
  text?: string;
  selected_text?: string;
  type: string;
  type_display: string;
  color: string;
  confidence: number;
  reasoning?: string;
  is_validated: boolean;
  mode: string;
  start_xpath?: string | null;
  end_xpath?: string | null;
  created_by: string;
}

interface AnnotationPanelProps {
  pageNumber: number;
  totalPages: number;
  annotations: Annotation[];
  annotationTypes: Array<{ id: number; name: string; display_name: string; color: string }>;
  onDeleteAnnotation: (id: number) => void;
  onRefresh: () => void;
  documentId: number;
}

export const AnnotationPanel = ({
  pageNumber,
  totalPages,
  annotations,
  annotationTypes,
  onDeleteAnnotation,
  onRefresh,
  documentId
}: AnnotationPanelProps) => {
  const [viewMode, setViewMode] = useState<'simple' | 'json'>('simple');
  const [activeTab, setActiveTab] = useState<'page' | 'document'>('page');
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [editedText, setEditedText] = useState('');
  const [editedTypeId, setEditedTypeId] = useState<string>('');
  const [documentAnnotations, setDocumentAnnotations] = useState<Annotation[]>([]);
  const [editedJsonString, setEditedJsonString] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Récupérer les annotations du document complet
  useEffect(() => {
    if (activeTab === 'document' && documentId) {
      fetchDocumentAnnotations();
    }
  }, [activeTab, documentId]);

  const fetchDocumentAnnotations = async () => {
    try {
      const response = await axiosInstance.get(`/annotation/document/${documentId}/all-annotations/`);
      if (response.data.success) {
        setDocumentAnnotations(response.data.annotations || []);
      }
    } catch (error) {
      console.error('Error fetching document annotations:', error);
    }
  };

  // Utiliser les annotations appropriées selon l'onglet actif
  const currentAnnotations = activeTab === 'page' ? annotations : documentAnnotations;

  // Grouper les annotations par type
  const groupedEntities = currentAnnotations.reduce((acc, ann) => {
    const typeDisplay = ann.type_display;
    if (!acc[typeDisplay]) {
      acc[typeDisplay] = [];
    }
    acc[typeDisplay].push(ann.selected_text || ann.text || '');
    return acc;
  }, {} as Record<string, string[]>);

  // Générer le JSON selon l'onglet actif
  const pageJson = React.useMemo(() => activeTab === 'page' ? {
    page: {
      number: pageNumber,
      annotations_count: annotations.length
    },
    entities: groupedEntities,
    annotations: annotations.map(ann => ({
      id: ann.id,
      start_pos: ann.start_pos,
      end_pos: ann.end_pos,
      selected_text: ann.selected_text || ann.text,
      type: ann.type,
      type_display: ann.type_display,
      color: ann.color,
      confidence: ann.confidence,
      reasoning: ann.reasoning || 'exact match',
      is_validated: ann.is_validated,
      mode: ann.mode,
      start_xpath: ann.start_xpath,
      end_xpath: ann.end_xpath
    })),
    generated_at: new Date().toISOString()
  } : {
    document: {
      id: documentId,
      total_pages: totalPages,
      total_annotations: documentAnnotations.length
    },
    entities: groupedEntities,
    annotations: documentAnnotations.map(ann => ({
      id: ann.id,
      start_pos: ann.start_pos,
      end_pos: ann.end_pos,
      selected_text: ann.selected_text || ann.text,
      type: ann.type,
      type_display: ann.type_display,
      color: ann.color,
      confidence: ann.confidence,
      reasoning: ann.reasoning || 'exact match',
      is_validated: ann.is_validated,
      mode: ann.mode,
      start_xpath: ann.start_xpath,
      end_xpath: ann.end_xpath
    })),
    generated_at: new Date().toISOString()
  }, [activeTab, pageNumber, annotations, documentId, totalPages, documentAnnotations]);

  // Initialiser le JSON édité - seulement quand on change d'onglet ou de page
  useEffect(() => {
    setEditedJsonString(JSON.stringify(pageJson, null, 2));
  }, [activeTab, pageNumber, documentAnnotations.length, annotations.length]);

  const copyToClipboard = () => {
    const jsonToCopy = viewMode === 'json' ? editedJsonString : JSON.stringify(pageJson, null, 2);
    navigator.clipboard.writeText(jsonToCopy);
    alert('✅ JSON copié dans le presse-papier!');
  };

  const handleSaveJson = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      // Valider le JSON
      let parsedJson;
      try {
        parsedJson = JSON.parse(editedJsonString);
      } catch (e) {
        setSaveError('JSON invalide. Veuillez corriger les erreurs de syntaxe.');
        setIsSaving(false);
        return;
      }

      // Envoyer au backend
      const endpoint = activeTab === 'page' 
        ? `/annotation/page/${pageNumber}/save-json/`
        : `/annotation/document/${documentId}/save-json/`;
      
      const response = await axiosInstance.post(endpoint, {
        json_data: parsedJson,
        document_id: documentId
      });

      if (response.data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        onRefresh();
      }
    } catch (error: any) {
      console.error('Error saving JSON:', error);
      setSaveError(error.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (annotationId: number) => {
    if (!confirm('Supprimer cette annotation ?')) return;
    
    try {
      await onDeleteAnnotation(annotationId);
      onRefresh();
    } catch (error) {
      console.error('Error deleting annotation:', error);
    }
  };

  const handleEdit = (annotation: Annotation) => {
    setEditingAnnotation(annotation);
    setEditedText(annotation.selected_text || annotation.text || '');
    
    // Trouver le type ID correspondant
    const matchingType = annotationTypes.find(t => t.display_name === annotation.type_display);
    setEditedTypeId(matchingType ? matchingType.id.toString() : '');
  };

  const handleSaveEdit = async () => {
    if (!editingAnnotation || !editedText.trim()) return;

    try {
      const response = await axiosInstance.post(`/annotation/update/${editingAnnotation.id}/`, {
        selected_text: editedText,
        annotation_type_id: parseInt(editedTypeId)
      });

      if (response.data.success) {
        setEditingAnnotation(null);
        setEditedText('');
        setEditedTypeId('');
        onRefresh();
        alert('✅ Annotation modifiée avec succès!');
      }
    } catch (error) {
      console.error('Error updating annotation:', error);
      alert('❌ Erreur lors de la modification');
    }
  };

  const handleCancelEdit = () => {
    setEditingAnnotation(null);
    setEditedText('');
    setEditedTypeId('');
  };

  return (
    <Card className="shadow-xl border-gray-200 bg-slate-950 h-full">
      <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white text-lg">
            <FileCode className="w-5 h-5" />
            Aperçu JSON - Mode {viewMode === 'simple' ? 'Simple' : 'Code'}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setViewMode(viewMode === 'simple' ? 'json' : 'simple')}
              className="text-white hover:bg-gray-700"
            >
              {viewMode === 'simple' ? (
                <>
                  <Code className="w-4 h-4 mr-2" />
                  Mode Code
                </>
              ) : (
                <>
                  <FileCode className="w-4 h-4 mr-2" />
                  Mode Simple
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={copyToClipboard}
              className="text-white hover:bg-gray-700"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 bg-slate-950">
        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-slate-800 pb-2">
          <Button
            size="sm"
            variant={activeTab === 'page' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('page')}
            className={activeTab === 'page' ? 'bg-blue-600' : 'text-slate-400'}
          >
            Page {pageNumber}
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'document' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('document')}
            className={activeTab === 'document' ? 'bg-blue-600' : 'text-slate-400'}
          >
            Document
          </Button>
        </div>

        {/* Page Info */}
        <div className="bg-green-500/10 p-3 rounded-lg mb-4 border-l-4 border-green-500">
          <div className="text-sm font-semibold text-green-400">
            Page {pageNumber} / {totalPages}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {annotations.length} annotations
          </div>
        </div>

        {/* Save/Error Messages */}
        {saveSuccess && (
          <Alert className="mb-4 bg-green-500/10 border-green-500">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <AlertDescription className="text-green-400">
              JSON sauvegardé avec succès!
            </AlertDescription>
          </Alert>
        )}
        {saveError && (
          <Alert className="mb-4 bg-red-500/10 border-red-500">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <AlertDescription className="text-red-400">
              {saveError}
            </AlertDescription>
          </Alert>
        )}

        {/* Content */}
        {viewMode === 'simple' ? (
          <div className="max-h-[calc(70vh-200px)] overflow-y-auto space-y-3">
            {currentAnnotations.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Aucune annotation</p>
              </div>
            ) : (
              currentAnnotations.map((ann) => (
                <div
                  key={ann.id}
                  className="bg-slate-900 rounded-lg border border-slate-800 hover:border-slate-700 transition-all group p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          style={{
                            backgroundColor: `${ann.color}20`,
                            borderColor: ann.color,
                            color: ann.color
                          }}
                          className="text-xs font-semibold"
                        >
                          {ann.type_display}
                        </Badge>
                        <span className="text-xs text-slate-500">#{ann.id}</span>
                        {ann.is_validated && (
                          <CheckCircle className="w-3 h-3 text-green-500" />
                        )}
                      </div>
                      <p className="text-sm text-slate-200 mb-2 leading-relaxed">
                        "{ann.selected_text || ann.text}"
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          {ann.confidence}% confiance
                        </span>
                        <span>•</span>
                        <span>{ann.created_by}</span>
                        <span>•</span>
                        <span>{ann.mode}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(ann)}
                        className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-8 w-8 p-0"
                        title="Éditer"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(ann.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={editedJsonString}
              onChange={(e) => setEditedJsonString(e.target.value)}
              className="w-full bg-slate-900 p-4 rounded-lg overflow-x-auto min-h-[calc(70vh-250px)] text-xs leading-relaxed text-slate-200 border border-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveJson}
                disabled={isSaving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Code className="w-4 h-4 mr-2 animate-spin" />
                    Sauvegarde...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Sauvegarder JSON
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditedJsonString(JSON.stringify(pageJson, null, 2))}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Réinitialiser
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Modal d'édition */}
      {editingAnnotation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl bg-slate-900 border-slate-700">
            <CardHeader className="bg-gradient-to-r from-blue-900 to-blue-800 border-b border-slate-700">
              <CardTitle className="text-white">
                Modifier l'annotation #{editingAnnotation.id}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-200 mb-2 block">
                  Texte de l'annotation
                </label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  placeholder="Texte de l'annotation..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-200 mb-2 block">
                  Type d'annotation
                </label>
                <select
                  value={editedTypeId}
                  onChange={(e) => setEditedTypeId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionner un type</option>
                  {annotationTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleCancelEdit}
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!editedText.trim() || !editedTypeId}
                >
                  Enregistrer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
};
