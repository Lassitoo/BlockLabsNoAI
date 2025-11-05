# API Endpoints pour la Migration JSON Sémantique

## Endpoints Requis pour les Pages Next.js

### 1. JSON Basique du Document

**Endpoint:** `GET /api/expert/documents/{id}/json/`

**Réponse attendue:**
```json
{
  "document": {
    "id": 1,
    "title": "Guide EMA 2024",
    "total_pages": 150,
    "pages": [
      {
        "id": 1,
        "page_number": 1,
        "annotation_count": 5
      }
    ]
  },
  "annotations_json": {
    "entities": {
      "product": ["Paracétamol", "Aspirine"],
      "dosage": ["500mg", "1g"]
    }
  },
  "summary": "Résumé global du document...",
  "total_annotations": 250,
  "annotated_pages": 120,
  "total_pages": 150,
  "progression": 80
}
```

**Vue Django:**
```python
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_document_json(request, id):
    document = Document.objects.get(id=id)
    return Response({
        'document': DocumentSerializer(document).data,
        'annotations_json': document.global_annotations_json or {},
        'summary': document.global_annotations_summary or '',
        'total_annotations': document.total_annotation_count,
        'annotated_pages': document.annotated_pages_count,
        'total_pages': document.pages.count(),
        'progression': calculate_progression(document)
    })
```

---

### 2. JSON Enrichi Sémantique

**Endpoint:** `GET /api/expert/documents/{id}/json-enriched/`

**Réponse attendue:**
```json
{
  "document": {
    "id": 1,
    "title": "Guide EMA 2024"
  },
  "basic_json": {
    "entities": {...}
  },
  "enriched_json": {
    "relations": [
      {
        "source": {"type": "product", "value": "Paracétamol"},
        "target": {"type": "dosage", "value": "500mg"},
        "type": "has_dosage",
        "description": "Le paracétamol est dosé à 500mg"
      }
    ],
    "questions_answers": [
      {
        "question": "Quel est le dosage?",
        "answer": "500mg",
        "created_by": "expert"
      }
    ],
    "contexts": [],
    "semantic_summary": "Document pharmaceutique concernant..."
  },
  "total_annotations": 250
}
```

**Endpoints associés:**

- `POST /api/expert/documents/{id}/enrich-json/` - Enrichir le JSON
- `POST /api/expert/documents/{id}/save-enriched-json/` - Sauvegarder les modifications
- `POST /api/expert/documents/{id}/regenerate-json/` - Régénérer le JSON

---

### 3. JSON d'une Page Spécifique

**Endpoint:** `GET /api/expert/documents/{id}/pages/{pageNumber}/json/`

**Réponse attendue:**
```json
{
  "document": {
    "id": 1,
    "title": "Guide EMA 2024"
  },
  "annotations_json": {
    "page_number": 5,
    "entities": {...},
    "annotations": [...]
  },
  "summary": "Résumé de la page 5...",
  "total_pages": 150
}
```

---

### 4. Comparaisons IA vs Expert (Deltas)

**Endpoint:** `GET /api/expert/documents/{id}/deltas/`

**Réponse attendue:**
```json
{
  "document": {
    "id": 1,
    "title": "Guide EMA 2024"
  },
  "sessions": [
    {
      "session_id": "session_123",
      "expert": "jean.dupont",
      "created_at": "2024-01-15T10:30:00Z",
      "deltas": [
        {
          "id": 1,
          "delta_type": "relation_added",
          "ai_version": null,
          "expert_version": {
            "source": {"type": "product", "value": "Paracétamol"},
            "target": {"type": "dosage", "value": "500mg"},
            "type": "has_dosage",
            "description": "Dosage du paracétamol"
          },
          "confidence_before": 0.0,
          "reused_count": 3,
          "correction_summary": "Relation ajoutée par l'expert",
          "expert_rating": 5
        }
      ]
    }
  ],
  "total_corrections": 45,
  "experts_count": 3,
  "delta_types": {
    "relation_added": 12,
    "relation_modified": 5,
    "qa_added": 8,
    "qa_corrected": 3
  }
}
```

**Endpoints associés:**

- `POST /api/expert/deltas/{id}/rate/` - Noter la qualité d'une correction
- `POST /api/expert/documents/{id}/regenerate-with-learning/` - Régénérer avec apprentissage

---

