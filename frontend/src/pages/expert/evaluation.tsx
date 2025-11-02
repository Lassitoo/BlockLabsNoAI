import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowLeft,
  Target,
  Search,
  Scale,
  CheckCircle,
  FileDown,
  Brain,
  Clock
} from 'lucide-react';
import axios from '@/lib/axios';

interface Metrics {
  precision: number;
  recall: number;
  f1_score: number;
  accuracy: number;
}

interface ConfusionMatrix {
  true_positive: number;
  false_positive: number;
  false_negative: number;
  true_negative: number;
}

interface DetailedStat {
  type: string;
  ai_count: number;
  expert_count: number;
  corrections: number;
  validation_rate: number;
  avg_confidence: number;
}

interface SemanticMetrics {
  ai_relations: number;
  expert_relations: number;
  relation_validation_rate: number;
  ai_qa: number;
  expert_qa: number;
  qa_correction_rate: number;
}

interface TimeMetrics {
  documents_processed: number;
  avg_ai_time: number;
  avg_expert_time: number;
  time_saved_percentage: number;
}

interface EvaluationData {
  metrics: Metrics;
  confusion_matrix: ConfusionMatrix;
  detailed_stats: DetailedStat[];
  semantic_metrics: SemanticMetrics;
  time_metrics: TimeMetrics;
}

