// pages/expert/documents/[id]/pages/[pageNumber]/json.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import JsonViewer from '@/components/editor/JsonViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FileCode,
  Copy,
  Download,
  ArrowLeft,
  Check,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Info
} from 'lucide-react';

export default function PageJsonViewer() {
  const router = useRouter();
  const { id, pageNumber } = router.query;

  const [document, setDocument] = useState<any>(null);
  const [page, setPage] = useState<any>(null);
  const [jsonData, setJsonData] = useState<any>(null);
  const [jsonString, setJsonString] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (id && pageNumber) {
      fetchPageJson();
    }
  }, [id, pageNumber]);

  useEffect(() => {
    if (jsonData) {
      setJsonString(JSON.stringify(jsonData, null, 2));
    }
  }, [jsonData]);

  const fetchPageJson = async () => {
    try {
      setLoading(true);
      const url = `http://localhost:8000/api/expert/documents/${id}/pages/${pageNumber}/json/`;
      console.log('Fetching:', url);
      
      const response = await fetch(url, { credentials: 'include' });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur API:', response.status, errorText);
        throw new Error(`Erreur ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Données reçues:', data);
      
      setDocument(data.document);
      setJsonData(data.annotations_json || {});
      setSummary(data.summary || '');
      setTotalPages(data.total_pages || 1);
    } catch (error) {
      console.error('Erreur complète:', error);
      alert(`Erreur: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const handleDownloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page_${currentPage}_annotations.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navigatePage = (direction: number) => {
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
      router.push(`/expert/documents/${id}/pages/${newPage}/json`);
    }
  };

  const handleValidateAndNext = () => {
    if (currentPage < totalPages) {
      navigatePage(1);
    } else {
      // Dernière page - valider le document complet
      router.push(`/expert/documents/${id}/review`);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FileCode className="w-6 h-6" />
                  JSON Page {currentPage} - {document?.title}
                </CardTitle>
                <div className="flex gap-4 mt-3 text-sm text-white/90">
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    Validation et édition du JSON
                  </span>
                  <span className="flex items-center gap-1">
                    <FileCode className="w-4 h-4" />
                    Page {currentPage}
                  </span>
                  <span className="flex items-center gap-1">
                    <Info className="w-4 h-4" />
                    Mode Expert
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                onClick={() => router.push(`/expert/documents/${id}/review?page=${currentPage}`)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Page Navigation */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="px-4 py-2 text-base">
                  <FileCode className="w-4 h-4 mr-2" />
                  JSON Page {currentPage}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground mr-2">
                  <Info className="w-4 h-4 inline mr-1" />
                  Validation et édition JSON
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {summary && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Résumé des Annotations (Page {currentPage})
                </CardTitle>
                <Badge className="bg-green-600">
                  <Check className="w-3 h-3 mr-1" />
                  Disponible
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="leading-relaxed whitespace-pre-line">{summary}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* JSON Editor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                JSON Structuré des Annotations
              </CardTitle>
              {jsonData && Object.keys(jsonData).length > 0 ? (
                <Badge className="bg-green-600">
                  <Check className="w-3 h-3 mr-1" />
                  Chargé
                </Badge>
              ) : (
                <Badge variant="destructive">
                  Manquant
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {jsonData && Object.keys(jsonData).length > 0 ? (
              <>
                <JsonViewer
                  value={jsonData}
                  title={`JSON Page ${currentPage}`}
                  height="600px"
                  readOnly={false}
                  onCopy={handleCopyJson}
                  onDownload={handleDownloadJson}
                  showActions={true}
                />

                <div className="flex gap-3 mt-4" style={{ display: 'none' }}>
                  <Button
                    variant="outline"
                    onClick={handleCopyJson}
                    className={copySuccess ? 'bg-green-50 border-green-200' : ''}
                  >
                    {copySuccess ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copier le JSON
                      </>
                    )}
                  </Button>

                  <Button variant="outline" onClick={handleDownloadJson}>
                    <Download className="w-4 h-4 mr-2" />
                    Télécharger
                  </Button>
                </div>
              </>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  <Info className="w-4 h-4 inline mr-2" />
                  Aucune donnée JSON disponible pour cette page.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <Card>
          <CardContent className="py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              {currentPage < totalPages ? (
                <Button
                  size="lg"
                  className="h-auto py-6 flex flex-col items-center gap-2"
                  onClick={handleValidateAndNext}
                >
                  <Check className="w-6 h-6" />
                  <div className="text-center">
                    <div className="font-semibold">Valider JSON & Page Suivante</div>
                    <div className="text-xs opacity-90">Aller à la page {currentPage + 1}</div>
                  </div>
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="h-auto py-6 flex flex-col items-center gap-2"
                  onClick={handleValidateAndNext}
                >
                  <FileText className="w-6 h-6" />
                  <div className="text-center">
                    <div className="font-semibold">Valider JSON & Résumé Document Complet</div>
                    <div className="text-xs opacity-90">Marquer le document comme terminé</div>
                  </div>
                </Button>
              )}

              <Button
                size="lg"
                variant="outline"
                className="h-auto py-6 flex flex-col items-center gap-2"
                onClick={() => router.push(`/expert/documents/${id}/review?page=${currentPage}`)}
              >
                <ArrowLeft className="w-6 h-6" />
                <div className="text-center">
                  <div className="font-semibold">Retour Page {currentPage}</div>
                  <div className="text-xs opacity-90">Continuer la révision</div>
                </div>
              </Button>
            </div>

            {/* Page Navigation Controls */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigatePage(-1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Précédent
              </Button>

              <span className="text-sm text-muted-foreground">
                Page {currentPage} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigatePage(1)}
                disabled={currentPage === totalPages}
              >
                Suivant
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