### 5. Documents Validés

**Endpoint:** `GET /api/expert/validated-documents/`

**Réponse attendue:**
```json
{
  "documents": [
    {
      "id": 1,
      "title": "Guide EMA 2024",
      "doc_type": "guide",
      "source": "EMA",
      "country": "EU",
      "total_pages": 150,
      "pages_analyzed": 120,
      "is_expert_validated": true,
      "summary": "Document sur les guidelines..."
    }
  ]
}
```

**Endpoint associé:**

- `POST /api/expert/documents/{id}/analyze-pages/` - Analyser les pages d'un document

**Réponse attendue pour l'analyse:**
```json
{
  "success": true,
  "total_relations": 45,
  "pages_analyzed": 150,
  "pages_data": [
    {
      "page_number": 1,
      "importance_score": 85,
      "summary": "Introduction...",
      "relations": [...],
      "entities": {...},
      "obligations": [],
      "newly_analyzed": true
    }
  ]
}
```

---

## Implémentation Backend Recommandée

### Fichier: `backend/expert/semantic_api_views.py`

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Document, ExpertDelta
from .serializers import DocumentSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_document_json(request, id):
    """Récupère le JSON basique d'un document"""
    document = get_object_or_404(Document, id=id)

    return Response({
        'document': DocumentSerializer(document).data,
        'annotations_json': document.global_annotations_json or {},
        'summary': document.global_annotations_summary or '',
        'total_annotations': document.annotations.count(),
        'annotated_pages': document.pages.filter(annotations__isnull=False).distinct().count(),
        'total_pages': document.pages.count(),
        'progression': calculate_progression(document)
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_document_json_enriched(request, id):
    """Récupère le JSON enrichi sémantique d'un document"""
    document = get_object_or_404(Document, id=id)

    return Response({
        'document': DocumentSerializer(document).data,
        'basic_json': document.global_annotations_json or {},
        'enriched_json': document.enriched_annotations_json or {},
        'total_annotations': document.annotations.count()
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def enrich_document_json(request, id):
    """Enrichit le JSON d'un document avec des relations sémantiques"""
    document = get_object_or_404(Document, id=id)

    # Logique d'enrichissement ici
    # enriched_json = enrich_with_ai(document.global_annotations_json)

    # document.enriched_annotations_json = enriched_json
    # document.save()

    return Response({'success': True})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_page_json(request, id, page_number):
    """Récupère le JSON d'une page spécifique"""
    document = get_object_or_404(Document, id=id)
    page = get_object_or_404(document.pages, page_number=page_number)

    return Response({
        'document': DocumentSerializer(document).data,
        'annotations_json': page.annotations_json or {},
        'summary': page.annotations_summary or '',
        'total_pages': document.pages.count()
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_expert_deltas(request, id):
    """Récupère les comparaisons IA vs Expert pour un document"""
    document = get_object_or_404(Document, id=id)

    deltas = ExpertDelta.objects.filter(document=document).select_related('expert')

    # Grouper par session
    sessions = {}
    for delta in deltas:
        session_id = delta.session_id or 'default'
        if session_id not in sessions:
            sessions[session_id] = {
                'session_id': session_id,
                'expert': delta.expert.username if delta.expert else 'N/A',
                'created_at': delta.created_at,
                'deltas': []
            }
        sessions[session_id]['deltas'].append({
            'id': delta.id,
            'delta_type': delta.delta_type,
            'ai_version': delta.ai_version,
            'expert_version': delta.expert_version,
            'confidence_before': delta.confidence_before or 0.0,
            'reused_count': delta.reused_count or 0,
            'correction_summary': delta.correction_summary or '',
            'expert_rating': delta.expert_rating
        })

    return Response({
        'document': DocumentSerializer(document).data,
        'sessions': list(sessions.values()),
        'total_corrections': deltas.count(),
        'experts_count': deltas.values('expert').distinct().count(),
        'delta_types': calculate_delta_types(deltas)
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_validated_documents(request):
    """Récupère la liste des documents validés"""
    documents = Document.objects.filter(
        status__in=['validated', 'expert_validated']
    ).select_related('annotator')

    return Response({
        'documents': [{
            'id': doc.id,
            'title': doc.title,
            'doc_type': doc.doc_type,
            'source': doc.source,
            'country': doc.country,
            'total_pages': doc.pages.count(),
            'pages_analyzed': doc.pages.filter(analyzed=True).count(),
            'is_expert_validated': doc.status == 'expert_validated',
            'summary': doc.summary
        } for doc in documents]
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def analyze_document_pages(request, id):
    """Analyse les pages d'un document pour extraire les relations"""
    document = get_object_or_404(Document, id=id)
    force_reanalyze = request.data.get('force_reanalyze', False)

    # Logique d'analyse ici
    # results = analyze_pages_with_ai(document, force_reanalyze)

    return Response({
        'success': True,
        'total_relations': 0,
        'pages_analyzed': document.pages.count(),
        'pages_data': []
    })

# Fonctions utilitaires
def calculate_progression(document):
    total_pages = document.pages.count()
    if total_pages == 0:
        return 0
    annotated = document.pages.filter(annotations__isnull=False).distinct().count()
    return int((annotated / total_pages) * 100)

def calculate_delta_types(deltas):
    types = {}
    for delta in deltas:
        delta_type = delta.delta_type
        types[delta_type] = types.get(delta_type, 0) + 1
    return types
```

### Fichier: `backend/expert/semantic_urls.py`

```python
from django.urls import path
from . import semantic_api_views

urlpatterns = [
    # JSON Basique
    path('documents/<int:id>/json/',
         semantic_api_views.get_document_json,
         name='document_json'),

    # JSON Enrichi
    path('documents/<int:id>/json-enriched/',
         semantic_api_views.get_document_json_enriched,
         name='document_json_enriched'),
    path('documents/<int:id>/enrich-json/',
         semantic_api_views.enrich_document_json,
         name='enrich_json'),

    # JSON de Page
    path('documents/<int:id>/pages/<int:page_number>/json/',
         semantic_api_views.get_page_json,
         name='page_json'),

    # Deltas IA vs Expert
    path('documents/<int:id>/deltas/',
         semantic_api_views.get_expert_deltas,
         name='expert_deltas'),

    # Documents Validés
    path('validated-documents/',
         semantic_api_views.get_validated_documents,
         name='validated_documents'),
    path('documents/<int:id>/analyze-pages/',
         semantic_api_views.analyze_document_pages,
         name='analyze_pages'),
]
```

### Intégration dans `backend/expert/urls.py`

```python
from django.urls import path, include

urlpatterns = [
    # ... autres urls ...

    # Endpoints sémantiques
    path('api/expert/', include('expert.semantic_urls')),
]
```

---

## Résumé des Endpoints Créés

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/expert/documents/{id}/json/` | JSON basique du document |
| GET | `/api/expert/documents/{id}/json-enriched/` | JSON enrichi sémantique |
| POST | `/api/expert/documents/{id}/enrich-json/` | Enrichir le JSON |
| POST | `/api/expert/documents/{id}/save-enriched-json/` | Sauvegarder JSON enrichi |
| POST | `/api/expert/documents/{id}/regenerate-json/` | Régénérer le JSON |
| GET | `/api/expert/documents/{id}/pages/{pageNumber}/json/` | JSON d'une page |
| GET | `/api/expert/documents/{id}/deltas/` | Comparaisons IA vs Expert |
| POST | `/api/expert/deltas/{id}/rate/` | Noter une correction |
| POST | `/api/expert/documents/{id}/regenerate-with-learning/` | Régénérer avec apprentissage |
| GET | `/api/expert/validated-documents/` | Liste des documents validés |
| POST | `/api/expert/documents/{id}/analyze-pages/` | Analyser les pages |

---

## Notes d'Implémentation

1. **Authentification:** Tous les endpoints nécessitent une authentification
2. **Permissions:** Vérifier que l'utilisateur a le rôle 'expert'
3. **CORS:** Configurer CORS pour autoriser les requêtes depuis localhost:3000
4. **Pagination:** Ajouter la pagination pour les listes de documents
5. **Cache:** Considérer le cache Redis pour les JSON volumineux
6. **Websockets:** Considérer WebSockets pour les analyses longues

---

## Prochaines Étapes

1. ✅ Créer les pages Next.js (FAIT)
2. ⚠️ Implémenter les vues Django backend
3. ⚠️ Tester les endpoints avec Postman/curl
4. ⚠️ Connecter le frontend au backend
5. ⚠️ Tester l'intégration complète
