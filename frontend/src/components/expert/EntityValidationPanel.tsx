// components/expert/EntityValidationPanel.tsx
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Check,
  X,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Edit,
  Trash2
} from 'lucide-react';

interface Relation {
  id: number;
  type: string;
  validated: boolean;
  source: {
    type: string;
    value: string;
  };
  target: {
    type: string;
    value: string;
  };
  description?: string;
}

interface EntityValidationPanelProps {
  documentId: number;
  jsonData: Record<string, unknown> | null;
  onRefresh: () => void;
}

export default function EntityValidationPanel({
  documentId,
  jsonData,
  onRefresh
}: EntityValidationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalEntities: 0,
    validatedEntities: 0,
    totalRelations: 0,
    validatedRelations: 0
  });

  useEffect(() => {
    calculateStats();
  }, [jsonData]);

  const calculateStats = () => {
    if (!jsonData) return;

    const entities = (jsonData as Record<string, unknown>).entities || {};
    let totalEntities = 0;
    Object.values(entities as Record<string, unknown>).forEach((values: unknown) => {
      if (Array.isArray(values)) {
        totalEntities += values.length;
      }
    });

    const relations = ((jsonData as Record<string, unknown>).relations as Array<Record<string, unknown>>) || [];
    const validatedRelations = relations.filter((r) => r.validated as boolean).length;

    setStats({
      totalEntities,
      validatedEntities: totalEntities, // Toutes les entités dans le JSON sont validées
      totalRelations: relations.length,
      validatedRelations
    });
  };

  const handleValidateEntity = async (entityType: string, entityValue: string) => {
    setValidating(`${entityType}:${entityValue}`);
    try {
      // Appeler l'API pour valider l'entité
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${documentId}/validate-entity/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entity_type: entityType,
            entity_value: entityValue,
          }),
        }
      );

      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
    } finally {
      setValidating(null);
    }
  };

  const handleDeleteEntity = async (entityType: string, entityValue: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${entityValue}" de type "${entityType}" ?`)) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/documents/${documentId}/delete-entity/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            entity_type: entityType,
            entity_value: entityValue,
          }),
        }
      );

      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  const handleValidateRelation = async (relationId: number) => {
    setValidating(`relation:${relationId}`);
    try {
      const response = await fetch(
        `http://localhost:8000/api/expert/relationships/${relationId}/validate/`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Erreur lors de la validation:', error);
    } finally {
      setValidating(null);
    }
  };

  if (!jsonData) {
    return (
      <Alert>
        <AlertDescription>Aucune donnée JSON disponible</AlertDescription>
      </Alert>
    );
  }

  const entities = (jsonData.entities as Record<string, unknown>) || {};
  const relations = ((jsonData.relations as Array<Record<string, unknown>>) || []);

  return (
    <div className="space-y-4">
      {/* Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-green-600">
              {stats.validatedEntities}/{stats.totalEntities}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Entités Validées
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {stats.validatedRelations}/{stats.totalRelations}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Relations Validées
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-2xl font-bold text-orange-600">
              {Object.keys(entities).length}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Types d&apos;Entités
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de validation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Validation des Données</span>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="entities" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entities">
                Entités ({stats.totalEntities})
              </TabsTrigger>
              <TabsTrigger value="relations">
                Relations ({stats.totalRelations})
              </TabsTrigger>
            </TabsList>

            {/* Onglet Entités */}
            <TabsContent value="entities">
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {Object.keys(entities).length === 0 ? (
                    <Alert>
                      <AlertDescription>
                        Aucune entité trouvée dans le JSON.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    Object.entries(entities as Record<string, unknown>).map(([type, values]) => (
                      <Card key={type} className="border-l-4 border-l-blue-500">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">
                              {type}
                            </CardTitle>
                            <Badge variant="secondary">
                              {Array.isArray(values) ? values.length : 0} valeur(s)
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {Array.isArray(values) && values.map((value: string, index: number) => (
                              <div
                                key={index}
                                className="flex items-center justify-between p-3 bg-muted rounded-lg"
                              >
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  <span className="font-medium">{value}</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteEntity(type, value)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Onglet Relations */}
            <TabsContent value="relations">
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {relations.length === 0 ? (
                    <Alert>
                      <AlertDescription>
                        Aucune relation trouvée dans le JSON.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    relations.map((relation) => {
                      const rel = relation as unknown as Relation;
                      return (
                      <Card
                        key={rel.id}
                        className={`border-l-4 ${
                          rel.validated ? 'border-l-green-500' : 'border-l-yellow-500'
                        }`}
                      >
                        <CardContent className="pt-6">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant={rel.validated ? 'default' : 'secondary'}>
                                  {rel.validated ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Validée
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="w-3 h-3 mr-1" />
                                      Non validée
                                    </>
                                  )}
                                </Badge>
                                <Badge variant="outline">{rel.type}</Badge>
                              </div>
                              <div className="text-sm space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-blue-600">
                                    {rel.source.type}:
                                  </span>
                                  <span>{rel.source.value}</span>
                                </div>
                                <div className="flex items-center gap-2 pl-4">
                                  <span className="text-muted-foreground">→</span>
                                  <span className="font-semibold text-green-600">
                                    {rel.target.type}:
                                  </span>
                                  <span>{rel.target.value}</span>
                                </div>
                                {rel.description && (
                                  <p className="text-muted-foreground italic pl-4">
                                    {rel.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            {!rel.validated && (
                              <Button
                                size="sm"
                                onClick={() => handleValidateRelation(rel.id)}
                                disabled={validating === `relation:${rel.id}`}
                              >
                                {validating === `relation:${rel.id}` ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="w-4 h-4 mr-1" />
                                    Valider
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
