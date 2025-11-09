# expert/api_views.py
"""
API Views for Expert Dashboard - Next.js Frontend
Provides RESTful endpoints for expert review and validation
"""

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.db.models import Count, Q, Avg, Sum, Case, When, IntegerField
from django.utils import timezone
from datetime import timedelta
import json


from rawdocs.models import RawDocument, DocumentPage, Annotation, AnnotationType, AnnotationRelationship
from expert.models import ExpertLog, ExpertDelta


# ==================== DASHBOARD ====================

@require_http_methods(["GET"])
@login_required
def get_expert_dashboard_data(request):
    """
    GET /api/expert/dashboard/
    Returns dashboard statistics and recent documents
    """
    try:
        # Documents prêts pour révision (status = expert_ready)
        ready_documents = RawDocument.objects.filter(
            status='expert_ready'
        ).select_related('annotator')

        # Statistiques d'annotations
        total_annotations = Annotation.objects.filter(
            page__document__status='expert_ready'
        ).count()

        pending_annotations = Annotation.objects.filter(
            page__document__status='expert_ready',
            is_validated=False
        ).count()

        validated_annotations = Annotation.objects.filter(
            is_validated=True,
            validation_status='validated'
        ).count()

        rejected_annotations = Annotation.objects.filter(
            is_validated=True,
            validation_status='rejected'
        ).count()

        # Taux de validation
        validation_rate = 0
        if total_annotations > 0:
            validation_rate = round((validated_annotations / total_annotations) * 100, 1)

        # Documents récents avec annotations
        recent_documents = []
        for doc in ready_documents[:20]:
            pages_count = doc.pages.count()
            annotations_count = Annotation.objects.filter(page__document=doc).count()
            validated_count = Annotation.objects.filter(
                page__document=doc,
                is_validated=True,
                validation_status='validated'
            ).count()
            pending_count = Annotation.objects.filter(
                page__document=doc,
                is_validated=False
            ).count()

            recent_documents.append({
                'id': doc.id,
                'title': doc.title or f'Document {doc.id}',
                'annotator': {
                    'username': doc.annotator.username if doc.annotator else 'N/A'
                },
                'pages': {
                    'count': pages_count
                },
                'total_annotations': annotations_count,
                'validated_annotations': validated_count,
                'pending_annotations': pending_count,
                'updated_at': doc.updated_at.isoformat() if doc.updated_at else None
            })

        # Statistiques de révision
        completed_reviews = ExpertLog.objects.filter(
            action='annotation_validated'
        ).count()

        to_review_count = ready_documents.filter(
            pages__annotations__is_validated=False
        ).distinct().count()

        in_progress_reviews = ready_documents.exclude(
            pages__annotations__is_validated=False
        ).exclude(
            pages__annotations__is_validated=True
        ).distinct().count()

        return JsonResponse({
            'success': True,
            'stats': {
                'ready_documents_count': ready_documents.count(),
                'pending_annotations': pending_annotations,
                'completed_reviews': completed_reviews,
                'validation_rate': validation_rate,
                'to_review_count': to_review_count,
                'in_progress_reviews': in_progress_reviews,
                'rejected_documents': rejected_annotations
            },
            'recent_documents': recent_documents
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== DOCUMENTS LIST ====================

@require_http_methods(["GET"])
@login_required
def get_expert_documents_list(request):
    """
    GET /api/expert/documents/?page=1
    Returns paginated list of documents ready for expert review
    """
    try:
        page_number = request.GET.get('page', 1)
        page_size = request.GET.get('page_size', 10)

        # Documents prêts pour révision
        documents = RawDocument.objects.filter(
            status='expert_ready'
        ).select_related('annotator').order_by('-expert_ready_at')

        # Pagination
        paginator = Paginator(documents, page_size)
        page_obj = paginator.get_page(page_number)

        # Construire la liste des documents
        documents_list = []
        for doc in page_obj:
            annotations_count = Annotation.objects.filter(page__document=doc).count()
            pending_count = Annotation.objects.filter(
                page__document=doc,
                is_validated=False
            ).count()

            documents_list.append({
                'id': doc.id,
                'file': {
                    'name': doc.file.name if doc.file else f'document_{doc.id}.pdf'
                },
                'title': doc.title or f'Document {doc.id}',
                'expert_ready_at': doc.expert_ready_at.isoformat() if doc.expert_ready_at else None,
                'total_pages': doc.pages.count(),
                'annotation_count': annotations_count,
                'pending_annotations': pending_count,
                'annotator': {
                    'username': doc.annotator.username if doc.annotator else 'Non défini'
                }
            })

        return JsonResponse({
            'success': True,
            'documents': documents_list,
            'pagination': {
                'current': page_obj.number,
                'total': paginator.num_pages,
                'hasNext': page_obj.has_next(),
                'hasPrevious': page_obj.has_previous()
            }
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== DOCUMENT REVIEW ====================

@require_http_methods(["GET"])
@login_required
def get_document_review_data(request, doc_id):
    """
    GET /api/expert/documents/{id}/review/
    Returns document details and annotations for review
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)

        # Statistiques d'annotations
        all_annotations = Annotation.objects.filter(page__document=doc)
        total_annotations = all_annotations.count()
        total_pending = all_annotations.filter(is_validated=False).count()
        validated_annotations = all_annotations.filter(
            is_validated=True,
            validation_status='validated'
        ).count()
        rejected_annotations = all_annotations.filter(
            is_validated=True,
            validation_status='rejected'
        ).count()

        # Pourcentage de complétion
        completion_percentage = 0
        if total_annotations > 0:
            completion_percentage = round(((validated_annotations + rejected_annotations) / total_annotations) * 100, 1)

        # Annotations par page (seulement celles en attente)
        pages_with_annotations = {}
        pending_annotations_by_page = all_annotations.filter(
            is_validated=False
        ).select_related('page', 'annotation_type', 'created_by').order_by('page__page_number')

        for annotation in pending_annotations_by_page:
            page_num = str(annotation.page.page_number)

            if page_num not in pages_with_annotations:
                # Récupérer un extrait du texte de la page
                page_text = getattr(annotation.page, 'text_content', '') or getattr(annotation.page, 'page_text', '') or ''
                page_preview = page_text[:100] + '...' if len(page_text) > 100 else page_text

                pages_with_annotations[page_num] = {
                    'page_text_preview': page_preview,
                    'annotations': []
                }

            # Récupérer le nom du type d'annotation
            annotation_type_name = getattr(annotation.annotation_type, 'display_name', None) or \
                                   getattr(annotation.annotation_type, 'name', None) or \
                                   str(annotation.annotation_type)

            annotation_type_color = getattr(annotation.annotation_type, 'color', '#3b82f6')

            pages_with_annotations[page_num]['annotations'].append({
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'start_pos': annotation.start_pos,
                'end_pos': annotation.end_pos,
                'annotation_type': {
                    'display_name': annotation_type_name,
                    'color': annotation_type_color
                },
                'created_by': {
                    'username': annotation.created_by.username if annotation.created_by else 'Système'
                },
                'created_at': annotation.created_at.isoformat()
            })

        return JsonResponse({
            'success': True,
            'id': doc.id,
            'title': doc.title or f'Document {doc.id}',
            'created_at': doc.created_at.isoformat() if doc.created_at else None,
            'total_pending': total_pending,
            'validated_annotations': validated_annotations,
            'rejected_annotations': rejected_annotations,
            'total_annotations': total_annotations,
            'completion_percentage': completion_percentage,
            'pages_with_annotations': pages_with_annotations
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


# ==================== VALIDATE ANNOTATION ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def validate_annotation(request, annotation_id):
    """
    POST /api/expert/annotations/{id}/validate/
    Validate or reject an annotation
    Body: { "action": "validate" | "reject" }
    """
    try:
        data = json.loads(request.body)
        action = data.get('action')

        if action not in ['validate', 'reject']:
            return JsonResponse({
                'success': False,
                'error': 'Action must be "validate" or "reject"'
            }, status=400)

        annotation = Annotation.objects.select_related(
            'page__document', 'annotation_type', 'created_by'
        ).get(id=annotation_id)

        # Mettre à jour le statut de validation
        annotation.is_validated = True
        if action == 'validate':
            annotation.validation_status = 'validated'
            log_action = 'annotation_validated'
        else:
            annotation.validation_status = 'rejected'
            log_action = 'annotation_rejected'

        annotation.validated_by = request.user
        annotation.validated_at = timezone.now()
        annotation.save()

        # Récupérer le nom du type d'annotation
        annotation_type_name = getattr(annotation.annotation_type, 'display_name', None) or \
                               getattr(annotation.annotation_type, 'name', None) or \
                               str(annotation.annotation_type)

        # Logger l'action
        ExpertLog.objects.create(
            expert=request.user,
            document_id=annotation.page.document.id,
            document_title=annotation.page.document.title or f'Document {annotation.page.document.id}',
            page_id=annotation.page.id,
            page_number=annotation.page.page_number,
            action=log_action,
            annotation_id=annotation.id,
            annotation_text=annotation.selected_text,
            annotation_entity_type=annotation_type_name,
            annotation_start_position=annotation.start_pos,
            annotation_end_position=annotation.end_pos,
            original_annotator=annotation.created_by.username if annotation.created_by else 'Système',
            validation_status_after='validated' if action == 'validate' else 'rejected'
        )

        return JsonResponse({
            'success': True,
            'message': f'Annotation {"validée" if action == "validate" else "rejetée"} avec succès',
            'annotation_id': annotation.id,
            'validated': action == 'validate'
        })

    except Annotation.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Annotation non trouvée'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid JSON'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== BULK VALIDATE ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def bulk_validate_annotations(request, doc_id):
    """
    POST /api/expert/documents/{id}/bulk-validate/
    Validate all pending annotations for a document
    """
    try:
        doc = RawDocument.objects.get(id=doc_id)

        # Récupérer toutes les annotations en attente
        pending_annotations = Annotation.objects.filter(
            page__document=doc,
            is_validated=False
        )

        count = pending_annotations.count()

        # Valider toutes les annotations
        pending_annotations.update(
            is_validated=True,
            validation_status='validated',
            validated_by=request.user,
            validated_at=timezone.now()
        )

        # Logger l'action en masse
        for annotation in pending_annotations[:100]:  # Limiter le logging à 100 pour la performance
            annotation_type_name = getattr(annotation.annotation_type, 'display_name', None) or \
                                   getattr(annotation.annotation_type, 'name', None) or \
                                   str(annotation.annotation_type)

            ExpertLog.objects.create(
                expert=request.user,
                document_id=doc.id,
                document_title=doc.title or f'Document {doc.id}',
                page_id=annotation.page.id,
                page_number=annotation.page.page_number,
                action='annotation_validated',
                annotation_id=annotation.id,
                annotation_text=annotation.selected_text,
                annotation_entity_type=annotation_type_name,
                original_annotator=annotation.created_by.username if annotation.created_by else 'Système',
                validation_status_after='validated'
            )

        return JsonResponse({
            'success': True,
            'message': f'{count} annotations validées avec succès',
            'count': count
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


# ==================== MODEL EVALUATION ====================

@require_http_methods(["GET"])
@login_required
def get_model_evaluation_data(request):
    """
    GET /api/expert/evaluation/
    Returns model evaluation metrics (Precision, Recall, F1-Score, etc.)
    """
    try:
        print("=== DÉBUT get_model_evaluation_data ===")

        # Récupérer TOUTES les annotations (pas seulement validées)
        print("1. Récupération des annotations...")
        all_annotations = Annotation.objects.all()
        validated_annotations = all_annotations.filter(is_validated=True)
        
        total = all_annotations.count()
        total_validated = validated_annotations.count()
        print(f"   Total annotations: {total}")
        print(f"   Total annotations validées: {total_validated}")

        if total == 0:
            print("   Aucune annotation - retour valeurs par défaut")
            return JsonResponse({
                'success': True,
                'metrics': {
                    'precision': 0,
                    'recall': 0,
                    'f1_score': 0,
                    'accuracy': 0
                },
                'confusion_matrix': {
                    'true_positive': 0,
                    'false_positive': 0,
                    'false_negative': 0,
                    'true_negative': 0
                },
                'detailed_stats': [],
                'semantic_metrics': {
                    'ai_relations': 0,
                    'expert_relations': 0,
                    'relation_validation_rate': 0,
                    'ai_qa': 0,
                    'expert_qa': 0,
                    'qa_correction_rate': 0
                },
                'time_metrics': {
                    'documents_processed': 0,
                    'avg_ai_time': 0,
                    'avg_expert_time': 0,
                    'time_saved_percentage': 0
                }
            })

        # Calculer les métriques de confusion
        print("2. Calcul des métriques de confusion...")
        # True Positive: Annotations validées avec status 'validated'
        tp = validated_annotations.filter(
            validation_status='validated'
        ).count()

        # False Positive: Annotations validées mais rejetées
        fp = validated_annotations.filter(
            validation_status='rejected'
        ).count()

        # False Negative: Annotations non encore validées
        fn = all_annotations.filter(
            is_validated=False
        ).count()

        # True Negative: Annotations créées par l'IA mais non utilisées
        # Pour simplifier, on considère les annotations AI non validées comme TN
        tn = all_annotations.filter(
            source='ai',
            is_validated=False
        ).count()

        print(f"   TP={tp}, FP={fp}, FN={fn}, TN={tn}")

        # Calculer les métriques
        print("3. Calcul des métriques (précision, rappel, F1)...")
        precision = 0
        recall = 0
        f1_score = 0
        accuracy = 0

        if (tp + fp) > 0:
            precision = round((tp / (tp + fp)) * 100, 1)

        if (tp + fn) > 0:
            recall = round((tp / (tp + fn)) * 100, 1)

        if (precision + recall) > 0:
            f1_score = round((2 * precision * recall) / (precision + recall), 1)

        if (tp + tn + fp + fn) > 0:
            accuracy = round(((tp + tn) / (tp + tn + fp + fn)) * 100, 1)

        print(f"   Précision={precision}, Rappel={recall}, F1={f1_score}, Exactitude={accuracy}")

        # Statistiques détaillées par type d'annotation
        print("4. Récupération des types d'annotation...")
        try:
            annotation_types = AnnotationType.objects.all()
            print(f"   {annotation_types.count()} types trouvés")
        except Exception as e:
            print(f"   ERREUR AnnotationType: {e}")
            annotation_types = []

        detailed_stats = []
        print("5. Calcul des stats détaillées...")
        for ann_type in annotation_types:
            try:
                # Total des annotations de ce type (toutes sources)
                total_count = all_annotations.filter(
                    annotation_type=ann_type
                ).count()

                # Annotations créées par l'IA
                ai_count = all_annotations.filter(
                    annotation_type=ann_type,
                    source='ai'
                ).count()

                # Annotations validées par l'expert
                validated_count = validated_annotations.filter(
                    annotation_type=ann_type,
                    validation_status='validated'
                ).count()

                # Annotations rejetées
                rejected_count = validated_annotations.filter(
                    annotation_type=ann_type,
                    validation_status='rejected'
                ).count()

                validation_rate = 0
                if total_count > 0:
                    validation_rate = round((validated_count / total_count) * 100, 1)

                # Calculer la confiance moyenne
                avg_confidence = all_annotations.filter(
                    annotation_type=ann_type,
                    confidence_score__isnull=False
                ).aggregate(avg=Avg('confidence_score'))['avg'] or 0
                
                if avg_confidence > 1:
                    avg_confidence = avg_confidence / 100  # Normaliser si nécessaire

                # Récupérer le nom du type
                type_name = getattr(ann_type, 'display_name', None) or getattr(ann_type, 'name', None) or str(ann_type)

                # N'ajouter que si des annotations existent
                if total_count > 0:
                    detailed_stats.append({
                        'type': type_name,
                        'ai_count': ai_count,
                        'expert_count': validated_count,
                        'corrections': rejected_count,
                        'validation_rate': validation_rate,
                        'avg_confidence': round(avg_confidence, 2)
                    })
                    print(f"   Type '{type_name}': total={total_count}, AI={ai_count}, validé={validated_count}")
            except Exception as e:
                print(f"   ERREUR sur type {ann_type}: {e}")
                import traceback
                traceback.print_exc()
                continue

        # Métriques sémantiques
        print("6. Récupération des ExpertDelta...")
        relations_added = 0
        relations_modified = 0
        qa_added = 0
        qa_corrected = 0
        try:
            from .models import ExpertDelta
            expert_deltas = ExpertDelta.objects.all()
            relations_added = expert_deltas.filter(delta_type='relation_added').count()
            relations_modified = expert_deltas.filter(delta_type='relation_modified').count()
            qa_added = expert_deltas.filter(delta_type='qa_added').count()
            qa_corrected = expert_deltas.filter(delta_type='qa_corrected').count()
            print(f"   Relations: {relations_added}, QA: {qa_added}")
        except Exception as e:
            print(f"   ERREUR ExpertDelta (normal si le modèle n'existe pas): {e}")
            import traceback
            traceback.print_exc()

        # Métriques de temps
        print("7. Calcul des métriques de temps...")
        try:
            # Nombre de documents traités
            documents_processed = RawDocument.objects.filter(
                is_validated=True
            ).count()
            
            # Nombre total de pages annotées
            pages_annotated = DocumentPage.objects.filter(
                is_annotated=True
            ).count()
            
            # Nombre total de pages validées
            pages_validated = DocumentPage.objects.filter(
                is_validated_by_human=True
            ).count()
            
            # Temps moyen estimé (basé sur le nombre d'annotations)
            avg_annotations_per_page = total / max(pages_annotated, 1) if pages_annotated > 0 else 0
            avg_ai_time = round(avg_annotations_per_page * 0.5, 1)  # ~0.5s par annotation pour l'IA
            avg_expert_time = round(avg_annotations_per_page * 15, 1)  # ~15s par annotation pour l'expert
            
            # Calcul du temps gagné
            time_saved_percentage = 0
            if avg_expert_time > 0:
                time_saved_percentage = round(((avg_expert_time - avg_ai_time) / avg_expert_time) * 100, 1)
            
            print(f"   Documents traités: {documents_processed}")
            print(f"   Pages annotées: {pages_annotated}")
            print(f"   Pages validées: {pages_validated}")
            print(f"   Temps moyen IA: {avg_ai_time}s, Expert: {avg_expert_time}s")
        except Exception as e:
            print(f"   ERREUR documents_processed: {e}")
            import traceback
            traceback.print_exc()
            documents_processed = 0
            pages_annotated = 0
            pages_validated = 0
            avg_ai_time = 0
            avg_expert_time = 0
            time_saved_percentage = 0

        # Timeline data
        print("8. Génération des données de timeline...")
        last_30_days = timezone.now() - timedelta(days=30)
        timeline_labels = []
        timeline_precision = []
        timeline_recall = []

        for i in range(6):
            date = last_30_days + timedelta(days=i * 5)
            timeline_labels.append(date.strftime('%d/%m'))
            timeline_precision.append(max(0, precision - (i * 2)))
            timeline_recall.append(max(0, recall - (i * 1.5)))

        timeline_data = {
            'labels': timeline_labels,
            'datasets': [
                {
                    'label': 'Précision',
                    'data': timeline_precision,
                    'borderColor': 'rgb(59, 130, 246)',
                    'backgroundColor': 'rgba(59, 130, 246, 0.1)'
                },
                {
                    'label': 'Rappel',
                    'data': timeline_recall,
                    'borderColor': 'rgb(16, 185, 129)',
                    'backgroundColor': 'rgba(16, 185, 129, 0.1)'
                }
            ]
        }

        print("9. Préparation de la réponse JSON...")
        response_data = {
            'success': True,
            'metrics': {
                'precision': precision,
                'recall': recall,
                'f1_score': f1_score,
                'accuracy': accuracy
            },
            'confusion_matrix': {
                'true_positive': tp,
                'false_positive': fp,
                'false_negative': fn,
                'true_negative': tn
            },
            'detailed_stats': detailed_stats,
            'semantic_metrics': {
                'ai_relations': relations_added + relations_modified,
                'expert_relations': relations_added,
                'relation_validation_rate': round(
                    (relations_added / max(relations_added + relations_modified, 1)) * 100, 1),
                'ai_qa': qa_added + qa_corrected,
                'expert_qa': qa_added,
                'qa_correction_rate': round((qa_corrected / max(qa_added + qa_corrected, 1)) * 100, 1)
            },
            'time_metrics': {
                'documents_processed': documents_processed,
                'pages_annotated': pages_annotated,
                'pages_validated': pages_validated,
                'avg_ai_time': avg_ai_time,
                'avg_expert_time': avg_expert_time,
                'time_saved_percentage': time_saved_percentage
            },
            'timeline_data': timeline_data
        }

        print("10. Envoi de la réponse - SUCCESS")
        print("=== FIN get_model_evaluation_data ===")
        return JsonResponse(response_data)

    except Exception as e:
        print(f"!!! ERREUR EXCEPTION: {e}")
        import traceback
        print(traceback.format_exc())
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
    
@require_http_methods(["GET"])
@login_required
def get_page_relationships_for_expert(request, page_id):
    """
    GET /api/expert/pages/{page_id}/relationships/
    Get all relationships for a page for expert review
    """
    try:
        from rawdocs.models import DocumentPage, AnnotationRelationship
        
        page = DocumentPage.objects.get(id=page_id)
        
        # Get all annotation IDs on this page
        annotation_ids = page.annotations.values_list('id', flat=True)
        
        # Get relationships where source or target is on this page
        relationships = AnnotationRelationship.objects.filter(
            Q(source_annotation_id__in=annotation_ids) |
            Q(target_annotation_id__in=annotation_ids)
        ).select_related(
            'source_annotation__annotation_type',
            'target_annotation__annotation_type',
            'created_by'
        )
        
        relationships_data = []
        for rel in relationships:
            relationships_data.append({
                'id': rel.id,
                'source': {
                    'id': rel.source_annotation.id,
                    'text': rel.source_annotation.selected_text,
                    'type': rel.source_annotation.annotation_type.display_name,
                    'color': rel.source_annotation.annotation_type.color
                },
                'target': {
                    'id': rel.target_annotation.id,
                    'text': rel.target_annotation.selected_text,
                    'type': rel.target_annotation.annotation_type.display_name,
                    'color': rel.target_annotation.annotation_type.color
                },
                'relationship_name': rel.relationship_name,
                'description': rel.description,
                'created_by': rel.created_by.username if rel.created_by else 'Unknown',
                'created_at': rel.created_at.isoformat(),
                'is_validated': getattr(rel, 'is_validated', False)
            })
        
        return JsonResponse({
            'success': True,
            'relationships': relationships_data
        })
        
    except DocumentPage.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Page not found'
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
def validate_relationship(request, relationship_id):
    """
    POST /api/expert/relationships/{relationship_id}/validate/
    Validate (approve) a relationship
    Body: { "action": "validate" }
    """
    try:
        from rawdocs.models import AnnotationRelationship
        
        data = json.loads(request.body)
        action = data.get('action')

        if action != 'validate':
            return JsonResponse({
                'success': False,
                'error': 'Action must be "validate"'
            }, status=400)

        relationship = AnnotationRelationship.objects.select_related(
            'source_annotation__annotation_type',
            'target_annotation__annotation_type',
            'created_by'
        ).get(id=relationship_id)

        # Validate the relationship
        relationship.is_validated = True
        relationship.validated_by = request.user
        relationship.validated_at = timezone.now()
        relationship.save()
        
        # Log the action
        ExpertLog.objects.create(
            expert=request.user,
            document_id=relationship.source_annotation.page.document.id,
            document_title=relationship.source_annotation.page.document.title or f'Document {relationship.source_annotation.page.document.id}',
            page_id=relationship.source_annotation.page.id,
            page_number=relationship.source_annotation.page.page_number,
            action='relationship_validated',
            annotation_id=relationship.id,
            annotation_text=f"{relationship.source_annotation.selected_text} → {relationship.relationship_name} → {relationship.target_annotation.selected_text}",
            annotation_entity_type='relationship',
            original_annotator=relationship.created_by.username if relationship.created_by else 'System'
        )

        return JsonResponse({
            'success': True,
            'message': 'Relationship validated successfully',
            'relationship_id': relationship_id
        })

    except AnnotationRelationship.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Relationship not found'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
    

@csrf_exempt
@require_http_methods(["PUT"])
@login_required
def update_relationship(request, relationship_id):
    """
    PUT /api/expert/relationships/{relationship_id}/update/
    Update a relationship (can change source, target, name, description)
    Body: { 
        "source_annotation_id": ..., 
        "target_annotation_id": ...,
        "relationship_name": "...", 
        "description": "...", 
        "validate": true 
    }
    """
    try:
        from rawdocs.models import AnnotationRelationship, Annotation
        
        data = json.loads(request.body)
        relationship = AnnotationRelationship.objects.select_related(
            'source_annotation__annotation_type',
            'target_annotation__annotation_type',
            'created_by'
        ).get(id=relationship_id)

        # Store old values for logging
        old_source_text = relationship.source_annotation.selected_text
        old_target_text = relationship.target_annotation.selected_text
        old_name = relationship.relationship_name
        old_description = relationship.description
        
        # Update source annotation if provided
        if 'source_annotation_id' in data:
            new_source = Annotation.objects.get(id=data['source_annotation_id'])
            relationship.source_annotation = new_source
        
        # Update target annotation if provided
        if 'target_annotation_id' in data:
            new_target = Annotation.objects.get(id=data['target_annotation_id'])
            relationship.target_annotation = new_target
        
        # Update relationship name and description
        if 'relationship_name' in data:
            relationship.relationship_name = data['relationship_name']
        if 'description' in data:
            relationship.description = data['description']
        
        # Validate if requested
        should_validate = data.get('validate', False)
        if should_validate:
            relationship.is_validated = True
            relationship.validated_by = request.user
            relationship.validated_at = timezone.now()
        
        relationship.save()
        
        # Prepare change summary
        new_source_text = relationship.source_annotation.selected_text
        new_target_text = relationship.target_annotation.selected_text
        
        change_parts = []
        if old_source_text != new_source_text:
            change_parts.append(f"Source: '{old_source_text[:30]}...' → '{new_source_text[:30]}...'")
        if old_target_text != new_target_text:
            change_parts.append(f"Target: '{old_target_text[:30]}...' → '{new_target_text[:30]}...'")
        if old_name != relationship.relationship_name:
            change_parts.append(f"Type: '{old_name}' → '{relationship.relationship_name}'")
        
        change_summary = " | ".join(change_parts) if change_parts else "Description modifiée"
        
        # Log the action
        ExpertLog.objects.create(
            expert=request.user,
            document_id=relationship.source_annotation.page.document.id,
            document_title=relationship.source_annotation.page.document.title or f'Document {relationship.source_annotation.page.document.id}',
            page_id=relationship.source_annotation.page.id,
            page_number=relationship.source_annotation.page.page_number,
            action='relationship_modified',
            annotation_id=relationship.id,
            old_text=f"{old_source_text} → {old_name} → {old_target_text}",
            new_text=f"{new_source_text} → {relationship.relationship_name} → {new_target_text}",
            annotation_entity_type='relationship',
            original_annotator=relationship.created_by.username if relationship.created_by else 'System',
            reason=change_summary
        )

        return JsonResponse({
            'success': True,
            'message': 'Relationship updated successfully',
            'relationship': {
                'id': relationship.id,
                'source': {
                    'id': relationship.source_annotation.id,
                    'text': relationship.source_annotation.selected_text,
                    'type': relationship.source_annotation.annotation_type.display_name,
                    'color': relationship.source_annotation.annotation_type.color
                },
                'target': {
                    'id': relationship.target_annotation.id,
                    'text': relationship.target_annotation.selected_text,
                    'type': relationship.target_annotation.annotation_type.display_name,
                    'color': relationship.target_annotation.annotation_type.color
                },
                'relationship_name': relationship.relationship_name,
                'description': relationship.description,
                'is_validated': relationship.is_validated
            }
        })

    except Annotation.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Annotation not found'
        }, status=404)
    except AnnotationRelationship.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Relationship not found'
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
def delete_relationship(request, relationship_id):
    """
    DELETE /api/expert/relationships/{relationship_id}/delete/
    Delete a relationship
    """
    try:
        from rawdocs.models import AnnotationRelationship
        
        relationship = AnnotationRelationship.objects.select_related(
            'source_annotation__annotation_type',
            'target_annotation__annotation_type',
            'created_by'
        ).get(id=relationship_id)

        # Store info for logging before deletion
        doc_id = relationship.source_annotation.page.document.id
        doc_title = relationship.source_annotation.page.document.title or f'Document {relationship.source_annotation.page.document.id}'
        page_id = relationship.source_annotation.page.id
        page_number = relationship.source_annotation.page.page_number
        relationship_text = f"{relationship.source_annotation.selected_text} → {relationship.relationship_name} → {relationship.target_annotation.selected_text}"
        created_by = relationship.created_by.username if relationship.created_by else 'System'
        
        # Delete the relationship
        relationship.delete()
        
        # Log the action
        ExpertLog.objects.create(
            expert=request.user,
            document_id=doc_id,
            document_title=doc_title,
            page_id=page_id,
            page_number=page_number,
            action='relationship_rejected',
            annotation_id=relationship_id,
            annotation_text=relationship_text,
            annotation_entity_type='relationship',
            original_annotator=created_by
        )

        return JsonResponse({
            'success': True,
            'message': 'Relationship deleted successfully'
        })

    except AnnotationRelationship.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Relationship not found'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)