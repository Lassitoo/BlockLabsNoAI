# expert/qa_api_views.py
"""
API Views pour le système de Questions-Réponses Intelligent (SANS IA)
Endpoints pour poser des questions, valider et corriger les réponses
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.utils import timezone
import json

from rawdocs.models import RawDocument, Annotation, AnnotationRelationship
from expert.models import ValidatedQA
from expert.intelligent_qa_service import IntelligentQAService
from expert.relationship_qa_service import RelationshipQAService
from expert.json_sync_service import JsonSyncService


# ==================== INTELLIGENT Q&A SYSTEM (SANS IA) ====================

@csrf_exempt
@require_http_methods(["POST"])
def ask_question(request, doc_id):
    """
    POST /api/expert/documents/{doc_id}/ask/
    Pose une question intelligente sur le document (SANS IA)
    Supporte aussi les questions sur les relations

    Body: {
        "question": "Quelle est la valeur de appearance?",
        "context": {  // Optionnel
            "selected_annotations": [1, 2]
        }
    }

    Response: {
        "answer": "...",
        "source": "validated_qa|json_field|json_entity|json_relation|not_found",
        "confidence": 0.0-1.0,
        "needs_validation": true|false,
        "json_path": "...",
        "json_data": {...},
        "qa_id": 123 (si existant),
        "action": "create_relation|modify_relation|..." (si question sur relation)
    }
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)
        data = json.loads(request.body)
        question = data.get('question', '').strip()
        context = data.get('context', {})

        if not question:
            return JsonResponse({
                'success': False,
                'error': 'Question requise'
            }, status=400)

        # 🔥 FORCER LA GÉNÉRATION DU JSON COMPLET si vide ou incomplet
        if not doc.global_annotations_json or 'entities' not in doc.global_annotations_json:
            from expert.semantic_api_views import generate_complete_json
            doc.global_annotations_json = generate_complete_json(doc)
            doc.save(update_fields=['global_annotations_json'])

        # Détecter si c'est une question sur les relations
        relation_keywords = ['relation', 'créer', 'modifier', 'supprimer', 'lien', 'entre']
        is_relation_question = any(keyword in question.lower() for keyword in relation_keywords)

        if is_relation_question:
            # Utiliser le service de relations
            relation_service = RelationshipQAService()
            result = relation_service.process_relationship_question(
                question=question,
                document=doc,
                user=request.user if request.user.is_authenticated else None,
                context=context
            )
        else:
            # Utiliser le service Q&A standard
            qa_service = IntelligentQAService()
            result = qa_service.ask_question(
                question=question,
                document=doc,
                user=request.user if request.user.is_authenticated else None
            )

        return JsonResponse({
            'success': True,
            **result
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def validate_answer(request, doc_id):
    """
    POST /api/expert/documents/{doc_id}/validate-answer/
    Valide ou corrige une réponse (apprentissage du système)

    Body: {
        "question": "Quelle est la valeur de appearance?",
        "answer": "Liquide transparent",
        "source_type": "json_field|json_entity|expert_knowledge",
        "json_path": "entities.Product[0].appearance",
        "json_data": {...},
        "tags": ["appearance", "product"],
        "is_global": false
    }
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)
        data = json.loads(request.body)

        question = data.get('question', '').strip()
        answer = data.get('answer', '').strip()

        if not question or not answer:
            return JsonResponse({
                'success': False,
                'error': 'Question et réponse requises'
            }, status=400)

        # Valider la réponse
        qa_service = IntelligentQAService()
        validated_qa = qa_service.validate_answer(
            question=question,
            answer=answer,
            document=doc if not data.get('is_global', False) else None,
            validated_by=request.user,
            source_type=data.get('source_type', 'expert_knowledge'),
            json_path=data.get('json_path', ''),
            json_data=data.get('json_data', {}),
            tags=data.get('tags', []),
            is_global=data.get('is_global', False)
        )

        # 🔥 SYNCHRONISER AUTOMATIQUEMENT LA Q&A DANS LE JSON
        from expert.json_sync_service import JsonSyncService
        JsonSyncService.sync_single_qa(validated_qa, request.user)

        return JsonResponse({
            'success': True,
            'message': 'Réponse validée avec succès',
            'qa_id': validated_qa.id,
            'is_new': validated_qa.correction_count == 0,
            'correction_count': validated_qa.correction_count,
            'confidence_score': validated_qa.confidence_score
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def correct_answer(request, qa_id):
    """
    POST /api/expert/qa/{qa_id}/correct/
    Corrige une réponse existante

    Body: {
        "new_answer": "Nouvelle réponse corrigée"
    }
    """
    try:
        data = json.loads(request.body)
        new_answer = data.get('new_answer', '').strip()

        if not new_answer:
            return JsonResponse({
                'success': False,
                'error': 'Nouvelle réponse requise'
            }, status=400)

        # Corriger la réponse
        qa_service = IntelligentQAService()
        validated_qa = qa_service.correct_answer(
            qa_id=qa_id,
            new_answer=new_answer,
            corrected_by=request.user
        )

        # 🔥 SYNCHRONISER AUTOMATIQUEMENT LA CORRECTION DANS LE JSON
        from expert.json_sync_service import JsonSyncService
        JsonSyncService.sync_single_qa(validated_qa, request.user)

        return JsonResponse({
            'success': True,
            'message': 'Réponse corrigée avec succès',
            'qa_id': validated_qa.id,
            'correction_count': validated_qa.correction_count,
            'confidence_score': validated_qa.confidence_score,
            'previous_answers': validated_qa.previous_answers
        })

    except ValidatedQA.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Q&A non trouvée'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
def get_validated_qa_list(request, doc_id):
    """
    GET /api/expert/documents/{doc_id}/qa/
    Récupère la liste des Q&A validées pour un document
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)

        # Récupérer les Q&A pour ce document + les globales
        qa_list = ValidatedQA.objects.filter(
            Q(document=doc) | Q(is_global=True),
            is_active=True
        ).order_by('-confidence_score', '-usage_count')

        results = []
        for qa in qa_list:
            results.append({
                'id': qa.id,
                'question': qa.question,
                'answer': qa.answer,
                'source_type': qa.source_type,
                'json_path': qa.json_path,
                'confidence_score': qa.confidence_score,
                'usage_count': qa.usage_count,
                'correction_count': qa.correction_count,
                'validated_by': qa.validated_by.username if qa.validated_by else None,
                'validated_at': qa.validated_at.isoformat(),
                'is_global': qa.is_global,
                'tags': qa.tags
            })

        return JsonResponse({
            'success': True,
            'qa_list': results,
            'total': len(results)
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def correct_answer_from_search(request):
    """
    POST /api/expert/qa/correct/
    Corrige une réponse trouvée par l'assistant de recherche

    Body: {
        "document_id": 12,
        "question": "quel est le dosage du produit S 6490",
        "original_answer": "Le dosage de S 6490 est : 5 mg",
        "corrected_answer": "Le dosage du produit S 6490 est : 5 mg (vérifié)",
        "json_path": "relations[0]",
        "source_type": "relation_json"
    }
    """
    try:
        data = json.loads(request.body)
        document_id = data.get('document_id')
        question = data.get('question', '').strip()
        corrected_answer = data.get('corrected_answer', '').strip()
        original_answer = data.get('original_answer', '').strip()
        json_path = data.get('json_path', '')
        source_type = data.get('source_type', 'json_entity')

        # Validation
        if not all([document_id, question, corrected_answer]):
            return JsonResponse({
                'success': False,
                'error': 'document_id, question et corrected_answer sont requis'
            }, status=400)

        # Récupérer le document
        document = RawDocument.objects.get(id=document_id)

        # Chercher si une Q&A existe déjà pour cette question
        existing_qa = ValidatedQA.objects.filter(
            document=document,
            question=question,
            is_active=True
        ).first()

        qa_service = IntelligentQAService()

        if existing_qa:
            # Corriger la Q&A existante
            validated_qa = qa_service.correct_answer(
                qa_id=existing_qa.id,
                new_answer=corrected_answer,
                corrected_by=request.user if request.user.is_authenticated else None
            )
        else:
            # Créer une nouvelle Q&A validée
            validated_qa = ValidatedQA.objects.create(
                document=document,
                question=question,
                answer=corrected_answer,
                source_type='validated_qa',  # Maintenant validée par l'expert
                json_path=json_path,
                validated_by=request.user if request.user.is_authenticated else None,
                validated_at=timezone.now(),
                confidence_score=1.0,  # Confiance maximale car validé par expert
                is_active=True,
                correction_count=1,
                previous_answers=[original_answer] if original_answer else []
            )

        # Synchroniser dans le JSON global
        JsonSyncService.sync_single_qa(
            validated_qa,
            request.user if request.user.is_authenticated else None
        )

        return JsonResponse({
            'success': True,
            'message': 'Correction sauvegardée et JSON mis à jour',
            'qa_id': validated_qa.id,
            'question': validated_qa.question,
            'answer': validated_qa.answer,
            'confidence_score': validated_qa.confidence_score,
            'correction_count': validated_qa.correction_count
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
def get_qa_statistics(request, doc_id=None):
    """
    GET /api/expert/qa/statistics/
    GET /api/expert/documents/{doc_id}/qa/statistics/
    Récupère les statistiques des Q&A
    """
    try:
        doc = None
        if doc_id:
            doc = RawDocument.objects.get(id=doc_id)

        qa_service = IntelligentQAService()
        stats = qa_service.get_qa_statistics(document=doc)

        return JsonResponse({
            'success': True,
            **stats
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
@login_required
def delete_qa(request, qa_id):
    """
    DELETE /api/expert/qa/{qa_id}/
    Supprime (désactive) une Q&A
    """
    try:
        qa = ValidatedQA.objects.get(id=qa_id)

        # Vérifier que l'utilisateur est celui qui l'a validé ou un admin
        if qa.validated_by != request.user and not request.user.is_staff:
            return JsonResponse({
                'success': False,
                'error': 'Permission refusée'
            }, status=403)

        # Désactiver au lieu de supprimer
        qa.is_active = False
        qa.save()

        return JsonResponse({
            'success': True,
            'message': 'Q&A supprimée avec succès'
        })

    except ValidatedQA.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Q&A non trouvée'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== RELATIONSHIP MANAGEMENT VIA Q&A ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def create_relation_from_qa(request):
    """
    POST /api/expert/relations/create-from-qa/
    Crée une relation basée sur la suggestion de l'assistant

    Body: {
        "source_annotation_id": 1,
        "target_annotation_id": 2,
        "relationship_name": "contains",
        "description": "Le produit contient la substance"
    }
    """
    try:
        data = json.loads(request.body)

        source_id = data.get('source_annotation_id')
        target_id = data.get('target_annotation_id')
        relationship_name = data.get('relationship_name', '').strip()
        description = data.get('description', '').strip()

        if not source_id or not target_id or not relationship_name:
            return JsonResponse({
                'success': False,
                'error': 'source_annotation_id, target_annotation_id et relationship_name requis'
            }, status=400)

        source = Annotation.objects.get(id=source_id)
        target = Annotation.objects.get(id=target_id)

        # Vérifier si la relation existe déjà
        existing = AnnotationRelationship.objects.filter(
            source_annotation=source,
            target_annotation=target,
            relationship_name=relationship_name
        ).first()

        if existing:
            return JsonResponse({
                'success': False,
                'error': 'Cette relation existe déjà',
                'relationship_id': existing.id
            }, status=400)

        # Créer la relation
        relationship = AnnotationRelationship.objects.create(
            source_annotation=source,
            target_annotation=target,
            relationship_name=relationship_name,
            description=description,
            created_by=request.user
        )

        return JsonResponse({
            'success': True,
            'message': 'Relation créée avec succès',
            'relationship': {
                'id': relationship.id,
                'source': {
                    'id': source.id,
                    'text': source.selected_text,
                    'type': source.annotation_type.display_name
                },
                'target': {
                    'id': target.id,
                    'text': target.selected_text,
                    'type': target.annotation_type.display_name
                },
                'relationship_name': relationship.relationship_name,
                'description': relationship.description,
                'created_at': relationship.created_at.isoformat()
            }
        })

    except Annotation.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Annotation non trouvée'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def update_relation_from_qa(request, relationship_id):
    """
    POST /api/expert/relations/{relationship_id}/update-from-qa/
    Met à jour une relation basée sur la suggestion de l'assistant

    Body: {
        "relationship_name": "nouveau_nom",
        "description": "nouvelle description"
    }
    """
    try:
        data = json.loads(request.body)

        relationship = AnnotationRelationship.objects.get(id=relationship_id)

        new_name = data.get('relationship_name', '').strip()
        new_description = data.get('description', '').strip()

        if new_name:
            relationship.relationship_name = new_name
        if new_description:
            relationship.description = new_description

        relationship.save()

        return JsonResponse({
            'success': True,
            'message': 'Relation mise à jour avec succès',
            'relationship': {
                'id': relationship.id,
                'relationship_name': relationship.relationship_name,
                'description': relationship.description
            }
        })

    except AnnotationRelationship.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Relation non trouvée'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def update_json_from_relations(request, doc_id):
    """
    POST /api/expert/documents/{doc_id}/update-json-from-relations/
    Met à jour le JSON enrichi du document basé sur les relations validées
    Utilise le nouveau service de synchronisation

    Body: {
        "auto_update": true  // Optionnel
    }
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)

        # Utiliser le service de synchronisation
        sync_result = JsonSyncService.sync_document_json(doc, request.user)

        return JsonResponse({
            'success': True,
            'message': 'JSON mis à jour avec succès',
            'stats': {
                'total_entities': sync_result['total_entities'],
                'total_relations': sync_result['total_relations'],
                'entity_types': sync_result['entity_types'],
                'synced_at': sync_result['synced_at']
            }
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
def get_json_sync_status(request, doc_id):
    """
    GET /api/expert/documents/{doc_id}/json-sync-status/
    Obtient le statut de synchronisation du JSON enrichi

    Response: {
        "is_synced": true/false,
        "db_relations_count": 5,
        "json_relations_count": 5,
        "needs_sync": false,
        "last_synced": "2024-12-15T10:30:00Z",
        "synced_by": "expert1"
    }
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)

        # Obtenir le statut de synchronisation
        status = JsonSyncService.get_sync_status(doc)

        return JsonResponse({
            'success': True,
            **status
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def initialize_enriched_json(request, doc_id):
    """
    POST /api/expert/documents/{doc_id}/initialize-enriched-json/
    Initialise le JSON enrichi à partir des annotations existantes

    Utile pour les documents qui ont seulement global_annotations_json
    mais pas encore enriched_annotations_json

    Body: {
        "force": false  // Optionnel - force la réinitialisation même si enriched_json existe
    }
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)
        data = json.loads(request.body) if request.body else {}
        force = data.get('force', False)

        # Vérifier si enriched_annotations_json existe déjà
        if doc.enriched_annotations_json and not force:
            return JsonResponse({
                'success': False,
                'error': 'Le JSON enrichi existe déjà. Utilisez force=true pour réinitialiser.',
                'has_enriched_json': True
            }, status=400)

        # Utiliser le service de synchronisation pour créer le JSON enrichi
        user = request.user if request.user.is_authenticated else None
        if not user:
            return JsonResponse({
                'success': False,
                'error': 'Authentification requise'
            }, status=401)

        sync_result = JsonSyncService.sync_document_json(doc, user)

        return JsonResponse({
            'success': True,
            'message': 'JSON enrichi initialisé avec succès',
            'stats': sync_result
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document non trouvé'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
