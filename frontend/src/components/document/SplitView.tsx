// src/components/document/SplitView.tsx
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  doc: RawDocument;
}

export const SplitView = ({ doc }: SplitViewProps) => {
  const [structuredHtml, setStructuredHtml] = useState<string>(doc.structured_html || '');
  const [structuredHtmlCss, setStructuredHtmlCss] = useState<string>(doc.structured_html_css || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [pdfError, setPdfError] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const pdfUrl = documentService.getOriginalPdfUrl(doc.id);

  // Charger le HTML structuré si non présent
  useEffect(() => {
    if (!doc.structured_html) {
      loadStructuredHtml();
    }
  }, [doc.id]);

  // ✅ CORRECTION MAJEURE: Gestion des modifications avec tracking précis
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !isEditing) return;

    const handleInput = (e: Event) => {
      const target = e.target as HTMLElement;
      const elementId = target.getAttribute('id');
      if (elementId && target.isContentEditable) {
        const newText = target.innerText.trim();
        console.log(`✏️ Modification: ${elementId} = "${newText.substring(0, 50)}..."`);

        // ✅ Utiliser une fonction de mise à jour pour éviter les stale closures
        setEditedContent(prev => {
          if (prev[elementId] === newText) return prev; // Éviter les re-renders inutiles
          return {
            ...prev,
            [elementId]: newText,
          };
        });
      }
    };

    // ✅ Utiliser 'input' uniquement pour de meilleures performances
    container.addEventListener('input', handleInput, true);

    return () => {
      container.removeEventListener('input', handleInput, true);
    };
  }, [isEditing]);

  // Charger le HTML structuré depuis le serveur
  const loadStructuredHtml = async (regen: boolean = false) => {
    setIsLoading(true);
    try {
      const html = await documentService.getStructuredHtml(doc.id, regen);
      console.log(`📄 HTML chargé (regen=${regen}): ${html.length} chars`);

      // ✅ IMPORTANT: Mettre à jour l'état AVANT de sortir du mode édition
      setStructuredHtml(html);
      setEditedContent({});

      toast.success(regen ? 'Contenu régénéré depuis le PDF original.' : 'Contenu rechargé avec succès.');
    } catch (error: any) {
      console.error('❌ Erreur chargement HTML:', error);
      toast.error('Impossible de charger le contenu structuré.');
    } finally {
      setIsLoading(false);
    }
  };

  // Activer/désactiver le mode édition
  const toggleEditMode = () => {
    if (isEditing) {
      handleSave();
    } else {
      setIsEditing(true);
      toast.info('Mode édition activé. Modifiez le texte directement.');
    }
  };

  // Sauvegarder avec gestion optimiste de l'UI

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const edits = Object.entries(editedContent).map(([element_id, new_text]) => ({
        element_id,
        new_text,
      }));

      // 1. Sauvegarde + réception du HTML modifié
      const { structured_html } = await documentService.saveStructuredEdits(doc.id, edits);

      // 2. Mise à jour IMMÉDIATE
      setStructuredHtml(structured_html);
      setEditedContent({});
      setIsEditing(false);

      toast.success('Modifications sauvegardées !');
    } catch (err: any) {
      console.error('Sauvegarde échouée:', err);
      toast.error(err.response?.data?.error || 'Échec de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Copier le HTML dans le presse-papiers
  const handleCopyHtml = () => {
    // ✅ Copier le HTML actuel (avec modifications non sauvegardées)
    const container = contentRef.current;
    const htmlToCopy = container ? container.innerHTML : structuredHtml;

    navigator.clipboard.writeText(htmlToCopy);
    toast.success('HTML copié dans le presse-papiers !');
  };

  // Télécharger le HTML
  const handleDownloadHtml = () => {
    const fileName = doc.file_name || 'document';
    const baseName = fileName.replace(/\.pdf$/i, '');

    // ✅ Télécharger le HTML actuel (avec modifications non sauvegardées)
    const container = contentRef.current;
    const htmlToDownload = container ? container.innerHTML : structuredHtml;

    const blob = new Blob([htmlToDownload], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_structured.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('HTML téléchargé !');
  };

  // En-têtes des panneaux
  const PanelHeader = ({ title, icon: Icon, actions }: { title: string; icon: any; actions: React.ReactNode }) => (
    <div className="flex items-center justify-between p-4 border-b bg-muted/50">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="w-4 h-4" />
        <span>{title}</span>
      </div>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  );

  // Bouton d'action
  const ActionButton = ({
    onClick,
    icon: Icon,
    label,
    disabled = false,
    variant = 'ghost',
  }: {
    onClick: () => void;
    icon: any;
    label: string;
    disabled?: boolean;
    variant?: 'ghost' | 'outline' | 'default';
  }) => (
    <Button
      size="sm"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 p-0"
      title={label}
    >
      <Icon className="w-3 h-3" />
    </Button>
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-x divide-border">
          {/* === PANNEAU CONTENU STRUCTURÉ === */}
          <div className="flex flex-col">
            <PanelHeader
              title="Contenu Structuré"
              icon={FileCode}
              actions={
                <>
                  <ActionButton
                    onClick={toggleEditMode}
                    icon={isEditing ? Save : Edit3}
                    label={isEditing ? 'Sauvegarder' : 'Modifier'}
                    disabled={isSaving || isLoading}
                    variant={isEditing ? 'default' : 'ghost'}
                  />
                  <ActionButton
                    onClick={() => loadStructuredHtml(true)}
                    icon={RefreshCw}
                    label="Régénérer depuis le PDF original"
                    disabled={isEditing || isSaving || isLoading}
                  />
                  <ActionButton
                    onClick={handleCopyHtml}
                    icon={Copy}
                    label="Copier le HTML"
                    disabled={isLoading}
                  />
                  <ActionButton
                    onClick={handleDownloadHtml}
                    icon={Download}
                    label="Télécharger le HTML"
                    disabled={isLoading}
                  />
                </>
              }
            />

            <div className="h-[700px] overflow-y-auto p-4 bg-background">
              {/* Inject CSS dynamically if available */}
              {structuredHtmlCss && (
                <style dangerouslySetInnerHTML={{ __html: structuredHtmlCss }} />
              )}
              
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Chargement...</span>
                </div>
              ) : isSaving ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  <span className="ml-2 text-sm text-blue-500">Sauvegarde en cours...</span>
                </div>
              ) : (
                <div
                  ref={contentRef}
                  className={`pdf-document-container prose prose-sm max-w-none transition-all ${
                    isEditing 
                      ? 'border-2 border-blue-300 rounded-md p-4 bg-blue-50 shadow-lg' 
                      : 'bg-white'
                  }`}
                  dangerouslySetInnerHTML={{ __html: structuredHtml }}
                  contentEditable={isEditing}
                  suppressContentEditableWarning={true}
                  onBlur={() => {
                    // ✅ Empêcher le blur de causer des re-renders pendant la sauvegarde
                    if (!isSaving) {
                      console.log('📋 Contenu finalisé');
                    }
                  }}
                />
              )}

              {/* ✅ Indicateur visuel des modifications non sauvegardées */}
              {isEditing && Object.keys(editedContent).length > 0 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    ⚠️ {Object.keys(editedContent).length} modification(s) non sauvegardée(s)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* === PANNEAU PDF ORIGINAL === */}
          <div className="flex flex-col">
            <PanelHeader
              title="PDF Original"
              icon={FileText}
              actions={
                <>
                  <ActionButton
                    onClick={() => {
                      setPdfError(false);
                      const iframe = document.querySelector('iframe[title="PDF Original"]') as HTMLIFrameElement;
                      if (iframe) iframe.src = iframe.src;
                    }}
                    icon={RefreshCw}
                    label="Actualiser"
                  />
                  <ActionButton
                    onClick={() => window.open(pdfUrl, '_blank')}
                    icon={Maximize2}
                    label="Ouvrir en plein écran"
                  />
                </>
              }
            />

            <div className="h-[700px] bg-muted/30">
              {!pdfError ? (
                <iframe
                  src={pdfUrl}
                  className="w-full h-full border-0"
                  title="PDF Original"
                  onError={() => setPdfError(true)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                  <h3 className="text-base font-medium mb-2">Erreur de chargement du PDF</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Impossible d'afficher le PDF dans cette fenêtre.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => window.open(pdfUrl, '_blank')} variant="outline" size="sm">
                      <Maximize2 className="w-3 h-3 mr-2" />
                      Nouvel onglet
                    </Button>
                    <Button onClick={() => setPdfError(false)} variant="outline" size="sm">
                      <RefreshCw className="w-3 h-3 mr-2" />
                      Réessayer
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};