// pages/expert/documents/[id]/json.tsx
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
  Tags,
  BookOpen
} from 'lucide-react';

export default function DocumentJsonViewer() {
  const router = useRouter();
  const { id } = router.query;

  const [document, setDocument] = useState<any>(null);
  const [jsonData, setJsonData] = useState<any>(null);
  const [jsonString, setJsonString] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [stats, setStats] = useState({
    totalAnnotations: 0,
    annotatedPages: 0,
    totalPages: 0,
    progression: 0
  });
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDocumentJson();
    }
  }, [id]);

  useEffect(() => {
    if (jsonData) {
      setJsonString(JSON.stringify(jsonData, null, 2));
    }
  }, [jsonData]);

  const fetchDocumentJson = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/expert/documents/${id}/json/`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Erreur API:', response.status, errorText);
        throw new Error(`Erreur ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('Données reçues:', data);
      
      setDocument(data.document);
      setJsonData(data.annotations_json);
      setSummary(data.summary || '');
      setStats({
        totalAnnotations: data.total_annotations || 0,
        annotatedPages: data.annotated_pages || 0,
        totalPages: data.total_pages || 0,
        progression: data.progression || 0
      });
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
    a.download = `${document?.title || 'document'}_annotations_expert.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRegenerate = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/regenerate-json/`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (response.ok) {
        await fetchDocumentJson();
      }
    } catch (error) {
      console.error('Erreur:', error);
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
        <Card className="bg-gradient-to-r from-blue-500 to-green-500 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <FileCode className="w-6 h-6" />
                  JSON Document Expert
                </CardTitle>
                <p className="text-white/90 mt-2">{document?.title}</p>
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="flex items-center gap-1">
                    <FileText className="w-4 h-4" />
                    {stats.totalPages} page(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <Tags className="w-4 h-4" />
                    {stats.totalAnnotations} annotation(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <Check className="w-4 h-4" />
                    {stats.annotatedPages} page(s) annotée(s)
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                onClick={() => router.push('/expert/documents')}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.totalAnnotations}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Total Annotations
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.annotatedPages}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Pages Annotées
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.totalPages}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Total Pages
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.progression}%
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Progression
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        {summary && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Résumé Global du Document
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertDescription className="text-base leading-relaxed">
                  {summary}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* JSON Editor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                JSON Global du Document (Expert)
              </CardTitle>
              <Badge variant="outline" className="bg-green-50 text-green-700">
                <Check className="w-3 h-3 mr-1" />
                Chargé
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {jsonData && Object.keys(jsonData).length > 0 ? (
              <>
                <Alert className="mb-4">
                  <AlertDescription>
                    Ce JSON contient toutes les annotations validées par l'expert pour l'ensemble du document, organisées par entités.
                  </AlertDescription>
                </Alert>

                <JsonViewer
                  value={jsonData}
                  title="JSON Global du Document (Expert)"
                  height="600px"
                  readOnly={true}
                  onCopy={handleCopyJson}
                  onDownload={handleDownloadJson}
                  showActions={true}
                />

                <div className="flex gap-3 mt-4" style={{ display: 'none' }}>
                  <Button
                    variant="outline"
                    onClick={handleCopyJson}
                    className={copySuccess ? 'bg-green-50' : ''}
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
                    Télécharger JSON
                  </Button>

                  <Button variant="outline" onClick={handleRegenerate}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Régénérer
                  </Button>
                </div>
              </>
            ) : (
              <Alert variant="destructive">
                <AlertDescription>
                  Aucun JSON global généré pour ce document ou aucune entité trouvée.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Page Navigation */}
        {document?.pages && document.pages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Navigation par Pages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {document.pages.map((page: any) => (
                  <Button
                    key={page.id}
                    variant={page.annotation_count > 0 ? 'default' : 'outline'}
                    className="flex flex-col items-center py-3 h-auto"
                    onClick={() => router.push(`/expert/documents/${id}/pages/${page.page_number}/json`)}
                  >
                    <span className="font-semibold">Page {page.page_number}</span>
                    <span className="text-xs mt-1">
                      {page.annotation_count > 0
                        ? `${page.annotation_count} annotation${page.annotation_count > 1 ? 's' : ''}`
                        : 'Aucune annotation'}
                    </span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Actions Rapides Expert</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => router.push(`/expert/documents/${id}/annotate`)}
              >
                <Tags className="w-6 h-6" />
                <span>Continuer l'annotation</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => router.push('/expert')}
              >
                <FileText className="w-6 h-6" />
                <span>Dashboard Expert</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => router.push(`/expert/documents/${id}/json-enriched`)}
              >
                <FileCode className="w-6 h-6" />
                <span>JSON Enrichi</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
