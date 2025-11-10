// pages/expert/documents/[id]/json-enriched.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import JsonViewer from '@/components/editor/JsonViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Brain,
  Network,
  MessageCircleQuestion,
  FileJson,
  GraduationCap,
  ArrowLeft,
  Save,
  RefreshCw,
  Download,
  Copy,
  Check,
  Sparkles,
  Plus,
  BarChart3
} from 'lucide-react';

export default function DocumentJsonEnriched() {
  const router = useRouter();
  const { id } = router.query;

  const [document, setDocument] = useState<any>(null);
  const [basicJson, setBasicJson] = useState<any>(null);
  const [enrichedJson, setEnrichedJson] = useState<any>(null);
  const [basicJsonString, setBasicJsonString] = useState<string>('');
  const [enrichedJsonString, setEnrichedJsonString] = useState<string>('');
  const [stats, setStats] = useState({
    relationsCount: 0,
    qaPairsCount: 0,
    contextsCount: 0,
    totalAnnotations: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEnrichedJson();
    }
  }, [id]);

  useEffect(() => {
    if (basicJson) {
      setBasicJsonString(JSON.stringify(basicJson, null, 2));
    }
  }, [basicJson]);

  useEffect(() => {
    if (enrichedJson) {
      setEnrichedJsonString(JSON.stringify(enrichedJson, null, 2));
    }
  }, [enrichedJson]);

  const fetchEnrichedJson = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/json-enriched/`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Erreur lors du chargement');

      const data = await response.json();
      setDocument(data.document);
      setBasicJson(data.basic_json || {});
      setEnrichedJson(data.enriched_json || {});
      setStats({
        relationsCount: data.enriched_json?.relations?.length || 0,
        qaPairsCount: data.enriched_json?.questions_answers?.length || 0,
        contextsCount: data.enriched_json?.contexts?.length || 0,
        totalAnnotations: data.total_annotations || 0
      });
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnrich = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/enrich-json/`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (response.ok) {
        await fetchEnrichedJson();
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleSaveChanges = async () => {
    if (!enrichedMonacoRef.current) return;

    try {
      const content = enrichedMonacoRef.current.getValue();
      const jsonData = JSON.parse(content);

      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/save-enriched-json/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enriched_json: jsonData })
        }
      );

      if (response.ok) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleCopyJson = () => {
    if (enrichedMonacoRef.current) {
      const content = enrichedMonacoRef.current.getValue();
      navigator.clipboard.writeText(content).then(() => {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      });
    }
  };

  const handleDownloadJson = () => {
    if (enrichedMonacoRef.current) {
      const content = enrichedMonacoRef.current.getValue();
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${document?.title || 'document'}_enriched.json`;
      a.click();
      URL.revokeObjectURL(url);
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

  const hasEnriched = enrichedJson && Object.keys(enrichedJson).length > 0;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-purple-500 via-blue-500 to-green-500 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Brain className="w-6 h-6" />
                  JSON Sémantique Expert
                </CardTitle>
                <p className="text-white/90 mt-2">
                  {document?.title?.substring(0, 50)}
                  {document?.title?.length > 50 ? '...' : ''}
                </p>
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="overview" className="flex items-center gap-2 py-3">
              <BarChart3 className="w-4 h-4" />
              Vue d'ensemble
            </TabsTrigger>
            <TabsTrigger value="relations" className="flex items-center gap-2 py-3">
              <Network className="w-4 h-4" />
              Relations ({stats.relationsCount})
            </TabsTrigger>
            <TabsTrigger value="qa" className="flex items-center gap-2 py-3">
              <MessageCircleQuestion className="w-4 h-4" />
              Q&A ({stats.qaPairsCount})
            </TabsTrigger>
            <TabsTrigger value="json" className="flex items-center gap-2 py-3">
              <GraduationCap className="w-4 h-4" />
              JSON & Apprentissage
            </TabsTrigger>
          </TabsList>

          {/* Actions */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {!hasEnriched ? (
              <Button onClick={handleEnrich} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Enrichir Automatiquement
              </Button>
            ) : (
              <Button variant="outline" onClick={handleEnrich} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Régénérer
              </Button>
            )}
            <Button variant="outline" className="gap-2">
              <Network className="w-4 h-4" />
              Créateur Visuel de Relations
            </Button>
            <Button variant="outline" className="gap-2">
              <Plus className="w-4 h-4" />
              Ajouter Q&A
            </Button>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-6">
            {hasEnriched ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-100 rounded-full">
                          <Network className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{stats.relationsCount}</div>
                          <p className="text-sm text-muted-foreground">
                            Relations identifiées
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-100 rounded-full">
                          <MessageCircleQuestion className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{stats.qaPairsCount}</div>
                          <p className="text-sm text-muted-foreground">
                            Questions-Réponses
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-100 rounded-full">
                          <FileJson className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{stats.contextsCount}</div>
                          <p className="text-sm text-muted-foreground">
                            Contextes sémantiques
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-orange-100 rounded-full">
                          <Check className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                          <div className="text-2xl font-bold">{stats.totalAnnotations}</div>
                          <p className="text-sm text-muted-foreground">
                            Annotations totales
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {enrichedJson?.semantic_summary && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="w-5 h-5" />
                        Résumé Sémantique Intelligent
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg leading-relaxed">
                        {enrichedJson.semantic_summary}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-20 text-center">
                  <Brain className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">JSON Non Enrichi</h3>
                  <p className="text-muted-foreground mb-6">
                    Ce document possède un JSON basique mais pas encore d'enrichissement sémantique.
                  </p>
                  <Button onClick={handleEnrich} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    Enrichir Automatiquement
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Relations Tab */}
          <TabsContent value="relations" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="w-5 h-5" />
                  Relations Entre Entités
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrichedJson?.relations && enrichedJson.relations.length > 0 ? (
                  <div className="space-y-3">
                    {enrichedJson.relations.map((relation: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg hover:shadow-md transition-shadow"
                      >
                        <Badge className="bg-blue-500 text-white px-3 py-1">
                          {relation.source?.value || 'N/A'}
                        </Badge>
                        <Badge variant="outline" className="bg-green-500 text-white border-green-600">
                          {relation.type || 'relation'}
                        </Badge>
                        <span className="text-green-600 font-bold text-xl">→</span>
                        <Badge className="bg-blue-500 text-white px-3 py-1">
                          {relation.target?.value || 'N/A'}
                        </Badge>
                        {relation.description && (
                          <span className="text-sm text-muted-foreground ml-auto">
                            {relation.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Network className="w-12 h-12 mx-auto mb-3" />
                    <p>Aucune relation identifiée. Utilisez le créateur visuel de relations.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Q&A Tab */}
          <TabsContent value="qa" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircleQuestion className="w-5 h-5" />
                  Questions-Réponses Automatiques
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrichedJson?.questions_answers && enrichedJson.questions_answers.length > 0 ? (
                  <div className="space-y-4">
                    {enrichedJson.questions_answers.map((qa: any, index: number) => (
                      <div
                        key={index}
                        className="p-4 bg-gradient-to-r from-cyan-50 to-purple-50 border border-cyan-200 rounded-lg"
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <span className="font-semibold text-cyan-700">Q:</span>
                          <p className="font-medium text-gray-900">{qa.question}</p>
                        </div>
                        <div className="flex items-start gap-2 ml-4">
                          <span className="font-semibold text-green-700">R:</span>
                          <p className="text-gray-700 leading-relaxed">{qa.answer}</p>
                        </div>
                        {qa.created_by === 'expert' && (
                          <Badge className="mt-2 bg-green-600">
                            <Check className="w-3 h-3 mr-1" />
                            Expert
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageCircleQuestion className="w-12 h-12 mx-auto mb-3" />
                    <p>Aucune Q&A générée. Utilisez "Ajouter Q&A".</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* JSON & Learning Tab */}
          <TabsContent value="json" className="space-y-4 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileJson className="w-5 h-5" />
                    JSON Basique
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <JsonViewer
                    value={basicJson}
                    title="JSON Basique"
                    height="500px"
                    readOnly={true}
                    showActions={false}
                  />
                </CardContent>
              </Card>

              {hasEnriched ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="w-5 h-5" />
                      JSON Enrichi
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <JsonViewer
                      value={enrichedJson}
                      title="JSON Enrichi"
                      height="500px"
                      readOnly={false}
                      showActions={false}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="h-[500px] flex items-center justify-center bg-gray-50">
                    <div className="text-center text-muted-foreground">
                      <p>JSON enrichi disponible après enrichissement</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="flex justify-center gap-3">
              <Button onClick={handleSaveChanges} className={copySuccess ? 'bg-green-600' : ''}>
                {copySuccess ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Sauvegardé !
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Sauvegarder les Modifications
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={handleCopyJson}>
                <Copy className="w-4 h-4 mr-2" />
                Copier
              </Button>
              <Button variant="outline" onClick={handleDownloadJson}>
                <Download className="w-4 h-4 mr-2" />
                Télécharger
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