export default function ModelEvaluation() {
  const router = useRouter();
  const [data, setData] = useState<EvaluationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvaluationData();
  }, []);

  const fetchEvaluationData = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/expert/evaluation/');
      setData(response.data);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      // Données de démonstration
      setData({
        metrics: {
          precision: 92.5,
          recall: 88.3,
          f1_score: 90.3,
          accuracy: 94.7
        },
        confusion_matrix: {
          true_positive: 342,
          false_positive: 28,
          false_negative: 45,
          true_negative: 891
        },
        detailed_stats: [
          {
            type: 'Référence Réglementaire',
            ai_count: 245,
            expert_count: 238,
            corrections: 7,
            validation_rate: 97.1,
            avg_confidence: 0.94
          },
          {
            type: 'Entité Médicale',
            ai_count: 189,
            expert_count: 195,
            corrections: 6,
            validation_rate: 96.8,
            avg_confidence: 0.91
          }
        ],
        semantic_metrics: {
          ai_relations: 456,
          expert_relations: 428,
          relation_validation_rate: 93.9,
          ai_qa: 234,
          expert_qa: 218,
          qa_correction_rate: 6.8
        },
        time_metrics: {
          documents_processed: 45,
          avg_ai_time: 12.5,
          avg_expert_time: 180.3,
          time_saved_percentage: 93.1
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    window.print();
  };

  const exportToCSV = () => {
    if (!data) return;
    let csv = 'Type,Métrique,Valeur\n';
    csv += `Précision,Precision,${data.metrics.precision}\n`;
    csv += `Rappel,Recall,${data.metrics.recall}\n`;
    csv += `F1-Score,F1-Score,${data.metrics.f1_score}\n`;
    csv += `Exactitude,Accuracy,${data.metrics.accuracy}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation_modele_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportToJSON = () => {
    if (!data) return;
    const exportData = {
      date: new Date().toISOString(),
      ...data
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation_modele_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement de l&apos;évaluation...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Erreur lors du chargement des données</p>
        </div>
      </DashboardLayout>
    );
  }

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    description,
    color
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: number;
    description: string;
    color: string;
  }) => (
    <Card className={`border-l-4 ${color}`}>
      <CardContent className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${color.replace('border-l-', 'from-')} to-opacity-50`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">
            {label}
          </div>
        </div>
        <div className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
          {value.toFixed(1)}%
        </div>
        <div className="text-sm text-gray-600 mb-3">{description}</div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${color.replace('border-l-', 'from-')} to-opacity-70`}
            style={{ width: `${value}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* En-tête */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                  <Brain className="w-8 h-8" />
                  Évaluation du Modèle IA
                </h1>
                <p className="text-blue-100 text-lg">
                  Analyse comparative des performances IA vs Expert - Métriques académiques
                </p>
              </div>
              <button
                onClick={() => router.push('/expert')}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all backdrop-blur-sm"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Boutons d'export */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={exportToPDF}
            className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all flex items-center gap-2 shadow-md"
          >
            <FileDown className="w-4 h-4" />
            Exporter PDF
          </button>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all flex items-center gap-2 shadow-md"
          >
            <FileDown className="w-4 h-4" />
            Exporter CSV
          </button>
          <button
            onClick={exportToJSON}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg hover:from-cyan-600 hover:to-cyan-700 transition-all flex items-center gap-2 shadow-md"
          >
            <FileDown className="w-4 h-4" />
            Exporter JSON
          </button>
        </div>

        {/* Métriques principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            icon={Target}
            label="Précision"
            value={data.metrics.precision}
            description="TP / (TP + FP) - Proportion de prédictions positives correctes"
            color="border-l-blue-500 from-blue-500"
          />
          <MetricCard
            icon={Search}
            label="Rappel (Recall)"
            value={data.metrics.recall}
            description="TP / (TP + FN) - Capacité à identifier tous les cas positifs"
            color="border-l-green-500 from-green-500"
          />
          <MetricCard
            icon={Scale}
            label="F1-Score"
            value={data.metrics.f1_score}
            description="2 × (Précision × Rappel) / (Précision + Rappel) - Moyenne harmonique"
            color="border-l-orange-500 from-orange-500"
          />
          <MetricCard
            icon={CheckCircle}
            label="Exactitude"
            value={data.metrics.accuracy}
            description="(TP + TN) / Total - Pourcentage de prédictions correctes"
            color="border-l-cyan-500 from-cyan-500"
          />
        </div>

        {/* Matrice de Confusion */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="w-5 h-5" />
              Matrice de Confusion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div></div>
              <div className="text-center font-semibold bg-gray-100 p-3 rounded-lg">
                Prédit Positif
              </div>
              <div className="text-center font-semibold bg-gray-100 p-3 rounded-lg">
                Prédit Négatif
              </div>

              <div className="flex items-center justify-center font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-3 rounded-lg">
                Réel Positif
              </div>
              <div className="bg-gradient-to-br from-green-100 to-green-200 border-2 border-green-500 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-green-700 mb-2">
                  {data.confusion_matrix.true_positive}
                </div>
                <div className="text-sm text-green-600 font-medium">Vrais Positifs (TP)</div>
              </div>
              <div className="bg-gradient-to-br from-red-100 to-red-200 border-2 border-red-500 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-red-700 mb-2">
                  {data.confusion_matrix.false_negative}
                </div>
                <div className="text-sm text-red-600 font-medium">Faux Négatifs (FN)</div>
              </div>

              <div className="flex items-center justify-center font-semibold bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-3 rounded-lg">
                Réel Négatif
              </div>
              <div className="bg-gradient-to-br from-orange-100 to-orange-200 border-2 border-orange-500 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-orange-700 mb-2">
                  {data.confusion_matrix.false_positive}
                </div>
                <div className="text-sm text-orange-600 font-medium">Faux Positifs (FP)</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-100 to-cyan-200 border-2 border-cyan-500 p-6 rounded-xl text-center">
                <div className="text-3xl font-bold text-cyan-700 mb-2">
                  {data.confusion_matrix.true_negative}
                </div>
                <div className="text-sm text-cyan-600 font-medium">Vrais Négatifs (TN)</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistiques détaillées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Statistiques Détaillées par Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Type d&apos;Annotation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Total IA
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Total Expert
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Corrections
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Taux de Validation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Confiance Moyenne
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data.detailed_stats.map((stat, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-900">{stat.type}</td>
                      <td className="px-6 py-4 text-gray-700">{stat.ai_count}</td>
                      <td className="px-6 py-4 text-gray-700">{stat.expert_count}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            stat.corrections > 0
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {stat.corrections}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            stat.validation_rate >= 80
                              ? 'bg-green-100 text-green-700'
                              : stat.validation_rate >= 50
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-cyan-100 text-cyan-700'
                          }`}
                        >
                          {stat.validation_rate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{stat.avg_confidence.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Métriques supplémentaires */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Métriques Sémantiques
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Relations extraites (IA)</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.semantic_metrics.ai_relations}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Relations validées (Expert)</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.semantic_metrics.expert_relations}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Taux de validation relations</td>
                    <td className="py-3 text-right">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                        {data.semantic_metrics.relation_validation_rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Q&A générées (IA)</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.semantic_metrics.ai_qa}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Q&A corrigées (Expert)</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.semantic_metrics.expert_qa}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Taux de correction Q&A</td>
                    <td className="py-3 text-right">
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold">
                        {data.semantic_metrics.qa_correction_rate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Temps de Traitement
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Documents traités</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.time_metrics.documents_processed}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Temps moyen IA/document</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.time_metrics.avg_ai_time.toFixed(2)}s
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Temps moyen Expert/document</td>
                    <td className="py-3 text-right text-gray-900 font-semibold">
                      {data.time_metrics.avg_expert_time.toFixed(2)}s
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-gray-700">Gain de temps</td>
                    <td className="py-3 text-right">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                        {data.time_metrics.time_saved_percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
