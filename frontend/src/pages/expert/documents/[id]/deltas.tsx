// pages/expert/documents/[id]/deltas.tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Brain,
  UserCheck,
  ArrowLeft,
  Star,
  BarChart3,
  RefreshCw,
  History,
  TrendingUp,
  Recycle,
  Info
} from 'lucide-react';

interface Delta {
  id: number;
  delta_type: string;
  ai_version: any;
  expert_version: any;
  confidence_before: number;
  reused_count: number;
  correction_summary: string;
  expert_rating?: number;
}

interface Session {
  session_id: string;
  expert: string;
  created_at: string;
  deltas: Delta[];
}

export default function ExpertDeltas() {
  const router = useRouter();
  const { id } = router.query;

  const [document, setDocument] = useState<any>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState({
    totalCorrections: 0,
    expertsCount: 0,
    relationsAdded: 0,
    qaAdded: 0
  });
  const [loading, setLoading] = useState(true);
  const [ratingDeltaId, setRatingDeltaId] = useState<number | null>(null);
  const [selectedRating, setSelectedRating] = useState(0);

  useEffect(() => {
    if (id) {
      fetchDeltas();
    }
  }, [id]);

  const fetchDeltas = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/deltas/`,
        { credentials: 'include' }
      );

      if (!response.ok) throw new Error('Erreur lors du chargement');

      const data = await response.json();
      setDocument(data.document);
      setSessions(data.sessions || []);
      setStats({
        totalCorrections: data.total_corrections || 0,
        expertsCount: data.experts_count || 0,
        relationsAdded: data.delta_types?.relation_added || 0,
        qaAdded: data.delta_types?.qa_added || 0
      });
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateWithLearning = async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${id}/regenerate-with-learning/`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.message || 'Régénération réussie !');
        router.push(`/expert/documents/${id}/json-enriched`);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const handleRateDelta = async (rating: number) => {
    if (!ratingDeltaId) return;

    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/deltas/${ratingDeltaId}/rate/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating })
        }
      );

      if (response.ok) {
        setRatingDeltaId(null);
        setSelectedRating(0);
        await fetchDeltas();
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const getDeltaTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      relation_added: 'Relation ajoutée',
      relation_modified: 'Relation modifiée',
      relation_removed: 'Relation supprimée',
      qa_added: 'Q&A ajoutée',
      qa_corrected: 'Q&A corrigée',
      entity_added: 'Entité ajoutée',
      entity_modified: 'Entité modifiée'
    };
    return labels[type] || type;
  };

  const getDeltaBadgeColor = (type: string) => {
    if (type.includes('added')) return 'bg-green-100 text-green-700 border-green-200';
    if (type.includes('modified') || type.includes('corrected')) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    if (type.includes('removed')) return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
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
        <Card className="bg-gradient-to-r from-purple-500 to-blue-500 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Brain className="w-6 h-6" />
                  Comparaisons IA vs Expert
                </CardTitle>
                <p className="text-white/90 mt-2">{document?.title}</p>
              </div>
              <Button
                variant="outline"
                className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                onClick={() => router.push(`/expert/documents/${id}/json-enriched`)}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour au document
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.totalCorrections}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Corrections totales
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.expertsCount}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Experts impliqués
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.relationsAdded}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Relations ajoutées
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {stats.qaAdded}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Q&A ajoutées
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Learning Actions */}
        <Card className="bg-gradient-to-r from-blue-50 to-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Actions d'apprentissage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Utilisez les corrections d'experts pour améliorer les futures générations IA
            </p>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={handleRegenerateWithLearning} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Régénérer avec apprentissage
              </Button>
              <Button variant="outline" className="gap-2">
                <Recycle className="w-4 h-4" />
                Appliquer les patterns appris
              </Button>
              <Button variant="outline" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Comparer avec IA fraîche
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Sessions */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <History className="w-5 h-5" />
            Historique des corrections par session
          </h3>

          {sessions.length > 0 ? (
            sessions.map((session) => (
              <div key={session.session_id} className="border-l-4 border-green-500 pl-4 space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">Session {session.session_id}</span>
                      <span className="text-muted-foreground ml-2">par {session.expert}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(session.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>

                {session.deltas.map((delta) => (
                  <Card key={delta.id} className="relative">
                    {delta.reused_count > 0 && (
                      <div className="absolute -top-2 -right-2 bg-green-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xs">
                        <Recycle className="w-4 h-4" />
                      </div>
                    )}

                    <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge className={getDeltaBadgeColor(delta.delta_type)}>
                            {getDeltaTypeLabel(delta.delta_type)}
                          </Badge>
                          {delta.reused_count > 0 && (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                              Réutilisé {delta.reused_count}x
                            </Badge>
                          )}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          Confiance IA avant: {delta.confidence_before.toFixed(1)}
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* AI Version */}
                        <div className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3 text-blue-700 font-semibold">
                            <Brain className="w-4 h-4" />
                            Version IA
                          </div>
                          <div className="space-y-2">
                            {renderDeltaContent(delta, 'ai')}
                          </div>
                        </div>

                        {/* Expert Version */}
                        <div className="border-2 border-green-200 bg-green-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3 text-green-700 font-semibold">
                            <UserCheck className="w-4 h-4" />
                            Correction Expert
                          </div>
                          <div className="space-y-2">
                            {renderDeltaContent(delta, 'expert')}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          <strong>Impact:</strong> {delta.correction_summary}
                        </div>
                        <div>
                          {!delta.expert_rating ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRatingDeltaId(delta.id)}
                              className="gap-2"
                            >
                              <Star className="w-4 h-4" />
                              Noter qualité
                            </Button>
                          ) : (
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-4 h-4 ${
                                    star <= delta.expert_rating!
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <Info className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h4 className="text-xl font-semibold mb-2">Aucune correction enregistrée</h4>
                <p className="text-muted-foreground">
                  Les futures corrections d'expert apparaîtront ici pour apprentissage
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Rating Modal */}
        {ratingDeltaId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="max-w-md w-full m-4">
              <CardHeader>
                <CardTitle>Noter la qualité de la correction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center mb-6">
                  <div className="flex justify-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-10 h-10 cursor-pointer transition-all ${
                          star <= selectedRating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300 hover:text-yellow-300'
                        }`}
                        onClick={() => setSelectedRating(star)}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    1 = Peu utile, 5 = Très utile
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setRatingDeltaId(null);
                      setSelectedRating(0);
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => handleRateDelta(selectedRating)}
                    disabled={selectedRating === 0}
                  >
                    Confirmer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );

  function renderDeltaContent(delta: Delta, version: 'ai' | 'expert') {
    const data = version === 'ai' ? delta.ai_version : delta.expert_version;
    const type = delta.delta_type;

    if (!data && version === 'ai' && (type === 'relation_added' || type === 'qa_added')) {
      return <div className="text-muted-foreground italic">Aucune donnée détectée</div>;
    }

    if (type.includes('relation')) {
      return (
        <>
          <div className="bg-white rounded p-2 font-mono text-sm">
            <span className="bg-blue-200 px-2 py-1 rounded">{data?.source?.value || 'N/A'}</span>
            <span className="mx-2 text-green-600 font-bold">--{data?.type || 'relation'}--&gt;</span>
            <span className="bg-blue-200 px-2 py-1 rounded">{data?.target?.value || 'N/A'}</span>
          </div>
          {data?.description && (
            <p className="text-sm text-muted-foreground italic mt-2">{data.description}</p>
          )}
        </>
      );
    }

    if (type.includes('qa')) {
      return (
        <div className="bg-white rounded p-3 space-y-2">
          <div>
            <span className="font-semibold text-cyan-700">Q:</span>{' '}
            <span>{data?.question}</span>
          </div>
          <div>
            <span className="font-semibold text-green-700">R:</span>{' '}
            <span className="text-sm">{data?.answer}</span>
          </div>
        </div>
      );
    }

    return <div className="text-sm">{JSON.stringify(data, null, 2)}</div>;
  }
}
