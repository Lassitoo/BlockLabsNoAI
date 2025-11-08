import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, BookOpen, CheckCircle, Clock, FileText, TrendingUp, Activity, Award } from 'lucide-react';
import { useRouter } from 'next/router';

export default function ExpertDashboard() {
  const router = useRouter();

  const stats = [
    {
      title: 'Documents à Réviser',
      value: '8',
      description: 'En attente de validation',
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Annotations Validées',
      value: '342',
      description: 'Total validé',
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'En Cours',
      value: '5',
      description: 'Documents en révision',
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50'
    },
    {
      title: 'Taux de Précision',
      value: '94.7%',
      description: 'Qualité moyenne',
      icon: Award,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50'
    },
  ];

  const quickActions = [
    {
      title: 'Évaluation du Modèle',
      description: 'Voir les métriques IA',
      icon: BarChart3,
      color: 'from-blue-500 to-blue-600',
      route: '/expert/evaluation',
    },
    {
      title: 'Documents',
      description: 'Réviser les documents',
      icon: BookOpen,
      color: 'from-green-500 to-green-600',
      route: '/expert/documents',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Expert Dashboard
            </h1>
            <p className="text-muted-foreground mt-2 text-lg flex items-center gap-2">
              <Award className="w-5 h-5 text-blue-600" />
              Validez et améliorez les annotations IA
            </p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <Activity className="w-5 h-5 text-blue-600 animate-pulse" />
            <span className="text-sm font-medium text-blue-700">Expert Mode</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card key={stat.title} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{stat.description}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <CardTitle className="text-xl">Actions Rapides</CardTitle>
            <CardDescription className="mt-1">Accédez rapidement à vos outils</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quickActions.map((action) => (
                <button
                  key={action.title}
                  onClick={() => router.push(action.route)}
                  className="group p-6 rounded-xl border-2 hover:border-blue-200 hover:bg-blue-50/50 transition-all duration-200 text-left"
                >
                  <div className={`inline-flex p-3 rounded-lg bg-gradient-to-r ${action.color} mb-4`}>
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">
                    {action.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {action.description}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Activité Récente</CardTitle>
                <CardDescription className="mt-1">Vos dernières validations</CardDescription>
              </div>
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[
                { doc: 'Document Réglementaire #342', action: '15 annotations validées', time: '2 minutes ago', icon: CheckCircle, color: 'text-green-600' },
                { doc: 'Spécifications Produit #128', action: '8 corrections appliquées', time: '15 minutes ago', icon: FileText, color: 'text-blue-600' },
                { doc: 'Guide Procédure #89', action: 'Document validé', time: '1 heure ago', icon: Award, color: 'text-purple-600' },
                { doc: 'Rapport Analyse #234', action: 'En cours de révision', time: '2 heures ago', icon: Clock, color: 'text-amber-600' },
              ].map((activity, index) => (
                <div key={index} className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className={`p-2 rounded-lg bg-gray-100`}>
                    <activity.icon className={`w-5 h-5 ${activity.color}`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{activity.doc}</p>
                    <p className="text-sm text-muted-foreground">{activity.action}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{activity.time}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
