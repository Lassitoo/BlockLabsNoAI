// pages/expert/documents/[id]/json.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import JsonViewer from '@/components/editor/JsonViewer';
import ExpertChat from '@/components/expert/ExpertChat';
import EntityValidationPanel from '@/components/expert/EntityValidationPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileCode,
  Copy,
  Download,
  ArrowLeft,
  Check,
  RefreshCw,
  FileText,
  Tags,
  BookOpen,
  MessageSquare
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
  const [initializingEnrichedJson, setInitializingEnrichedJson] = useState(false);
  const [enrichedJsonStatus, setEnrichedJsonStatus] = useState<Record<string, unknown> | null>(null);
  const [jsonModified, setJsonModified] = useState(false);
  const [savingJson, setSavingJson] = useState(false);

  useEffect(() => {
    if (id) {
      fetchDocumentJson();
      checkEnrichedJsonStatus();
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

  const handleJsonChange = (newJsonString: string) => {
    try {
      const parsed = JSON.parse(newJsonString);
      setJsonData(parsed);
      setJsonString(newJsonString);
      setJsonModified(true);
    } catch (error) {
      // Si le JSON n'est pas valide, on met à jour quand même la string pour permettre l'édition
      setJsonString(newJsonString);
      setJsonModified(true);
    }
  };

  const handleSaveJson = async () => {
    if (!jsonModified) {
      alert('Aucune modification à sauvegarder');
      return;
    }

    setSavingJson(true);
    try {
      const response = await fetch(`http://localhost:8000/api/expert/documents/${id}/json/update/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          global_annotations_json: jsonData
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde du JSON');
      }

      const data = await response.json();
      alert('✅ JSON sauvegardé avec succès !');
      setJsonModified(false);

      // Recharger pour voir les changements
      await fetchDocumentJson();
    } catch (error: any) {
      console.error('Erreur:', error);
      alert('❌ Erreur lors de la sauvegarde: ' + error.message);
    } finally {
      setSavingJson(false);
    }
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

  const checkEnrichedJsonStatus = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/json-sync-status/`,
        {
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        setEnrichedJsonStatus(data);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification du statut:', error);
    }
  };

  const handleInitializeEnrichedJson = async () => {
    if (!confirm('Initialiser le JSON enrichi pour l\'assistant Q&A ? Cette opération va créer un JSON structuré avec toutes les entités et relations.')) {
      return;
    }

    try {
      setInitializingEnrichedJson(true);
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/initialize-enriched-json/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`✅ JSON enrichi initialisé avec succès !\n\n` +
              `- Total entités : ${data.stats.total_entities}\n` +
              `- Total relations : ${data.stats.total_relations}\n` +
              `- Types d'entités : ${data.stats.entity_types.join(', ')}\n\n` +
              `L'assistant Q&A peut maintenant répondre à vos questions !`);
        await checkEnrichedJsonStatus();
        await fetchDocumentJson();
      } else {
        alert(`❌ Erreur : ${data.error || 'Impossible d\'initialiser le JSON enrichi'}`);
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert(`❌ Erreur lors de l'initialisation : ${error}`);
    } finally {
      setInitializingEnrichedJson(false);
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

        {/* Alerte : JSON enrichi requis pour l'assistant Q&A */}
        {enrichedJsonStatus && !enrichedJsonStatus.is_synced && enrichedJsonStatus.total_entities === 0 && (
          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertDescription className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-yellow-800 mb-2">
                  ⚠️ JSON enrichi non initialisé
                </p>
                <p className="text-sm text-yellow-700">
                  L&apos;assistant Q&A a besoin d&apos;un JSON enrichi pour fonctionner.
                  Cliquez sur le bouton ci-dessous pour initialiser automatiquement le JSON enrichi
                  à partir de vos {stats.totalAnnotations} annotation(s).
                </p>
              </div>
              <Button
                onClick={handleInitializeEnrichedJson}
                disabled={initializingEnrichedJson}
                className="ml-4 bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {initializingEnrichedJson ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Initialisation...
                  </>
                ) : (
                  <>
                    <FileCode className="w-4 h-4 mr-2" />
                    Initialiser le JSON enrichi
                  </>
                )}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Statut de synchronisation */}
        {enrichedJsonStatus && enrichedJsonStatus.total_entities > 0 && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-blue-800">
                    JSON enrichi initialisé
                  </span>
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">
                    {enrichedJsonStatus.total_entities} entités
                  </Badge>
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">
                    {enrichedJsonStatus.db_relations_count} relations
                  </Badge>
                  {!enrichedJsonStatus.is_synced && (
                    <Badge variant="destructive" className="ml-2">
                      ⚠️ Nécessite resynchronisation
                    </Badge>
                  )}
                </div>
                {!enrichedJsonStatus.is_synced && (
                  <Button
                    onClick={handleInitializeEnrichedJson}
                    disabled={initializingEnrichedJson}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Resynchroniser
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* JSON Editor et Chat Expert */}
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
            <Tabs defaultValue="validation" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="validation" className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Validation
                </TabsTrigger>
                <TabsTrigger value="json" className="flex items-center gap-2">
                  <FileCode className="w-4 h-4" />
                  Vue JSON
                </TabsTrigger>
                <TabsTrigger value="chat" className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Chat Expert (Sans IA)
                </TabsTrigger>
              </TabsList>

              <TabsContent value="validation">
                <Alert className="mb-4">
                  <AlertDescription>
                    Validez et gérez les entités, relations et Q&A du document.
                    Toutes les modifications sont automatiquement synchronisées dans le JSON.
                  </AlertDescription>
                </Alert>
                <EntityValidationPanel
                  documentId={parseInt(id as string)}
                  jsonData={jsonData}
                  onRefresh={fetchDocumentJson}
                />
              </TabsContent>

              <TabsContent value="json">
                {jsonData && Object.keys(jsonData).length > 0 ? (
                  <>
                    <Alert className="mb-4">
                      <AlertDescription>
                        Ce JSON contient toutes les annotations validées par l&apos;expert pour l&apos;ensemble du document, organisées par entités.
                      </AlertDescription>
                    </Alert>

                    <JsonViewer
                      value={jsonString}
                      title="JSON Global du Document (Expert) - ÉDITABLE"
                      height="600px"
                      readOnly={false}
                      onCopy={handleCopyJson}
                      onDownload={handleDownloadJson}
                      onChange={handleJsonChange}
                      showActions={true}
                    />

                    {jsonModified && (
                      <Alert className="mt-4 bg-yellow-50 border-yellow-300">
                        <AlertDescription className="flex items-center justify-between">
                          <span className="text-yellow-800 font-medium">
                            ⚠️ Le JSON a été modifié. Cliquez sur &quot;Sauvegarder&quot; pour enregistrer les changements.
                          </span>
                          <Button
                            onClick={handleSaveJson}
                            disabled={savingJson}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {savingJson ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Sauvegarde...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Sauvegarder le JSON
                              </>
                            )}
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

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
              </TabsContent>

              <TabsContent value="chat">
                <Alert className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300">
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-semibold text-blue-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Chat Expert (Sans IA) - Mode d&apos;emploi
                      </p>
                      <div className="text-sm text-blue-800 space-y-1">
                        <p>
                          💬 <strong>Discussion collaborative</strong> : Communiquez avec d&apos;autres experts sur ce document
                        </p>
                        <p>
                          🔍 <strong>Assistant de Recherche intégré</strong> : Cliquez sur &quot;Ouvrir l&apos;Assistant de Recherche&quot; pour poser des questions.
                          L&apos;assistant cherche dans les entités et relations validées du JSON (sans IA, sans invention).
                        </p>
                        <p className="text-xs mt-2 p-2 bg-white rounded border border-blue-200">
                          <strong>Exemples de questions :</strong> &quot;donnes les dosages&quot;, &quot;liste les ingrédients&quot;, &quot;quel est le dosage du produit X&quot;
                        </p>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
                <div className="h-[700px]">
                  <ExpertChat
                    documentId={parseInt(id as string)}
                    documentTitle={document?.title || 'Document'}
                    jsonData={jsonData}
                  />
                </div>
              </TabsContent>
            </Tabs>
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
                <span>Continuer l&apos;annotation</span>
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
