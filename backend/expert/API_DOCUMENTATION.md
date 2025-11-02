# API Expert - Documentation

## 📋 Vue d'ensemble

Cette API fournit des endpoints RESTful pour l'interface expert Next.js. Elle permet de gérer le dashboard expert, la révision des annotations, et l'évaluation du modèle IA.

**Base URL**: `http://localhost:8000/api/expert/`

---

## 🔐 Authentification

Tous les endpoints nécessitent une authentification. L'utilisateur doit être connecté via Django session.

**Headers requis**:
```http
Cookie: sessionid=<votre_session_id>
X-CSRFToken: <votre_csrf_token>
```

---

## 📍 Endpoints Disponibles

### 1. Dashboard Expert

**GET** `/api/expert/dashboard/`

Retourne les statistiques du dashboard et la liste des documents récents.

#### Response

```json
{
  "success": true,
  "stats": {
    "ready_documents_count": 12,
    "pending_annotations": 45,
    "completed_reviews": 147,
    "validation_rate": 87.5,
    "to_review_count": 8,
    "in_progress_reviews": 4,
    "rejected_documents": 2
  },
  "recent_documents": [
    {
      "id": 1,
      "title": "Document Régulatoire 2024",
      "annotator": {
        "username": "jean.dupont"
      },
      "pages": {
        "count": 45
      },
      "total_annotations": 128,
      "validated_annotations": 120,
      "pending_annotations": 8,
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Utilisation Next.js

```typescript
import axios from 'axios';

