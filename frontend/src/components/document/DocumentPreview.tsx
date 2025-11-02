/**
 * DocumentPreview Component
 * 
 * Displays uploaded document with three tabs:
 * 1. Metadata - Edit document metadata
 * 2. Structured Content - View extracted HTML structure
 * 3. PDF Original - View original PDF file
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MetadataForm } from './MetadataForm';
import { StructuredContentEditor } from './StructuredContentEditor';
import { RawDocument } from '@/types/document';
import { ArrowLeft, FileText, Code } from 'lucide-react';

// ==================== TYPES ====================

interface DocumentPreviewProps {
  document: RawDocument;
  onBackToList: () => void;
}

// ==================== COMPONENT ====================

export const DocumentPreview = ({ document, onBackToList }: DocumentPreviewProps) => {
  // ==================== STATE ====================
  
  const [activeTab, setActiveTab] = useState('metadata');
  const [structuredHtml, setStructuredHtml] = useState<string>('');
  const [loadingStructured, setLoadingStructured] = useState(false);

  // ==================== EFFECTS ====================

  useEffect(() => {
    if (document?.id) {
      fetchStructuredHtml();
    }
  }, [document?.id]);

  // ==================== HANDLERS ====================

  const fetchStructuredHtml = async () => {
    setLoadingStructured(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/document/${document.id}/structured/`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStructuredHtml(data.structured_html || '');
        }
      }
    } catch (error) {
      console.error('Error fetching structured HTML:', error);
    } finally {
      setLoadingStructured(false);
    }
  };

  // ==================== RENDER ====================

  return (
    <div className="space-y-6">
      {/* ==================== HEADER ==================== */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBackToList}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">
            {document.metadata.title || document.file_name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Document importé • {new Date(document.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* ==================== TABS ==================== */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Tab Navigation */}
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="metadata" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Métadonnées
          </TabsTrigger>
          <TabsTrigger value="structured" className="flex items-center gap-2">
            <Code className="w-4 h-4" />
            Contenu Structuré
          </TabsTrigger>
          <TabsTrigger value="pdf" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            PDF Original
          </TabsTrigger>
        </TabsList>

        {/* ==================== TAB 1: METADATA ==================== */}
        <TabsContent value="metadata">
          <MetadataForm document={document} />
        </TabsContent>

        {/* ==================== TAB 2: STRUCTURED CONTENT ==================== */}
        <TabsContent value="structured">
          <Card className="border-0 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <CardTitle className="text-xl flex items-center gap-2">
                <Code className="w-5 h-5 text-blue-600" />
                Contenu Structuré
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Visualisez et éditez le contenu extrait du document
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingStructured ? (
                // Loading state
                <div className="flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Chargement du contenu structuré...</p>
                  </div>
                </div>
              ) : structuredHtml ? (
                // Structured HTML Editor
                <StructuredContentEditor 
                  structuredHtml={structuredHtml}
                  documentId={document.id}
                  onSave={(newHtml) => setStructuredHtml(newHtml)}
                />
              ) : (
                // Empty state
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium text-muted-foreground mb-2">
                    Aucun contenu structuré disponible
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Le contenu structuré n&apos;a pas encore été extrait pour ce document
                  </p>
                  <Button
                    variant="outline"
                    onClick={fetchStructuredHtml}
                  >
                    Recharger le contenu
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== TAB 3: PDF ORIGINAL ==================== */}
        <TabsContent value="pdf">
          <Card>
            <CardHeader>
              <CardTitle>PDF Original</CardTitle>
            </CardHeader>
            <CardContent>
              <iframe
                src={`http://localhost:8000/api/view-original/${document.id}/`}
                className="w-full h-[800px] border rounded"
                title="PDF Original"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};