# expert/semantic_api_views.py
"""
API Views pour les fonctionnalités JSON Sémantiques
Fournit les endpoints pour la visualisation et l'enrichissement des annotations JSON
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Count, Q
import json

from rawdocs.models import RawDocument, DocumentPage, Annotation
from expert.models import ExpertDelta, ExpertLog
from expert.json_enrichment import JSONEnricher
from expert.learning_service import ExpertLearningService


def generate_complete_json(document):
    """Génère le JSON complet (entities, relations, validated_qa) pour un document"""
    total_pages = document.pages.count()
    annotations_json = document.global_annotations_json
    
    # S'assurer que annotations_json est un dict
    if isinstance(annotations_json, str):
        try:
            annotations_json = json.loads(annotations_json)
        except:
            annotations_json = None
    
    if not annotations_json or not annotations_json.get('entities'):
        all_annotations = Annotation.objects.filter(
            page__document=document, is_validated=True
        ).select_related('annotation_type', 'page')

        entities_by_type = {}
        for ann in all_annotations:
            type_display = ann.annotation_type.display_name if ann.annotation_type else 'Unknown'
            if type_display not in entities_by_type:
                entities_by_type[type_display] = []
            text = ann.selected_text or ann.text or ''
            if text and text not in entities_by_type[type_display]:
                entities_by_type[type_display].append(text)

        annotations_json = {
            'document': {
                'id': str(document.id),
                'title': document.title or f'Document {document.id}',
                'total_pages': total_pages,
                'total_annotations': all_annotations.count()
            },
            'entities': entities_by_type,
            'generated_at': timezone.now().isoformat()
        }

    # 🔥 TOUJOURS régénérer les relations depuis la DB (même si le champ existe)
    if annotations_json:
        from rawdocs.models import AnnotationRelationship
        page_ids = document.pages.values_list('id', flat=True)
        annotation_ids = Annotation.objects.filter(page_id__in=page_ids).values_list('id', flat=True)
        validated_relations = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) | Q(target_annotation_id__in=annotation_ids),
            is_validated=True
        ).select_related('source_annotation__annotation_type', 'target_annotation__annotation_type')

        relations_list = []
        for rel in validated_relations:
            relations_list.append({
                'id': rel.id,
                'type': rel.relationship_name,
                'source': {
                    'type': rel.source_annotation.annotation_type.display_name,
                    'value': rel.source_annotation.selected_text,
                    'annotation_id': rel.source_annotation.id,
                    'page': rel.source_annotation.page.page_number
                },
                'target': {
                    'type': rel.target_annotation.annotation_type.display_name,
                    'value': rel.target_annotation.selected_text,
                    'annotation_id': rel.target_annotation.id,
                    'page': rel.target_annotation.page.page_number
                },
                'description': rel.description or '',
                'validated': True,
                'validated_at': rel.validated_at.isoformat() if rel.validated_at else None,
                'validated_by': rel.validated_by.username if rel.validated_by else None
            })
        annotations_json['relations'] = relations_list
        if 'metadata' not in annotations_json:
            annotations_json['metadata'] = {}
        annotations_json['metadata']['total_relations'] = len(relations_list)

    # 🔥 TOUJOURS régénérer les Q&A validées depuis la DB (même si le champ existe)
    if annotations_json:
        from expert.models import ValidatedQA
        validated_qa_list = ValidatedQA.objects.filter(
            Q(document=document) | Q(is_global=True), is_active=True
        ).order_by('-confidence_score', '-usage_count')

        qa_data = []
        for qa in validated_qa_list:
            qa_data.append({
                'id': qa.id,
                'question': qa.question,
                'question_normalized': qa.question_normalized,
                'answer': qa.answer,
                'source_type': qa.source_type,
                'json_path': qa.json_path,
                'confidence': qa.confidence_score,
                'usage_count': qa.usage_count,
                'correction_count': qa.correction_count,
                'corrections': qa.previous_answers,
                'validated_by': qa.validated_by.username if qa.validated_by else None,
                'validated_at': qa.validated_at.isoformat() if qa.validated_at else None,
                'tags': qa.tags,
                'is_global': qa.is_global
            })
        annotations_json['validated_qa'] = qa_data
        if 'metadata' not in annotations_json:
            annotations_json['metadata'] = {}
        annotations_json['metadata']['total_validated_qa'] = len(qa_data)

    return annotations_json


# ==================== 1. JSON BASIQUE DU DOCUMENT ====================

@require_http_methods(["GET"])
@login_required
def get_document_json(request, id):
    """
    GET /api/expert/documents/{id}/json/
    Récupère le JSON basique d'un document avec les statistiques
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        # Récupérer les pages avec leurs annotations
        pages = document.pages.all().order_by('page_number')
        pages_data = []

        for page in pages:
            annotation_count = page.annotations.count() if hasattr(page, 'annotations') else 0
            pages_data.append({
                'id': page.id,
                'page_number': page.page_number,
                'annotation_count': annotation_count
            })

        # Calculer les statistiques
        total_annotations = sum(p['annotation_count'] for p in pages_data)
        annotated_pages = sum(1 for p in pages_data if p['annotation_count'] > 0)
        total_pages = pages.count() if pages.exists() else document.total_pages or 0

        # Calculer la progression
        progression = 0
        if total_pages > 0:
            progression = int((annotated_pages / total_pages) * 100)

        # 🔥 GÉNÉRER LE JSON COMPLET (entities + relations + validated_qa)
        annotations_json = generate_complete_json(document)

        # Sauvegarder dans la DB pour que l'assistant puisse l'utiliser
        # Comparer en tant que dict, pas string
        current_json = document.global_annotations_json
        if isinstance(current_json, str):
            try:
                current_json = json.loads(current_json)
            except:
                current_json = {}
        
        if annotations_json != current_json:
            document.global_annotations_json = annotations_json
            document.save(update_fields=['global_annotations_json'])

        return JsonResponse({
            'success': True,
            'document': {
                'id': document.id,
                'title': document.title or f'Document {document.id}',
                'total_pages': total_pages,
                'pages': pages_data
            },
            'annotations_json': annotations_json,
            'summary': document.global_annotations_summary or '',
            'total_annotations': total_annotations,
            'annotated_pages': annotated_pages,
            'total_pages': total_pages,
            'progression': progression
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def update_document_json(request, id):
    """
    POST /api/expert/documents/{id}/json/update/
    Met à jour le JSON global du document après édition manuelle
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Parser les données
        data = json.loads(request.body)
        new_json = data.get('global_annotations_json')

        if not new_json:
            return JsonResponse({
                'success': False,
                'error': 'global_annotations_json requis'
            }, status=400)

        # Sauvegarder le nouveau JSON
        document.global_annotations_json = new_json
        document.save(update_fields=['global_annotations_json'])

        return JsonResponse({
            'success': True,
            'message': 'JSON sauvegardé avec succès',
            'document_id': document.id
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'JSON invalide'
        }, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 2. JSON ENRICHI SÉMANTIQUE ====================

@require_http_methods(["GET"])
@login_required
def get_document_json_enriched(request, id):
    """
    GET /api/expert/documents/{id}/json-enriched/
    Récupère le JSON enrichi sémantique avec relations, Q&A, etc.
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        total_annotations = Annotation.objects.filter(
            page__document=document
        ).count()

        return JsonResponse({
            'success': True,
            'document': {
                'id': document.id,
                'title': document.title or f'Document {document.id}',
                'doc_type': document.doc_type or '',
                'source': document.source or '',
                'country': document.country or ''
            },
            'basic_json': document.global_annotations_json or {},
            'enriched_json': document.enriched_annotations_json or {
                'relations': [],
                'questions_answers': [],
                'contexts': [],
                'semantic_summary': ''
            },
            'total_annotations': total_annotations
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 3. ENRICHIR LE JSON ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def enrich_document_json(request, id):
    """
    POST /api/expert/documents/{id}/enrich-json/
    Enrichit le JSON d'un document avec des relations sémantiques
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        basic_json = document.global_annotations_json or {}

        if not basic_json.get('entities'):
            return JsonResponse({
                'success': False,
                'error': "Aucune entité trouvée. Veuillez d'abord générer le JSON de base."
            }, status=400)

        # Contexte du document
        document_context = {
            "doc_type": document.doc_type or '',
            "country": document.country or '',
            "language": document.language or '',
            "source": document.source or '',
            "title": document.title or '',
            "total_pages": document.total_pages
        }

        document_summary = document.global_annotations_summary or ""

        # Enrichir avec l'IA
        enricher = JSONEnricher()
        enriched = enricher.enrich_basic_json(
            basic_json,
            document_context,
            document_summary=document_summary,
            expert_relations=[],
            use_ai=True
        )

        # Assurer les descriptions des relations
        enriched = enricher.ensure_relation_descriptions(
            enriched,
            document_context=document_context,
            document_summary=document_summary,
            prefer_fluent_ai=True
        )

        # Sauvegarder
        document.enriched_annotations_json = enriched
        document.enriched_at = timezone.now()
        document.enriched_by = request.user
        document.save(update_fields=['enriched_annotations_json', 'enriched_at', 'enriched_by'])

        # Logger l'action
        try:
            ExpertLog.objects.create(
                expert=request.user,
                document_id=document.id,
                document_title=document.title or f'Document {document.id}',
                action='document_reviewed',
                reason='JSON enrichi automatiquement avec contexte sémantique'
            )
        except Exception:
            pass

        return JsonResponse({
            'success': True,
            'message': 'JSON enrichi avec succès',
            'relations_count': len(enriched.get('relations', [])),
            'qa_pairs_count': len(enriched.get('questions_answers', [])),
            'contexts_count': len(enriched.get('contexts', {}))
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Erreur lors de l\'enrichissement: {str(e)}'
        }, status=500)


# ==================== 4. SAUVEGARDER JSON ENRICHI ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def save_enriched_json(request, id):
    """
    POST /api/expert/documents/{id}/save-enriched-json/
    Sauvegarde les modifications manuelles du JSON enrichi
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        data = json.loads(request.body)
        enriched_json = data.get('enriched_json', {})

        # Valider la structure
        if not isinstance(enriched_json, dict):
            return JsonResponse({
                'success': False,
                'error': 'Format JSON invalide'
            }, status=400)

        # Sauvegarder
        document.enriched_annotations_json = enriched_json
        document.enriched_at = timezone.now()
        document.enriched_by = request.user
        document.save(update_fields=['enriched_annotations_json', 'enriched_at', 'enriched_by'])

        return JsonResponse({
            'success': True,
            'message': 'JSON enrichi sauvegardé avec succès'
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'JSON invalide'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 5. RÉGÉNÉRER JSON ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def regenerate_json(request, id):
    """
    POST /api/expert/documents/{id}/regenerate-json/
    Régénère le JSON enrichi à partir du JSON basique
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        # Réinitialiser le JSON enrichi
        document.enriched_annotations_json = None
        document.save(update_fields=['enriched_annotations_json'])

        return JsonResponse({
            'success': True,
            'message': 'JSON enrichi réinitialisé. Utilisez "Enrichir" pour le régénérer.'
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 6. JSON D'UNE PAGE SPÉCIFIQUE ====================

@require_http_methods(["GET", "PUT"])
@login_required
@csrf_exempt
def get_page_json(request, id, page_number):
    """
    GET/PUT /api/expert/documents/{id}/pages/{page_number}/json/
    Récupère ou met à jour le JSON d'une page spécifique
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        # Vérifier que le document a des pages
        if not document.pages.exists():
            return JsonResponse({
                'success': False,
                'error': 'Ce document n\'a pas encore de pages extraites. Veuillez d\'abord extraire les pages du PDF.'
            }, status=404)
        
        page = get_object_or_404(document.pages, page_number=page_number)

        if request.method == 'GET':
            # Récupérer le JSON de la page
            annotations_json = page.annotations_json if hasattr(page, 'annotations_json') else {}
            summary = page.annotations_summary if hasattr(page, 'annotations_summary') else ''
            
            # Si pas de JSON stocké, générer à partir des annotations
            if not annotations_json:
                annotations = page.annotations.filter(is_validated=True).select_related('annotation_type')
                entities_by_type = {}
                
                for ann in annotations:
                    type_display = ann.annotation_type.display_name if ann.annotation_type else 'Unknown'
                    if type_display not in entities_by_type:
                        entities_by_type[type_display] = []
                    
                    # Ajouter uniquement le texte (pas de duplication)
                    text = ann.selected_text or ann.text or ''
                    if text and text not in entities_by_type[type_display]:
                        entities_by_type[type_display].append(text)
                
                annotations_json = {
                    'document': {
                        'id': str(document.id),
                        'title': document.title or f'Document {document.id}',
                        'doc_type': document.doc_type or 'unknown',
                        'source': document.source or 'client',
                        'page_number': page.page_number,
                        'total_annotations': annotations.count()
                    },
                    'entities': entities_by_type,
                    'generated_at': timezone.now().isoformat()
                }

            return JsonResponse({
                'success': True,
                'document': {
                    'id': document.id,
                    'title': document.title or f'Document {document.id}'
                },
                'page': {
                    'page_number': page.page_number,
                    'id': page.id
                },
                'annotations_json': annotations_json,
                'summary': summary,
                'total_pages': document.pages.count()
            })

        elif request.method == 'PUT':
            # Mettre à jour le JSON de la page
            data = json.loads(request.body)
            annotations_json = data.get('annotations_json', {})

            if hasattr(page, 'annotations_json'):
                page.annotations_json = annotations_json
                page.save(update_fields=['annotations_json'])

            return JsonResponse({
                'success': True,
                'message': 'JSON de la page sauvegardé avec succès'
            })

    except (RawDocument.DoesNotExist, DocumentPage.DoesNotExist):
        return JsonResponse({
            'success': False,
            'error': 'Document ou page non trouvé'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'JSON invalide'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 7. COMPARAISONS IA VS EXPERT (DELTAS) ====================

@require_http_methods(["GET"])
@login_required
def get_expert_deltas(request, id):
    """
    GET /api/expert/documents/{id}/deltas/
    Récupère les comparaisons IA vs Expert pour un document
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        # Récupérer tous les deltas pour ce document
        deltas = ExpertDelta.objects.filter(
            document=document,
            is_active=True
        ).select_related('expert').order_by('-created_at')

        # Grouper par session
        sessions_dict = {}

        for delta in deltas:
            session_id = delta.session_id or 'default'

            if session_id not in sessions_dict:
                sessions_dict[session_id] = {
                    'session_id': session_id,
                    'expert': delta.expert.username if delta.expert else 'N/A',
                    'created_at': delta.created_at.isoformat(),
                    'deltas': []
                }

            sessions_dict[session_id]['deltas'].append({
                'id': delta.id,
                'delta_type': delta.delta_type,
                'ai_version': delta.ai_version,
                'expert_version': delta.expert_version,
                'confidence_before': delta.confidence_before or 0.0,
                'reused_count': delta.reused_count or 0,
                'correction_summary': delta.correction_summary,
                'expert_rating': delta.expert_rating,
                'created_at': delta.created_at.isoformat()
            })

        # Calculer les statistiques de types de deltas
        delta_types = {}
        for delta in deltas:
            delta_type = delta.delta_type
            delta_types[delta_type] = delta_types.get(delta_type, 0) + 1

        experts_count = deltas.values('expert').distinct().count()

        return JsonResponse({
            'success': True,
            'document': {
                'id': document.id,
                'title': document.title or f'Document {document.id}'
            },
            'sessions': list(sessions_dict.values()),
            'total_corrections': deltas.count(),
            'experts_count': experts_count,
            'delta_types': delta_types
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 8. NOTER UNE CORRECTION ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def rate_delta(request, delta_id):
    """
    POST /api/expert/deltas/{id}/rate/
    Noter la qualité d'une correction (1-5)
    """
    try:
        delta = get_object_or_404(ExpertDelta, id=delta_id)

        data = json.loads(request.body)
        rating = data.get('rating')

        if not rating or not isinstance(rating, int) or rating < 1 or rating > 5:
            return JsonResponse({
                'success': False,
                'error': 'La note doit être entre 1 et 5'
            }, status=400)

        delta.expert_rating = rating
        delta.save(update_fields=['expert_rating'])

        return JsonResponse({
            'success': True,
            'message': 'Note enregistrée avec succès',
            'rating': rating
        })

    except ExpertDelta.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Correction non trouvée'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'JSON invalide'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 9. RÉGÉNÉRER AVEC APPRENTISSAGE ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def regenerate_with_learning(request, id):
    """
    POST /api/expert/documents/{id}/regenerate-with-learning/
    Régénère le JSON en appliquant les patterns appris
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        # Utiliser le service d'apprentissage
        learning_service = ExpertLearningService()

        current_json = document.enriched_annotations_json or {}
        document_context = {
            'title': document.title or '',
            'doc_type': document.doc_type or '',
            'source': document.source or '',
            'country': document.country or ''
        }

        # Appliquer les patterns appris
        enhanced_json = learning_service.apply_learned_patterns(
            current_json=current_json,
            document_context=document_context,
            expert_user=request.user
        )

        # Sauvegarder
        document.enriched_annotations_json = enhanced_json
        document.enriched_at = timezone.now()
        document.enriched_by = request.user
        document.save(update_fields=['enriched_annotations_json', 'enriched_at', 'enriched_by'])

        return JsonResponse({
            'success': True,
            'message': 'JSON régénéré avec les patterns appris',
            'patterns_applied': enhanced_json.get('_meta', {}).get('patterns_applied', 0)
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 10. DOCUMENTS VALIDÉS ====================

@require_http_methods(["GET"])
@login_required
def get_validated_documents(request):
    """
    GET /api/expert/validated-documents/
    Récupère la liste des documents validés
    """
    try:
        # Filtrer les documents validés
        documents = RawDocument.objects.filter(
            Q(is_validated=True) | Q(is_expert_validated=True)
        ).select_related('owner').order_by('-validated_at')

        # Filtres optionnels
        doc_type = request.GET.get('doc_type')
        source = request.GET.get('source')
        country = request.GET.get('country')

        if doc_type:
            documents = documents.filter(doc_type=doc_type)
        if source:
            documents = documents.filter(source=source)
        if country:
            documents = documents.filter(country=country)

        # Construire la liste
        documents_list = []

        for doc in documents:
            total_pages = doc.pages.count()
            pages_analyzed = doc.pages.filter(
                annotations__isnull=False
            ).distinct().count()

            documents_list.append({
                'id': doc.id,
                'title': doc.title or f'Document {doc.id}',
                'doc_type': doc.doc_type or '',
                'source': doc.source or '',
                'country': doc.country or '',
                'total_pages': total_pages,
                'pages_analyzed': pages_analyzed,
                'is_expert_validated': doc.is_expert_validated,
                'summary': doc.global_annotations_summary or '',
                'validated_at': doc.validated_at.isoformat() if doc.validated_at else None
            })

        return JsonResponse({
            'success': True,
            'documents': documents_list
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== 11. ANALYSER LES PAGES D'UN DOCUMENT ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def analyze_document_pages(request, id):
    """
    POST /api/expert/documents/{id}/analyze-pages/
    Analyse les pages d'un document pour extraire les relations
    """
    try:
        document = get_object_or_404(RawDocument, id=id)

        # Vérifier l'accès
        if not document.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Accès non autorisé'
            }, status=403)

        data = json.loads(request.body)
        force_reanalyze = data.get('force_reanalyze', False)

        # Récupérer les pages à analyser
        pages = document.pages.all().order_by('page_number')

        pages_data = []
        total_relations = 0

        for page in pages:
            # Vérifier si la page a déjà été analysée
            page_json = page.annotations_json if hasattr(page, 'annotations_json') else {}

            if not force_reanalyze and page_json:
                # Page déjà analysée
                page_relations = page_json.get('relations', [])
                pages_data.append({
                    'page_number': page.page_number,
                    'importance_score': page_json.get('importance_score', 50),
                    'summary': page_json.get('summary', ''),
                    'relations': page_relations,
                    'entities': page_json.get('entities', {}),
                    'obligations': page_json.get('obligations', []),
                    'newly_analyzed': False
                })
                total_relations += len(page_relations)
            else:
                # Analyser la page (logique simplifiée pour l'instant)
                # TODO: Implémenter l'analyse IA réelle
                page_relations = []
                pages_data.append({
                    'page_number': page.page_number,
                    'importance_score': 50,
                    'summary': f'Résumé de la page {page.page_number}',
                    'relations': page_relations,
                    'entities': {},
                    'obligations': [],
                    'newly_analyzed': True
                })

        return JsonResponse({
            'success': True,
            'total_relations': total_relations,
            'pages_analyzed': len(pages_data),
            'pages_data': pages_data
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'JSON invalide'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