const fetchDashboard = async () => {
  const response = await axios.get('/api/expert/dashboard/');
  setStats(response.data.stats);
  setDocuments(response.data.recent_documents);
};
```

---

### 2. Liste des Documents

**GET** `/api/expert/documents/?page=1&page_size=10`

Retourne la liste paginée des documents prêts pour révision.

#### Query Parameters

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `page` | integer | 1 | Numéro de page |
| `page_size` | integer | 10 | Nombre d'éléments par page |

#### Response

```json
{
  "success": true,
  "documents": [
    {
      "id": 1,
      "file": {
        "name": "document_regulatoire_2024.pdf"
      },
      "title": "Document Régulatoire 2024",
      "expert_ready_at": "2024-01-15T10:30:00Z",
      "total_pages": 45,
      "annotation_count": 128,
      "pending_annotations": 12,
      "annotator": {
        "username": "jean.dupont"
      }
    }
  ],
  "pagination": {
    "current": 1,
    "total": 5,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

#### Utilisation Next.js

```typescript
const fetchDocuments = async (page: number = 1) => {
  const response = await axios.get(`/api/expert/documents/?page=${page}`);
  setDocuments(response.data.documents);
  setPagination(response.data.pagination);
};
```

---

### 3. Révision d'un Document

**GET** `/api/expert/documents/{id}/review/`

Retourne les détails d'un document et ses annotations en attente de validation.

#### Path Parameters

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | integer | ID du document |

#### Response

```json
{
  "success": true,
  "id": 1,
  "title": "Document Régulatoire 2024",
  "created_at": "2024-01-15T10:30:00Z",
  "total_pending": 5,
  "validated_annotations": 120,
  "rejected_annotations": 3,
  "total_annotations": 128,
  "completion_percentage": 96,
  "pages_with_annotations": {
    "1": {
      "page_text_preview": "Page 1 - Introduction...",
      "annotations": [
        {
          "id": 1,
          "selected_text": "Article 4.2.1 - Protocole de test",
          "start_pos": 125,
          "end_pos": 155,
          "annotation_type": {
            "display_name": "Référence Réglementaire",
            "color": "#3b82f6"
          },
          "created_by": {
            "username": "jean.dupont"
          },
          "created_at": "2024-01-15T10:30:00Z"
        }
      ]
    }
  }
}
```

#### Utilisation Next.js

```typescript
const fetchDocumentReview = async (docId: number) => {
  const response = await axios.get(`/api/expert/documents/${docId}/review/`);
  setDocument(response.data);
};
```

---

### 4. Valider une Annotation

**POST** `/api/expert/annotations/{id}/validate/`

Valide ou rejette une annotation.

#### Path Parameters

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | integer | ID de l'annotation |

#### Request Body

```json
{
  "action": "validate"  // ou "reject"
}
```

#### Response

```json
{
  "success": true,
  "message": "Annotation validée avec succès",
  "annotation_id": 1,
  "validated": true
}
```

#### Utilisation Next.js

```typescript
const validateAnnotation = async (annotationId: number, action: 'validate' | 'reject') => {
  const response = await axios.post(
    `/api/expert/annotations/${annotationId}/validate/`,
    { action }
  );

  if (response.data.success) {
    showNotification('Annotation validée', 'success');
  }
};
```

---

### 5. Validation en Masse

**POST** `/api/expert/documents/{id}/bulk-validate/`

Valide toutes les annotations en attente pour un document.

#### Path Parameters

| Paramètre | Type | Description |
|-----------|------|-------------|
| `id` | integer | ID du document |

#### Response

```json
{
  "success": true,
  "message": "45 annotations validées avec succès",
  "count": 45
}
```

#### Utilisation Next.js

```typescript
const validateAll = async (docId: number) => {
  if (!confirm('Valider toutes les annotations ?')) return;

  const response = await axios.post(`/api/expert/documents/${docId}/bulk-validate/`);

  if (response.data.success) {
    showNotification(response.data.message, 'success');
    router.reload();
  }
};
```

---

### 6. Évaluation du Modèle

**GET** `/api/expert/evaluation/`

Retourne les métriques d'évaluation du modèle IA.

#### Response

```json
{
  "success": true,
  "metrics": {
    "precision": 92.5,
    "recall": 88.3,
    "f1_score": 90.3,
    "accuracy": 94.7
  },
  "confusion_matrix": {
    "true_positive": 342,
    "false_positive": 28,
    "false_negative": 45,
    "true_negative": 891
  },
  "detailed_stats": [
    {
      "type": "Référence Réglementaire",
      "ai_count": 245,
      "expert_count": 238,
      "corrections": 7,
      "validation_rate": 97.1,
      "avg_confidence": 0.94
    }
  ],
  "semantic_metrics": {
    "ai_relations": 456,
    "expert_relations": 428,
    "relation_validation_rate": 93.9,
    "ai_qa": 234,
    "expert_qa": 218,
    "qa_correction_rate": 6.8
  },
  "time_metrics": {
    "documents_processed": 45,
    "avg_ai_time": 12.5,
    "avg_expert_time": 180.3,
    "time_saved_percentage": 93.1
  },
  "timeline_data": {
    "labels": ["15/01", "20/01", "25/01", "30/01", "04/02", "09/02"],
    "datasets": [...]
  }
}
```

#### Utilisation Next.js

```typescript
const fetchEvaluation = async () => {
  const response = await axios.get('/api/expert/evaluation/');
  setMetrics(response.data.metrics);
  setConfusionMatrix(response.data.confusion_matrix);
};
```

---

## 🔧 Configuration Frontend Next.js

### 1. Variables d'environnement

Créez `.env.local` dans le dossier frontend :

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 2. Configuration Axios

Créez `frontend/src/lib/axios.ts` :

```typescript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,  // Important pour les cookies de session
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercepteur pour ajouter le CSRF token
apiClient.interceptors.request.use((config) => {
  const csrfToken = getCookie('csrftoken');
  if (csrfToken) {
    config.headers['X-CSRFToken'] = csrfToken;
  }
  return config;
});

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export default apiClient;
```

### 3. Utilisation dans les pages

```typescript
import apiClient from '@/lib/axios';

// Dans votre composant
const fetchData = async () => {
  try {
    const response = await apiClient.get('/api/expert/dashboard/');
    setData(response.data);
  } catch (error) {
    console.error('Erreur:', error);
  }
};
```

---

## 🚨 Gestion des Erreurs

Toutes les API retournent un format d'erreur standard :

```json
{
  "success": false,
  "error": "Message d'erreur détaillé"
}
```

### Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 400 | Requête invalide |
| 401 | Non authentifié |
| 404 | Ressource non trouvée |
| 500 | Erreur serveur |

### Exemple de gestion d'erreur

```typescript
try {
  const response = await apiClient.get('/api/expert/dashboard/');
  setData(response.data);
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) {
      router.push('/login');
    } else {
      showNotification(error.response?.data?.error || 'Erreur', 'error');
    }
  }
}
```

---

## 🧪 Tests

### Test manuel avec cURL

```bash
# 1. Dashboard
curl -X GET http://localhost:8000/api/expert/dashboard/ \
  -H "Cookie: sessionid=YOUR_SESSION_ID"

# 2. Liste des documents
curl -X GET "http://localhost:8000/api/expert/documents/?page=1" \
  -H "Cookie: sessionid=YOUR_SESSION_ID"

# 3. Valider une annotation
curl -X POST http://localhost:8000/api/expert/annotations/1/validate/ \
  -H "Cookie: sessionid=YOUR_SESSION_ID" \
  -H "X-CSRFToken: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "validate"}'
```

### Test avec Python

```python
import requests

# Session
session = requests.Session()

# Login d'abord
login_response = session.post(
    'http://localhost:8000/api/auth/login/',
    json={'username': 'expert', 'password': 'password'}
)

# Dashboard
dashboard = session.get('http://localhost:8000/api/expert/dashboard/')
print(dashboard.json())

# Valider annotation
validate = session.post(
    'http://localhost:8000/api/expert/annotations/1/validate/',
    json={'action': 'validate'}
)
print(validate.json())
```

---

## 📊 Métriques et Performance

### Optimisations implémentées

- ✅ `select_related()` pour réduire les requêtes SQL
- ✅ Pagination pour les grandes listes
- ✅ Limitation du logging en masse (max 100 entrées)
- ✅ Caching potentiel des statistiques

### Recommandations

1. **Caching**: Ajoutez Django Cache pour les statistiques du dashboard
2. **Celery**: Utilisez Celery pour les validations en masse
3. **Index**: Assurez-vous que les index DB sont créés sur `validated_by_expert`

---

## 🔒 Sécurité

### Mesures en place

- ✅ `@login_required` sur tous les endpoints
- ✅ CSRF protection via `@csrf_exempt` (à utiliser avec précaution)
- ✅ CORS configuré pour `localhost:3000`
- ✅ Validation des actions (`validate`/`reject`)

### À faire en production

- [ ] Remplacer `@csrf_exempt` par une vraie gestion CSRF
- [ ] Ajouter rate limiting
- [ ] Configurer HTTPS
- [ ] Restreindre CORS aux domaines autorisés
- [ ] Ajouter des logs d'audit

---

## 📝 Notes de Migration

Si vous migrez depuis les anciennes vues Django HTML :

1. **Dashboard**: Remplacez `expert:dashboard` par `/api/expert/dashboard/`
2. **Documents**: Remplacez `expert:document_list` par `/api/expert/documents/`
3. **Review**: Remplacez `expert:review_annotations` par `/api/expert/documents/{id}/review/`
4. **Validation**: Utilisez les endpoints POST au lieu des formulaires Django

---

## 🆘 Dépannage

### Problème: CORS Error

**Solution**: Vérifiez que `corsheaders` est dans `INSTALLED_APPS` et que `localhost:3000` est dans `CORS_ALLOWED_ORIGINS`

### Problème: 403 Forbidden

**Solution**: Assurez-vous que le CSRF token est envoyé dans les headers

### Problème: 401 Unauthorized

**Solution**: Vérifiez que l'utilisateur est connecté et que le cookie de session est envoyé

### Problème: Annotations ne s'affichent pas

**Solution**: Vérifiez que le document a le status `expert_ready`

---

**Version**: 1.0
**Dernière mise à jour**: 2024
**Contact**: Expert Team
