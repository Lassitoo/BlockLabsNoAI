import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RawDocument } from '@/types/document';
import { documentService } from '@/services/documentService';
import { toast } from 'sonner';
import {
  FileCode,
  FileText,
  Edit3,
  Save,
  Copy,
  Download,
  RefreshCw,
  Maximize2,
  Loader2,
} from 'lucide-react';

interface SplitViewProps {
  document: RawDocument;
}

export const SplitView = ({ document }: SplitViewProps) => {
  const [structuredHtml, setStructuredHtml] = useState<string>(document.structured_html || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!document.structured_html) {
      loadStructuredHtml();
    }
  }, [document.id]);

  const loadStructuredHtml = async (regen: boolean = false) => {
    setIsLoading(true);
    try {
      const html = await documentService.getStructuredHtml(document.id, regen);
      setStructuredHtml(html);
    } catch (error: any) {
      console.error('Load HTML error:', error);
      toast.error('Erreur lors du chargement du contenu structuré');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleEditMode = () => {
    if (isEditing) {
      // Exiting edit mode - save changes
      handleSave();
    }
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    if (Object.keys(editedContent).length === 0) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const edits = Object.entries(editedContent).map(([element_id, new_text]) => ({
        element_id,
        new_text,
      }));

      await documentService.saveStructuredEdits(document.id, edits);
      toast.success('Modifications sauvegardées avec succès!');
      setEditedContent({});
      await loadStructuredHtml();
      setIsEditing(false);
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(structuredHtml);
    toast.success('HTML copié dans le presse-papiers!');
  };

  const handleDownloadHtml = () => {
  // 1. Assure-toi d’avoir le nom du fichier quelque part
  // Exemple : const fileName = props.file?.name || 'document';
  const fileName = document.file_name || 'document';   // Remplace par ta vraie variable

  // 2. Normalise le nom : retire .pdf (insensible à la casse)
  const baseName = fileName.replace(/\.pdf$/i, '');

  // 3. Crée le Blob
  const blob = new Blob([structuredHtml], { type: 'text/html' });

  // 4. URL + téléchargement
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}_structured.html`;
  document.body.appendChild(a);
  a.click();

  // 5. Nettoyage
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // 6. Notification (Sonner)
  toast('HTML téléchargé !');
};

  const handleContentEdit = (elementId: string, newText: string) => {
    setEditedContent(prev => ({ ...prev, [elementId]: newText }));
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-border">
          {/* Structured Content Panel */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                <h3 className="font-semibold">Contenu Structuré</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={toggleEditMode}
                  disabled={isSaving}
                >
                  {isEditing ? (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Sauvegarder
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-4 h-4" />
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={handleCopyHtml}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={handleDownloadHtml}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="h-[700px] overflow-y-auto p-4 bg-white">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div
                  className={`prose prose-sm max-w-none ${isEditing ? 'editable-content' : ''}`}
                  dangerouslySetInnerHTML={{ __html: structuredHtml }}
                  contentEditable={isEditing}
                  onBlur={(e) => {
                    if (isEditing) {
                      const target = e.target as HTMLElement;
                      const elementId = target.getAttribute('data-element-id');
                      if (elementId) {
                        handleContentEdit(elementId, target.innerText);
                      }
                    }
                  }}
                />
              )}
            </div>
          </div>

          {/* PDF Viewer Panel */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-pink-500 to-red-600 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h3 className="font-semibold">PDF Original</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() =>
                    window.open(documentService.getOriginalPdfUrl(document.id), '_blank')
                  }
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="h-[700px] bg-gray-100">
              <iframe
                src={documentService.getOriginalPdfUrl(document.id)}
                className="w-full h-full border-0"
                title="PDF Original"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};