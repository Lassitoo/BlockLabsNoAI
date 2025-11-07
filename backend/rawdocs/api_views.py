# rawdocs/api_views.py
"""
API Views for Next.js Frontend
Provides RESTful endpoints for annotation, metadata learning, and expert dashboards
"""
from django.contrib.auth.models import User
from django.db.models import Sum, Q, Count, Avg
from django.http import JsonResponse, HttpResponse
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from collections import defaultdict
import json
import requests
import os
from datetime import datetime
import zipfile
from io import BytesIO
from bs4 import BeautifulSoup

from rawdocs.models import (
    RawDocument, DocumentPage, Annotation, AnnotationType,
    MetadataFeedback, MetadataLearningMetrics, MetadataLog, CustomField, CustomFieldValue
)
from .utils import extract_exif_metadata  # Import your actual function
from django.db import transaction
from collections import OrderedDict


# ==================== HELPER FUNCTIONS (migrated from views.py) ====================

def generate_structured_html(raw_document, user):
    """Génère et sauvegarde le HTML structuré pour un RawDocument"""
    try:
        from documents.models import Document as DocModel
        from documents.utils.document_processor import DocumentProcessor

        ext = os.path.splitext(raw_document.file.name)[1].lower().lstrip('.')
        allowed = {'pdf', 'docx', 'doc', 'txt', 'html', 'xlsx', 'xls', 'rtf'}
        file_type = ext if ext in allowed else 'pdf'

        doc = DocModel.objects.filter(
            original_file=raw_document.file.name,
            uploaded_by=raw_document.owner or user
        ).first()

        if not doc:
            doc = DocModel(
                title=raw_document.title or os.path.basename(raw_document.file.name),
                original_file=raw_document.file,
                file_type=file_type,
                file_size=getattr(raw_document.file, 'size', 0),
                uploaded_by=raw_document.owner or user,
            )
            doc.save()

        processor = DocumentProcessor(doc)
        processor.process_document()
        structured_html = doc.formatted_content or ''

        # Extraire le CSS généré
        generated_css = ''
        if hasattr(doc, 'format_info') and doc.format_info:
            generated_css = getattr(doc.format_info, 'generated_css', '') or ''

        # SAUVEGARDER dans RawDocument
        raw_document.structured_html = structured_html
        raw_document.structured_html_generated_at = timezone.now()
        raw_document.structured_html_method = 'document_processor'
        raw_document.structured_html_confidence = 0.0
        # Sauvegarder aussi le CSS généré dans un champ personnalisé ou en JSON
        if not hasattr(raw_document, 'structured_html_css'):
            # Créer un champ temporaire pour stocker le CSS
            raw_document._structured_html_css = generated_css
        raw_document.save()

        print(f"✅ HTML structuré généré et sauvé pour le document {raw_document.id}")
        return structured_html, generated_css

    except Exception as e:
        print(f"⚠️ Erreur génération HTML structuré: {e}")
        return "", ""


def validate_document_with_pages(document):
    """Valide un document et extrait ses pages"""
    if not document.pages_extracted:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(document.file.path)
            pages_text = [page.extract_text() or "" for page in reader.pages]

            with transaction.atomic():
                for page_num, page_text in enumerate(pages_text, 1):
                    DocumentPage.objects.create(
                        document=document,
                        page_number=page_num,
                        raw_text=page_text,
                        cleaned_text=page_text
                    )

                document.total_pages = len(pages_text)
                document.pages_extracted = True
                document.is_validated = True
                document.validated_at = timezone.now()
                document.save()

                print(f"✅ Document {document.id} validé avec {document.total_pages} pages")

        except Exception as e:
            print(f"⚠️ Erreur extraction pages: {e}")
            raise e
    else:
        # Juste marquer comme validé si déjà extrait
        document.is_validated = True
        document.validated_at = timezone.now()
        document.save()


def _build_entities_map(annotations_qs, use_display_name=True):
    """
    Construit {entité -> [valeurs_uniques]} à partir d'un QuerySet d'annotations.
    - use_display_name=True : clé = display_name (lisible)
      sinon clé = name (technique)
    """
    entities = OrderedDict()
    seen_per_key = {}

    for ann in annotations_qs:
        key = ann.annotation_type.display_name if use_display_name else ann.annotation_type.name
        val = (ann.selected_text or "").strip()
        if not val:
            continue

        if key not in entities:
            entities[key] = []
            seen_per_key[key] = set()

        if val not in seen_per_key[key]:
            entities[key].append(val)
            seen_per_key[key].add(val)

    return entities


def generate_entities_based_page_summary(entities, page_number, document_title):
    """
    Résumé NL d'une page à partir du dict {entité -> [valeurs]}.
    """
    try:
        if not entities:
            return "Aucune entité annotée sur cette page."

        # Préparer un texte compact pour le prompt/backup
        lines = []
        total_pairs = 0
        for ent, vals in entities.items():
            total_pairs += len(vals)
            preview = "; ".join(vals[:4]) + ("…" if len(vals) > 4 else "")
            lines.append(f"- {ent}: {preview}")

        structured_view = "\n".join(lines)

        prompt = f"""Tu es un expert en analyse documentaire.
Génère un résumé court (3–4 phrases) et fluide basé UNIQUEMENT sur les entités et leurs valeurs.

DOCUMENT: {document_title}
PAGE: {page_number}

ENTITÉS → VALEURS:
{structured_view}

Contraintes:
- Ne liste pas tout; synthétise les thèmes/infos clés.
- Utilise un ton pro et clair.
- Termine par le nombre total de paires entité-valeur entre parenthèses.

Réponds UNIQUEMENT par le paragraphe.
"""

        from rawdocs.regulatory_analyzer import RegulatoryAnalyzer
        analyzer = RegulatoryAnalyzer()
        response = analyzer.call_groq_api(prompt, max_tokens=280)
        return response.strip() if response else f"Page {page_number}: synthèse de {total_pairs} élément(s) annoté(s) sur les entités « {', '.join(list(entities.keys())[:5])}{'…' if len(entities) > 5 else ''} »."
    except Exception as e:
        print(f"❌ Erreur génération résumé (page): {e}")
        # Fallback minimal
        flat_count = sum(len(v) for v in entities.values())
        return f"Page {page_number}: {flat_count} valeur(s) annotée(s) sur {len(entities)} entité(s)."


def generate_entities_based_document_summary(entities, doc_title, doc_type, total_annotations):
    """
    Résumé NL global à partir du dict {entité -> [valeurs]}.
    """
    try:
        if not entities:
            return "Aucune entité annotée dans ce document."

        # Top entités par volume
        ranked = sorted(entities.items(), key=lambda kv: len(kv[1]), reverse=True)
        top_lines = [f"- {k}: {len(v)} valeur(s)" for k, v in ranked[:6]]
        repartition = "\n".join(top_lines)

        prompt = f"""Tu es un expert en analyse documentaire.
Produis un résumé exécutif (4–6 phrases) basé UNIQUEMENT sur les entités et leurs valeurs.

DOCUMENT: {doc_title}
TYPE: {doc_type or '—'}
TOTAL ANNOTATIONS: {total_annotations}

RÉPARTITION (Top entités par nombre de valeurs):
{repartition}

Contraintes:
- Extrais les thèmes majeurs qui se dégagent des entités dominantes.
- Indique la couverture globale (ex.: diversité des entités, répartition).
- Reste factuel, ton professionnel, sans lister toutes les valeurs.

Réponds UNIQUEMENT par le paragraphe.
"""

        from rawdocs.regulatory_analyzer import RegulatoryAnalyzer
        analyzer = RegulatoryAnalyzer()
        response = analyzer.call_groq_api(prompt, max_tokens=360)
        if response:
            return response.strip()

        # Fallback succinct
        top_names = [k for k, _ in ranked[:3]]
        total_values = sum(len(v) for v in entities.values())
        return (f"Le document agrège {total_values} valeur(s) annotée(s) sur {len(entities)} entité(s). "
                f"Principales entités : {', '.join(top_names)}.")
    except Exception as e:
        print(f"❌ Erreur génération résumé (document): {e}")
        total_values = sum(len(v) for v in entities.values())
        return f"Document : {total_values} valeur(s) sur {len(entities)} entité(s)."


# ==================== METADATA UPLOAD & MANAGEMENT ====================

@csrf_exempt
@require_http_methods(["POST"])
@login_required
def upload_metadata(request):
    """Handle PDF upload from Next.js frontend"""
    try:
        pdf_file = request.FILES.get('pdf_file')
        pdf_url = request.POST.get('pdf_url') or request.GET.get('pdf_url')

        if not pdf_file and not pdf_url:
            return JsonResponse({
                'success': False,
                'error': 'No PDF file or URL provided'
            }, status=400)

        # Handle URL download
        if pdf_url and not pdf_file:
            try:
                response = requests.get(pdf_url, timeout=30)
                response.raise_for_status()

                filename = pdf_url.split('/')[-1]
                if not filename.endswith('.pdf'):
                    filename = f"document_{RawDocument.objects.count() + 1}.pdf"

                pdf_file = ContentFile(response.content, name=filename)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Failed to download PDF: {str(e)}'
                }, status=400)

        # Create document
        doc = RawDocument.objects.create(
            file=pdf_file,
            owner=request.user,
            is_validated=False
        )

        print(f"✅ Document created with ID: {doc.id}")

        # Try to extract metadata using the SAME function as Django templates
        metadata = {}
        try:
            if doc.file and doc.file.path:
                print(f"🔍 Using extract_metadonnees function")

                # Import the actual function used in Django templates
                from .utils import extract_metadonnees

                # Use the same extraction as your working Django upload
                extracted = extract_metadonnees(doc.file.path, url="")

                print(f"📦 Extracted metadata: {extracted}")

                if extracted:
                    # Update document fields
                    doc.title = extracted.get('title', '')
                    doc.doc_type = extracted.get('type', '')
                    doc.context = extracted.get('context', '')
                    doc.language = extracted.get('language', '')
                    doc.publication_date = extracted.get('publication_date', '')
                    doc.version = extracted.get('version', '')
                    doc.source = extracted.get('source', '')
                    doc.url_source = extracted.get('url_source', '')
                    doc.country = extracted.get('country', '')

                    # Save the document
                    doc.save()
                    print(f"💾 Document saved")

                    metadata = extracted
                else:
                    print("⚠️ No metadata extracted")

        except Exception as e:
            print(f"❌ Extraction error: {str(e)}")
            import traceback
            traceback.print_exc()

        # Refresh from database
        doc.refresh_from_db()

        # Prepare response with actual saved values
        response_metadata = {
            'title': doc.title or '',
            'type': doc.doc_type or '',
            'context': doc.context or '',
            'language': doc.language or '',
            'publication_date': doc.publication_date or '',
            'version': doc.version or '',
            'source': doc.source or '',
            'url_source': doc.url_source or '',
            'country': doc.country or '',
            'quality': {
                'extraction_rate': 0,
                'field_scores': {}
            }
        }

        print(f"📤 Sending response metadata:")
        print(f"  - Title: {response_metadata['title']}")
        print(f"  - Type: {response_metadata['type']}")
        print(f"  - Context: {response_metadata['context'][:100] if response_metadata['context'] else 'empty'}...")

        # Generate structured HTML with CSS
        structured_html = ''
        structured_html_css = ''
        try:
            structured_html, structured_html_css = generate_structured_html(doc, request.user)
            print(f"✅ Generated structured HTML with CSS")
        except Exception as e:
            print(f"⚠️ Could not generate structured HTML: {e}")

        return JsonResponse({
            'success': True,
            'data': {
                'document': {
                    'id': doc.id,
                    'file_name': doc.file.name.split('/')[-1] if doc.file else '',
                    'created_at': doc.created_at.isoformat(),
                    'is_validated': doc.is_validated
                },
                'metadata': response_metadata,
                'structured_html': structured_html,
                'structured_html_css': structured_html_css
            }
        }, status=201)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
@login_required
def get_document_metadata(request, doc_id):
    """Get metadata for a specific document"""
    try:
        doc = RawDocument.objects.get(id=doc_id)

        # Check if user has access
        if not doc.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Access denied'
            }, status=403)

        metadata = {
            'title': doc.title or '',
            'type': doc.doc_type or '',
            'context': doc.context or '',
            'language': doc.language or '',
            'publication_date': doc.publication_date or '',
            'version': doc.version or '',
            'source': doc.source or '',
            'url_source': doc.url_source or '',
            'country': doc.country or '',
            'quality': {
                'extraction_rate': 0,
                'field_scores': {}
            }
        }

        # Get modification history
        history = []
        for log in MetadataLog.objects.filter(document=doc).order_by('-modified_at')[:10]:
            history.append({
                'field_name': log.field_name,
                'old_value': log.old_value,
                'new_value': log.new_value,
                'modified_at': log.modified_at.isoformat(),
                'modified_by': {
                    'username': log.modified_by.username if log.modified_by else 'System'
                }
            })

        return JsonResponse({
            'success': True,
            'data': {
                'document': {
                    'id': doc.id,
                    'file_name': doc.file.name.split('/')[-1] if doc.file else '',
                    'created_at': doc.created_at.isoformat(),
                    'is_validated': doc.is_validated
                },
                'metadata': metadata,
                'history': history
            }
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document not found'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["PUT", "PATCH", "POST"])
@login_required
def update_document_metadata(request, doc_id):
    """Update metadata + custom fields - SANS TOUCHER structured_html"""
    try:
        data = json.loads(request.body)
        print(f"UPDATE REQUEST for doc {doc_id}")
        print(f"Data received: {data}")

        doc = RawDocument.objects.get(id=doc_id)

        if not doc.is_accessible_by(request.user):
            return JsonResponse({'success': False, 'error': 'Accès refusé'}, status=403)

        # === 1. Métadonnées standards ===
        field_mapping = {
            'title': 'title',
            'type': 'doc_type',
            'context': 'context',
            'language': 'language',
            'publication_date': 'publication_date',
            'version': 'version',
            'source': 'source',
            'url_source': 'url_source',
            'country': 'country',
        }

        changes_made = []

        for frontend_field, model_field in field_mapping.items():
            if frontend_field in data:
                old_value = getattr(doc, model_field, '') or ''
                new_value = data[frontend_field] or ''

                print(f"  {frontend_field}: '{old_value}' → '{new_value}'")

                if str(old_value) != str(new_value):
                    MetadataLog.objects.create(
                        document=doc,
                        field_name=frontend_field,
                        old_value=str(old_value),
                        new_value=str(new_value),
                        modified_by=request.user
                    )
                    changes_made.append(frontend_field)

                setattr(doc, model_field, new_value)

        # === 2. Champs personnalisés (sans toucher structured_html) ===
        custom_saved = 0
        if 'custom_fields' in data:
            print(f"Custom fields reçus : {len(data['custom_fields'])}")
            for item in data['custom_fields']:
                name = item.get('name', '').strip()
                value = item.get('value', '')

                if not name:
                    continue

                field, _ = CustomField.objects.get_or_create(name=name, defaults={'field_type': 'text'})
                obj, created = CustomFieldValue.objects.update_or_create(
                    document=doc,
                    field=field,
                    defaults={'value': value}
                )
                action = "créée" if created else "mise à jour"
                print(f"  Custom '{name}' {action}: '{value}'")
                custom_saved += 1

        # === 3. Sauvegarde SÉCURISÉE ===
        update_fields = [v for k, v in field_mapping.items() if k in data]
        if 'original_ai_metadata' not in [f for f in update_fields] and not doc.original_ai_metadata:
            update_fields.append('original_ai_metadata')

        if update_fields:
            doc.save(update_fields=update_fields)
            print(f"Document #{doc.id} sauvegardé (champs: {update_fields})")

        if custom_saved:
            print(f"{custom_saved} champ(s) personnalisé(s) sauvegardé(s)")

        # === 4. Rafraîchir + Sérialiser ===
        doc.refresh_from_db()

        return JsonResponse({
            'success': True,
            'document': serialize_document(doc),
            'custom_fields': {
                v.field.name: v.value
                for v in CustomFieldValue.objects.filter(document=doc)
            },
            'message': 'Sauvegarde réussie',
            'changes': changes_made
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def validate_document(request, doc_id):
    """Validate a document for annotation"""
    try:
        doc = RawDocument.objects.get(id=doc_id)

        if not doc.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Access denied'
            }, status=403)

        doc.is_validated = True
        doc.validated_at = timezone.now()
        doc.save()

        return JsonResponse({
            'success': True,
            'message': 'Document validated successfully'
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document not found'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def validate_document(request, doc_id):
    """Validate a document for annotation"""
    try:
        doc = RawDocument.objects.get(id=doc_id)

        if not doc.is_accessible_by(request.user):
            return JsonResponse({
                'success': False,
                'error': 'Access denied'
            }, status=403)

        doc.is_validated = True
        doc.validated_at = timezone.now()
        doc.save()

        return JsonResponse({
            'success': True,
            'message': 'Document validated successfully'
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document not found'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== ANNOTATION DASHBOARD ====================

@require_http_methods(["GET"])
@login_required
def get_annotation_dashboard_data(request):
    """Get statistics for annotation dashboard"""
    try:
        documents = RawDocument.objects.filter(is_validated=True)

        total_documents = documents.count()
        total_pages = documents.aggregate(total=Sum('total_pages'))['total'] or 0

        annotated_docs = documents.exclude(
            Q(enriched_annotations_json__isnull=True) | Q(enriched_annotations_json='')
        ).count()

        to_annotate = documents.filter(
            Q(enriched_annotations_json__isnull=True) | Q(enriched_annotations_json='')
        ).count()

        return JsonResponse({
            'success': True,
            'data': {
                'stats': {
                    'total_documents': total_documents,
                    'total_pages': total_pages,
                    'annotated_pages': 0,
                    'to_annotate_count': to_annotate,
                    'in_progress_count': 0,
                    'completed_count': annotated_docs,
                    'avg_annotated_pages_per_doc': 0
                }
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
@login_required
def get_annotation_documents(request):
    """Get list of documents for annotation"""
    try:
        documents = RawDocument.objects.filter(is_validated=True)

        documents_data = []
        for doc in documents:
            file_name = doc.file.name.split('/')[-1] if doc.file else ''
            has_annotations = bool(doc.enriched_annotations_json)

            documents_data.append({
                'id': doc.id,
                'title': doc.title or 'Sans titre',
                'file_name': file_name,
                'total_pages': doc.total_pages or 0,
                'annotated_pages': doc.total_pages if has_annotations else 0,
                'progress_percentage': 100 if has_annotations else 0,
                'status': 'completed' if has_annotations else 'validated',
                'uploaded_by': doc.owner.username if doc.owner else 'Unknown',
                'validated_at': doc.validated_at.isoformat() if doc.validated_at else None,
                'created_at': doc.created_at.isoformat()
            })

        return JsonResponse({
            'success': True,
            'data': {
                'documents': documents_data
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== METADATA LEARNING ====================

@require_http_methods(["GET"])
@login_required
def get_metadata_learning_data(request):
    """Get metadata learning dashboard data"""
    try:
        feedbacks = MetadataFeedback.objects.all().order_by('created_at')

        if not feedbacks.exists():
            return JsonResponse({
                'success': True,
                'no_data': True,
                'stats': {'avg_score': 0, 'total_feedbacks': 0, 'improvement': 0},
                'field_stats': {},
                'document_stats': {}
            })

        avg_score = (feedbacks.aggregate(avg=Avg('feedback_score'))['avg'] or 0) * 100
        total_feedbacks = feedbacks.count()

        first_feedback = feedbacks.first()
        last_feedback = feedbacks.last()
        improvement = 0

        if first_feedback and last_feedback and total_feedbacks > 1:
            first_score = first_feedback.feedback_score * 100
            last_score = last_feedback.feedback_score * 100
            if first_score > 0:
                improvement = ((last_score - first_score) / first_score) * 100

        field_stats = defaultdict(lambda: {'correct': 0, 'wrong': 0, 'missed': 0, 'precision': 0})

        for feedback in feedbacks:
            corrections = feedback.corrections_made
            for item in corrections.get('kept_correct', []):
                field_stats[item['field']]['correct'] += 1
            for item in corrections.get('corrected_fields', []):
                field_stats[item['field']]['wrong'] += 1
            for item in corrections.get('missed_fields', []):
                field_stats[item['field']]['missed'] += 1

        for field, stats in field_stats.items():
            total = stats['correct'] + stats['wrong'] + stats['missed']
            if total > 0:
                stats['precision'] = round((stats['correct'] / total) * 100)

        return JsonResponse({
            'success': True,
            'no_data': False,
            'stats': {
                'avg_score': round(avg_score, 1),
                'total_feedbacks': total_feedbacks,
                'improvement': round(improvement, 1)
            },
            'field_stats': dict(field_stats),
            'document_stats': {}
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== EXPERT DASHBOARD ====================

@require_http_methods(["GET"])
@login_required
def get_expert_dashboard_data(request):
    """Get expert dashboard statistics"""
    try:
        ready_for_review = RawDocument.objects.filter(
            is_ready_for_expert=True,
            is_expert_validated=False
        )

        expert_validated = RawDocument.objects.filter(is_expert_validated=True)
        total = RawDocument.objects.count()

        stats = {
            'pending_review': ready_for_review.count(),
            'validated': expert_validated.count(),
            'total_documents': total,
            'validated_percentage': round((expert_validated.count() / total * 100) if total > 0 else 0)
        }

        return JsonResponse({
            'success': True,
            'data': {'stats': stats}
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
@login_required
def get_expert_documents(request):
    """Get documents for expert review"""
    try:
        page_number = request.GET.get('page', 1)
        page_size = request.GET.get('page_size', 10)

        documents = RawDocument.objects.filter(
            is_ready_for_expert=True
        ).select_related('owner').order_by('-expert_ready_at')

        # Pagination
        from django.core.paginator import Paginator
        paginator = Paginator(documents, page_size)
        page_obj = paginator.get_page(page_number)

        documents_data = []
        for doc in page_obj:
            total_pages = doc.pages.count()
            validated_pages = doc.pages.filter(is_validated_by_human=True).count()
            annotation_count = Annotation.objects.filter(page__document=doc).count()
            pending_annotations = Annotation.objects.filter(
                page__document=doc,
                is_validated=False
            ).count()

            # Get the annotator (user who validated pages)
            annotator_username = 'Non défini'
            validated_page = doc.pages.filter(is_validated_by_human=True).first()
            if validated_page and validated_page.validated_by:
                annotator_username = validated_page.validated_by.username
            elif doc.owner:
                annotator_username = doc.owner.username

            documents_data.append({
                'id': doc.id,
                'title': doc.title or 'Sans titre',
                'file': {
                    'name': doc.file.name if doc.file else f'document_{doc.id}.pdf'
                },
                'expert_ready_at': doc.expert_ready_at.isoformat() if doc.expert_ready_at else None,
                'total_pages': total_pages,
                'validated_pages': validated_pages,
                'annotation_count': annotation_count,
                'pending_annotations': pending_annotations,
                'annotator': {
                    'username': annotator_username
                },
                'is_validated': doc.is_expert_validated,
                'validated_at': doc.expert_validated_at.isoformat() if doc.expert_validated_at else None
            })

        return JsonResponse({
            'success': True,
            'documents': documents_data,
            'pagination': {
                'current': page_obj.number,
                'total': paginator.num_pages,
                'hasNext': page_obj.has_next(),
                'hasPrevious': page_obj.has_previous()
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ==================== DOCUMENT ANNOTATION ====================

@require_http_methods(["GET"])
@login_required
def get_document_for_annotation(request, doc_id):
    """Get document with text for annotation"""
    try:
        doc = RawDocument.objects.get(id=doc_id, is_validated=True)

        # Get all pages for the document
        pages_data = []
        pages = doc.pages.all().order_by('page_number')

        for page in pages:
            # Get annotations for this page
            annotations = page.annotations.all().select_related('annotation_type').order_by('start_pos')
            page_annotations = []

            for ann in annotations:
                page_annotations.append({
                    'id': ann.id,
                    'text': ann.selected_text,
                    'type': ann.annotation_type.name,
                    'type_display': ann.annotation_type.display_name,
                    'color': ann.annotation_type.color,
                    'startPos': ann.start_pos,
                    'endPos': ann.end_pos,
                    'confidence': ann.confidence_score,
                    'reasoning': ann.ai_reasoning or '',
                    'is_validated': getattr(ann, 'is_validated', False),
                    'mode': getattr(ann, 'mode', 'raw'),
                    'created_by': ann.created_by.username if ann.created_by else 'Unknown'
                })

            pages_data.append({
                'id': page.id,
                'page_number': page.page_number,
                'text_content': page.cleaned_text or page.raw_text or '',
                'annotations': page_annotations,
                'is_annotated': page.is_annotated,
                'is_validated_by_human': page.is_validated_by_human,
                'annotated_at': page.annotated_at.isoformat() if page.annotated_at else None,
                'validated_by': page.validated_by.username if page.validated_by else None
            })

        return JsonResponse({
            'success': True,
            'document': {
                'id': doc.id,
                'title': doc.title or 'Untitled',
                'file_name': doc.file.name.split('/')[-1] if doc.file else '',
                'status': 'validated' if doc.is_validated else 'pending',
                'uploaded_by': doc.owner.username if doc.owner else 'Unknown',
                'created_at': doc.created_at.isoformat(),
                'total_pages': len(pages_data),
                'annotated_pages': doc.pages.filter(is_annotated=True).count(),
                'progress_percentage': round((doc.pages.filter(is_annotated=True).count() / len(pages_data)) * 100,
                                             1) if len(pages_data) > 0 else 0,
                'validated_at': doc.validated_at.isoformat() if doc.validated_at else None,
                'metadata': {
                    'title': doc.title,
                    'type': doc.doc_type,
                    'publication_date': doc.publication_date,
                    'version': doc.version,
                    'source': doc.source,
                    'country': doc.country,
                    'language': doc.language,
                    'url_source': doc.url_source,
                    'context': doc.context,
                },
                'pages': pages_data
            }
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Document not found'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_annotation_page_details(request, doc_id, page_number):
    """Get detailed information for a specific page in annotation context"""
    try:
        doc = RawDocument.objects.get(id=doc_id, is_validated=True)
        page = get_object_or_404(DocumentPage, document=doc, page_number=page_number)

        # Get annotation types
        used_type_ids = Annotation.objects.filter(page=page).values_list('annotation_type_id', flat=True).distinct()
        whitelist = {
            AnnotationType.REQUIRED_DOCUMENT,
            AnnotationType.AUTHORITY,
            AnnotationType.LEGAL_REFERENCE,
            AnnotationType.DELAY,
            AnnotationType.PROCEDURE_TYPE,
            AnnotationType.VARIATION_CODE,
            AnnotationType.REQUIRED_CONDITION,
            AnnotationType.FILE_TYPE,
        }
        base_qs = AnnotationType.objects.filter(name__in=list(whitelist))
        used_qs = AnnotationType.objects.filter(id__in=used_type_ids)
        annotation_types = (base_qs | used_qs).distinct().order_by('display_name')

        # Get annotations
        annotations = page.annotations.all().select_related('annotation_type').order_by('start_pos')
        annotations_data = []

        for ann in annotations:
            annotations_data.append({
                'id': ann.id,
                'start_pos': ann.start_pos,
                'end_pos': ann.end_pos,
                'selected_text': ann.selected_text,
                'type': ann.annotation_type.name,
                'type_display': ann.annotation_type.display_name,
                'color': ann.annotation_type.color,
                'confidence': ann.confidence_score,
                'reasoning': ann.ai_reasoning or '',
                'is_validated': getattr(ann, 'is_validated', False),
                'mode': getattr(ann, 'mode', 'raw'),
                'start_xpath': getattr(ann, 'start_xpath', None),
                'end_xpath': getattr(ann, 'end_xpath', None),
                'created_by': ann.created_by.username if ann.created_by else 'Unknown'
            })

        return JsonResponse({
            'success': True,
            'page': {
                'id': page.id,
                'page_number': page.page_number,
                'text_content': page.cleaned_text or page.raw_text or '',
                'is_annotated': page.is_annotated,
                'is_validated_by_human': page.is_validated_by_human,
                'annotated_at': page.annotated_at.isoformat() if page.annotated_at else None,
                'validated_by': page.validated_by.username if page.validated_by else None
            },
            'annotations': annotations_data,
            'annotation_types': [{
                'id': atype.id,
                'name': atype.name,
                'display_name': atype.display_name,
                'color': atype.color
            } for atype in annotation_types]
        })

    except DocumentPage.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Page not found'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required
@require_http_methods(["GET"])
def get_document_details(request, doc_id):
    """Get detailed information about a specific document"""
    try:
        doc = RawDocument.objects.get(id=doc_id)

        pages = []
        for page in doc.pages.all().order_by('page_number'):
            annotations = page.annotations.all()
            pages.append({
                'id': page.id,
                'page_number': page.page_number,
                'image_url': None,  # Add if you have page images
                'text_content': page.raw_text or page.cleaned_text or '',
                'annotations_count': annotations.count(),
                'annotations': [{
                    'id': ann.id,
                    'selected_text': ann.selected_text,
                    'annotation_type': {
                        'id': ann.annotation_type.id,
                        'name': ann.annotation_type.name,
                        'display_name': ann.annotation_type.display_name,
                        'color': ann.annotation_type.color
                    },
                    'confidence_score': ann.confidence_score,
                    'start_pos': ann.start_pos,
                    'end_pos': ann.end_pos
                } for ann in annotations]
            })

        return JsonResponse({
            'success': True,
            'data': {
                'document': {
                    'id': doc.id,
                    'title': doc.title or 'Untitled',
                    'file_name': doc.file.name.split('/')[-1] if doc.file else '',
                    'total_pages': len(pages),
                    'pages': pages
                }
            }
        })

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document not found'
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
def add_annotation(request):
    """Add annotation to document page"""
    try:
        data = json.loads(request.body)
        page_id = data.get('page_id')
        selected_text = data.get('selected_text')
        annotation_type_id = data.get('annotation_type_id')
        start_pos = data.get('start_pos', 0)
        end_pos = data.get('end_pos', 0)
        mode = data.get('mode', 'raw')

        page = get_object_or_404(DocumentPage, id=page_id)
        annotation_type = get_object_or_404(AnnotationType, id=annotation_type_id)

        # Create annotation
        annotation = Annotation.objects.create(
            page=page,
            annotation_type=annotation_type,
            start_pos=start_pos,
            end_pos=end_pos,
            selected_text=selected_text,
            confidence_score=100.0,
            created_by=request.user,
            source='manual',
            mode=mode,
            start_xpath=data.get('start_xpath'),
            end_xpath=data.get('end_xpath'),
            start_offset=data.get('start_offset'),
            end_offset=data.get('end_offset')
        )

        # Update page status
        page.is_annotated = True
        page.annotated_at = timezone.now()
        page.annotated_by = request.user
        page.save(update_fields=['is_annotated', 'annotated_at', 'annotated_by'])

        return JsonResponse({
            'success': True,
            'annotation': {
                'id': annotation.id,
                'text': annotation.selected_text,
                'type': annotation.annotation_type.name,
                'type_display': annotation.annotation_type.display_name,
                'color': annotation.annotation_type.color,
                'startPos': annotation.start_pos,
                'endPos': annotation.end_pos,
                'confidence': annotation.confidence_score,
                'mode': annotation.mode,
                'created_by': annotation.created_by.username
            },
            'message': 'Annotation added successfully'
        })

    except (DocumentPage.DoesNotExist, AnnotationType.DoesNotExist):
        return JsonResponse({'success': False, 'error': 'Page or annotation type not found'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def update_annotation(request, annotation_id):
    """Update an existing annotation"""
    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Check permissions
        if annotation.created_by != request.user and not request.user.groups.filter(name="Expert").exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)

        data = json.loads(request.body)

        # Update fields
        if 'selected_text' in data:
            annotation.selected_text = data['selected_text']
        if 'annotation_type_id' in data:
            annotation.annotation_type = get_object_or_404(AnnotationType, id=data['annotation_type_id'])
        if 'start_pos' in data:
            annotation.start_pos = data['start_pos']
        if 'end_pos' in data:
            annotation.end_pos = data['end_pos']

        annotation.save()

        return JsonResponse({
            'success': True,
            'annotation': {
                'id': annotation.id,
                'text': annotation.selected_text,
                'type': annotation.annotation_type.name,
                'type_display': annotation.annotation_type.display_name,
                'color': annotation.annotation_type.color,
                'startPos': annotation.start_pos,
                'endPos': annotation.end_pos
            },
            'message': 'Annotation updated successfully'
        })

    except Annotation.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Annotation not found'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def delete_annotation_api(request, annotation_id):
    """Delete an annotation"""
    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Check permissions
        if annotation.created_by != request.user and not request.user.groups.filter(name="Expert").exists():
            return JsonResponse({'error': 'Permission denied'}, status=403)

        page = annotation.page
        annotation_text = annotation.selected_text[:50]

        # Delete annotation
        annotation.delete()

        # Check if page still has annotations
        remaining_annotations = page.annotations.count()
        if remaining_annotations == 0:
            page.is_annotated = False
            page.save()

        return JsonResponse({
            'success': True,
            'message': 'Annotation deleted successfully',
            'remaining_annotations': remaining_annotations
        })

    except Annotation.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Annotation not found'}, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def validate_page_annotations_api(request, page_id):
    """Validate page annotations with RLHF learning"""
    try:
        page = get_object_or_404(DocumentPage, id=page_id)

        # Get AI annotations from session or reconstruct from DB
        ai_session_key = f'ai_annotations_{page_id}'
        ai_session_data = request.session.get(ai_session_key, [])

        if not ai_session_data:
            ai_session_data = []
            for ann in page.annotations.filter(ai_reasoning__icontains='GROQ'):
                ai_session_data.append({
                    'text': ann.selected_text,
                    'type': ann.annotation_type.name,
                    'start_pos': ann.start_pos,
                    'end_pos': ann.end_pos,
                    'confidence': ann.confidence_score / 100.0
                })

        # Get current annotations (after human edits)
        current_annotations = []
        for annotation in page.annotations.all():
            current_annotations.append({
                'text': annotation.selected_text,
                'type': annotation.annotation_type.name,
                'start_pos': annotation.start_pos,
                'end_pos': annotation.end_pos,
                'confidence': annotation.confidence_score / 100.0
            })

        # Process feedback with RLHF
        from .rlhf_learning import RLHFGroqAnnotator
        rlhf_annotator = RLHFGroqAnnotator()
        feedback_result = rlhf_annotator.process_human_feedback(
            page_id=page_id,
            ai_annotations=ai_session_data,
            human_annotations=current_annotations,
            annotator_id=request.user.id
        )

        # Update page status
        page.is_validated_by_human = True
        page.human_validated_at = timezone.now()
        page.validated_by = request.user
        page.save()
        # Clear session
        if ai_session_key in request.session:
            del request.session[ai_session_key]

        # If at least one page of the document is validated by human, make it ready for expert review
        doc = page.document
        try:
            validated = doc.pages.filter(is_validated_by_human=True).count()
            # Mark as ready for expert if at least one page is validated and not already marked
            if validated >= 1 and not doc.is_ready_for_expert:
                doc.is_ready_for_expert = True
                doc.expert_ready_at = timezone.now()
                doc.save(update_fields=['is_ready_for_expert', 'expert_ready_at'])
        except Exception:
            pass

        # Format score with enhanced details
        score_pct = int(feedback_result["feedback_score"] * 100)
        quality_label = "Excellente" if score_pct >= 85 else "Bonne" if score_pct >= 70 else "Moyenne" if score_pct >= 50 else "À améliorer"

        # Get details from feedback result if available
        precision = feedback_result.get("precision", 0)
        recall = feedback_result.get("recall", 0)

        # Build detailed message
        detailed_message = f'Page validée! Score: {score_pct}% ({quality_label}) - IA améliorée!'

        # If we have precision and recall info, include it
        if precision and recall:
            detailed_message = f'Page validée! Score: {score_pct}% ({quality_label}) - Précision: {int(precision * 100)}%, Rappel: {int(recall * 100)}% - IA améliorée!'

        return JsonResponse({
            'success': True,
            'message': detailed_message,
            'feedback_score': feedback_result['feedback_score'],
            'quality_label': quality_label,
            'precision': precision,
            'recall': recall,
            'corrections_summary': feedback_result['corrections_summary'],
            'ai_improved': True
        })

    except Exception as e:
        print(f"Validation error: {e}")
        return JsonResponse({
            'error': f'Erreur lors de la validation: {str(e)}'
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def ai_annotate_page_api(request, page_id):
    """AI annotation with GROQ for a single page"""
    try:
        # Check permissions - allow all authenticated users
        user_role = getattr(request.user, 'role', None)
        print(f"🔍 AI Annotate - User: {request.user.username}, Role: {user_role}")

        # Allow all authenticated users (document_manager, expert, admin, annotateur)
        # No permission check needed - @login_required handles authentication

        page = get_object_or_404(DocumentPage, id=page_id)

        # Parse body for optional parameters
        try:
            data = json.loads(request.body.decode('utf-8')) if request.body else {}
        except Exception:
            data = {}

        requested_mode = data.get('mode', 'raw')
        if requested_mode not in ['raw', 'structured']:
            requested_mode = 'raw'

        # Remove previous AI annotations on this page
        page.annotations.filter(ai_reasoning__icontains='GROQ').delete()

        from .groq_annotation_system import GroqAnnotator
        groq_annotator = GroqAnnotator()
        page_data = {
            'page_num': page.page_number,
            'text': page.cleaned_text or "",
            'char_count': len(page.cleaned_text or "")
        }

        annotations, schema = groq_annotator.annotate_page_with_groq(page_data)

        # Persist session copy for RLHF feedback
        try:
            request.session[f'ai_annotations_{page_id}'] = annotations
        except Exception:
            pass

        saved_count = 0
        for ann_data in annotations:
            try:
                ann_type_name = ann_data.get('type', 'unknown').strip()
                ann_type, _ = AnnotationType.objects.get_or_create(
                    name=ann_type_name,
                    defaults={
                        'display_name': ann_type_name.replace('_', ' ').title(),
                        'color': '#3b82f6',
                        'description': f"GROQ detected {ann_type_name}"
                    }
                )

                # Sanitize fields
                sel_text = (ann_data.get('text', '') or '')
                if len(sel_text) > 500:
                    sel_text = sel_text[:500]

                start = ann_data.get('start_pos', 0) or 0
                end = ann_data.get('end_pos', 0) or 0
                try:
                    start = int(start)
                    end = int(end)
                except Exception:
                    start, end = 0, 0
                if start < 0:
                    start = 0
                if end < start:
                    end = start

                conf = ann_data.get('confidence', 0.8)
                try:
                    conf = float(conf)
                except Exception:
                    conf = 0.8
                confidence_score = conf * 100 if conf <= 1.5 else conf

                Annotation.objects.create(
                    page=page,
                    annotation_type=ann_type,
                    start_pos=start,
                    end_pos=end,
                    selected_text=sel_text,
                    confidence_score=confidence_score,
                    ai_reasoning=ann_data.get('reasoning', 'GROQ classification'),
                    created_by=request.user,
                    source='ai',
                    mode=requested_mode
                )
                saved_count += 1
            except Exception as e:
                print(f"Error saving annotation on page {page.id}: {e}")
                continue

        if saved_count > 0:
            page.is_annotated = True
            page.annotated_at = timezone.now()
            page.annotated_by = request.user
            page.save(update_fields=['is_annotated', 'annotated_at', 'annotated_by'])

        return JsonResponse({
            'success': True,
            'annotations_created': saved_count,
            'message': f'{saved_count} annotations créées avec GROQ!',
            'learning_enhanced': True,
            'mode': requested_mode
        })

    except Exception as e:
        print(f"GROQ annotation error (page {page_id}): {e}")
        return JsonResponse({'error': f'Erreur GROQ: {str(e)}'}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def ai_annotate_document_api(request, doc_id):
    """AI annotation for a complete document"""
    try:
        # Check permissions - allow all authenticated users
        user_role = getattr(request.user, 'role', None)
        print(f"🔍 AI Annotate Document - User: {request.user.username}, Role: {user_role}")

        # Allow all authenticated users (document_manager, expert, admin, annotateur)
        # No permission check needed - @login_required handles authentication

        document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)

        # Parse optional params
        try:
            data = json.loads(request.body.decode('utf-8')) if request.body else {}
        except Exception:
            data = {}

        requested_mode = data.get('mode', 'raw')
        if requested_mode not in ['raw', 'structured']:
            requested_mode = 'raw'

        from .groq_annotation_system import GroqAnnotator
        groq_annotator = GroqAnnotator()
        pages = document.pages.all().order_by('page_number')
        total_annotations = 0
        pages_annotated = 0

        for page in pages:
            try:
                # Remove previous AI annotations for the page
                page.annotations.filter(ai_reasoning__icontains='GROQ').delete()

                page_data = {
                    'page_num': page.page_number,
                    'text': page.cleaned_text or "",
                    'char_count': len(page.cleaned_text or "")
                }

                annotations, schema = groq_annotator.annotate_page_with_groq(page_data)

                # Optionally store per-page session info
                try:
                    request.session[f'ai_annotations_{page.id}'] = annotations
                except Exception:
                    pass

                saved_count = 0
                for ann_data in annotations:
                    try:
                        ann_type_name = ann_data.get('type', 'unknown').strip()
                        ann_type, _ = AnnotationType.objects.get_or_create(
                            name=ann_type_name,
                            defaults={
                                'display_name': ann_type_name.replace('_', ' ').title(),
                                'color': '#3b82f6',
                                'description': f"GROQ detected {ann_type_name}"
                            }
                        )

                        # Sanitize fields
                        sel_text = (ann_data.get('text', '') or '')
                        if len(sel_text) > 500:
                            sel_text = sel_text[:500]

                        start = ann_data.get('start_pos', 0) or 0
                        end = ann_data.get('end_pos', 0) or 0
                        try:
                            start = int(start)
                            end = int(end)
                        except Exception:
                            start, end = 0, 0
                        if start < 0:
                            start = 0
                        if end < start:
                            end = start

                        conf = ann_data.get('confidence', 0.8)
                        try:
                            conf = float(conf)
                        except Exception:
                            conf = 0.8
                        confidence_score = conf * 100 if conf <= 1.5 else conf

                        Annotation.objects.create(
                            page=page,
                            annotation_type=ann_type,
                            start_pos=start,
                            end_pos=end,
                            selected_text=sel_text,
                            confidence_score=confidence_score,
                            ai_reasoning=ann_data.get('reasoning', 'GROQ bulk annotation'),
                            created_by=request.user,
                            source='ai',
                            mode=requested_mode
                        )
                        saved_count += 1
                    except Exception as e:
                        print(f"❌ Erreur sauvegarde annotation page {page.page_number}: {e}")
                        continue

                total_annotations += saved_count
                if saved_count > 0:
                    pages_annotated += 1
                    page.is_annotated = True
                    page.annotated_at = timezone.now()
                    page.annotated_by = request.user
                    page.save(update_fields=['is_annotated', 'annotated_at', 'annotated_by'])

                # Small delay to avoid API rate limits
                import time
                time.sleep(2)

            except Exception as e:
                print(f"❌ Erreur lors de l'annotation de la page {page.page_number}: {e}")
                continue

        return JsonResponse({
            'success': True,
            'message': f'Document annoté avec succès! {pages_annotated} pages, {total_annotations} annotations.',
            'pages_annotated': pages_annotated,
            'total_annotations': total_annotations,
            'total_pages': document.total_pages,
            'mode': requested_mode
        })

    except Exception as e:
        print(f"❌ Erreur annotation document {doc_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de l\'annotation: {str(e)}'}, status=500)


@require_http_methods(["GET"])
@login_required
def get_annotation_types(request):
    """Get all available annotation types"""
    try:
        annotation_types = AnnotationType.objects.all().order_by('display_name')

        types_data = [{
            'id': atype.id,
            'name': atype.name,
            'display_name': atype.display_name,
            'color': atype.color,
            'description': atype.description or ''
        } for atype in annotation_types]

        return JsonResponse({
            'success': True,
            'annotation_types': types_data
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def create_annotation_type_api(request):
    """Create a new annotation type"""
    try:
        data = json.loads(request.body)
        name = data.get('name', '').strip().lower().replace(' ', '_')
        display_name = data.get('display_name', '').strip()
        color = data.get('color', '#6366f1')
        description = data.get('description', '')

        if not name or not display_name:
            return JsonResponse({'error': 'Name and display name are required'}, status=400)

        # Check if already exists
        if AnnotationType.objects.filter(name=name).exists():
            return JsonResponse({'error': f'Annotation type "{display_name}" already exists'}, status=400)

        # Create new annotation type
        annotation_type = AnnotationType.objects.create(
            name=name,
            display_name=display_name,
            color=color,
            description=description or f'Custom annotation type created by {request.user.username}'
        )

        return JsonResponse({
            'success': True,
            'annotation_type': {
                'id': annotation_type.id,
                'name': annotation_type.name,
                'display_name': annotation_type.display_name,
                'color': annotation_type.color,
                'description': annotation_type.description
            },
            'message': f'Annotation type "{display_name}" created successfully!'
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def get_document_annotation_summary(request, doc_id):
    """Get annotation summary for a document"""
    try:
        document = get_object_or_404(RawDocument, id=doc_id)
        pages = document.pages.all().order_by('page_number')

        summary_data = {
            'document': {
                'id': document.id,
                'title': document.title or 'Untitled',
                'total_pages': pages.count()
            },
            'pages_summary': [],
            'total_annotations': 0,
            'annotated_pages': 0,
            'validated_pages': 0,
            'annotation_types_count': {}
        }

        for page in pages:
            annotations = page.annotations.all()
            annotation_types = {}

            for ann in annotations:
                type_name = ann.annotation_type.display_name
                annotation_types[type_name] = annotation_types.get(type_name, 0) + 1
                summary_data['annotation_types_count'][type_name] = summary_data['annotation_types_count'].get(
                    type_name, 0) + 1

            page_summary = {
                'page_number': page.page_number,
                'total_annotations': annotations.count(),
                'is_annotated': page.is_annotated,
                'is_validated_by_human': page.is_validated_by_human,
                'annotation_types': annotation_types
            }

            summary_data['pages_summary'].append(page_summary)
            summary_data['total_annotations'] += annotations.count()

            if page.is_annotated:
                summary_data['annotated_pages'] += 1
            if page.is_validated_by_human:
                summary_data['validated_pages'] += 1

        return JsonResponse({
            'success': True,
            'summary': summary_data
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def submit_document_for_expert_review_api(request, doc_id):
    """Submit entire document for expert review"""
    try:
        document = get_object_or_404(RawDocument, id=doc_id)

        # Check if all pages are validated
        total_pages = document.pages.count()
        validated_pages = document.pages.filter(is_validated_by_human=True).count()

        if validated_pages < total_pages:
            return JsonResponse({
                'success': False,
                'error': f'Cannot submit for review: {validated_pages}/{total_pages} pages validated'
            }, status=400)

        document.is_ready_for_expert = True
        document.expert_ready_at = timezone.now()
        document.save()

        return JsonResponse({
            'success': True,
            'message': 'Document soumis pour révision expert!',
            'document': {
                'id': document.id,
                'title': document.title,
                'total_pages': total_pages,
                'validated_pages': validated_pages
            }
        })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# api_views.py
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def get_csrf(request):
    """Simple CSRF endpoint for frontend"""
    print(f"🔐 CSRF endpoint called - Method: {request.method}")
    print(f"🔐 User authenticated: {request.user.is_authenticated if hasattr(request, 'user') else 'No user'}")
    return JsonResponse({"detail": "CSRF cookie set"})


# ==================== NOUVEAU: UPLOAD SYSTEM ====================


def serialize_document(document):
    """Serialize RawDocument to JSON-friendly format"""
    # Extract CSS from structured_html_css field or generate it
    structured_html_css = ''
    try:
        if hasattr(document, '_structured_html_css'):
            structured_html_css = document._structured_html_css
        elif document.structured_html:
            # Try to extract CSS from Document model if exists
            from documents.models import Document as DocModel
            doc = DocModel.objects.filter(
                original_file=document.file.name,
                uploaded_by=document.owner
            ).first()
            if doc and hasattr(doc, 'format_info') and doc.format_info:
                structured_html_css = getattr(doc.format_info, 'generated_css', '') or ''
    except Exception as e:
        print(f"⚠️ Could not extract CSS: {e}")
    
    return {
        'id': str(document.id),
        'file_name': os.path.basename(document.file.name) if document.file else '',
        'url': document.url or '',
        'owner': document.owner.username if document.owner else '',
        'created_at': document.created_at.isoformat() if document.created_at else '',
        'is_validated': document.is_validated,
        'structured_html': document.structured_html or '',
        'structured_html_css': structured_html_css,
        'metadata': {
            'title': document.title or '',
            'type': document.doc_type or '',
            'publication_date': document.publication_date or '',
            'version': document.version or '',
            'source': document.source or '',
            'context': document.context or '',
            'country': document.country or '',
            'language': document.language or '',
            'url_source': document.url_source or (document.url or ''),
        },
        'quality': document.original_ai_metadata.get('quality', {}) if document.original_ai_metadata else {}
    }


@csrf_exempt
@require_http_methods(["POST", "PUT", "PATCH", "OPTIONS"])
def api_upload_document(request):
    """API endpoint for document upload - Supports PDF and ZIP files"""

    # Handle CORS preflight
    if request.method == "OPTIONS":
        response = JsonResponse({'status': 'ok'})
        response["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type, X-CSRFToken"
        response["Access-Control-Allow-Credentials"] = "true"
        return response

    # Check authentication
    if not request.user.is_authenticated:
        return JsonResponse({
            'success': False,
            'error': 'Authentication required'
        }, status=401)

    try:
        # Check if this is a metadata edit request
        edit_metadata = request.POST.get('edit_metadata') == '1'
        doc_id = request.POST.get('doc_id')

        if edit_metadata and doc_id:
            # Handle metadata editing - pass the doc_id as parameter
            try:
                doc = RawDocument.objects.get(id=doc_id)

                # Check if user has access
                if not doc.is_accessible_by(request.user):
                    return JsonResponse({
                        'success': False,
                        'error': 'Access denied'
                    }, status=403)

                # Store original AI metadata if first time editing
                if not doc.original_ai_metadata:
                    doc.original_ai_metadata = {
                        'title': doc.title,
                        'type': doc.doc_type,
                        'context': doc.context,
                        'language': doc.language,
                        'publication_date': doc.publication_date,
                        'version': doc.version,
                        'source': doc.source,
                        'url_source': doc.url_source,
                        'country': doc.country,
                    }

                # Update fields and log changes
                field_mapping = {
                    'title': 'title',
                    'type': 'doc_type',
                    'context': 'context',
                    'language': 'language',
                    'publication_date': 'publication_date',
                    'version': 'version',
                    'source': 'source',
                    'url_source': 'url_source',
                    'country': 'country',
                }

                # Parse JSON data safely
                try:
                    if request.content_type == 'application/json':
                        data = json.loads(request.body)
                    else:
                        # Handle form data
                        data = {}
                        for frontend_field, model_field in field_mapping.items():
                            if frontend_field in request.POST:
                                data[frontend_field] = request.POST.get(frontend_field)
                except json.JSONDecodeError:
                    return JsonResponse({
                        'success': False,
                        'error': 'Invalid JSON data'
                    }, status=400)

                for frontend_field, model_field in field_mapping.items():
                    if frontend_field in data:
                        old_value = getattr(doc, model_field)
                        new_value = data[frontend_field]

                        if old_value != new_value:
                            # Log the change
                            MetadataLog.objects.create(
                                document=doc,
                                field_name=frontend_field,
                                old_value=old_value or '',
                                new_value=new_value or '',
                                modified_by=request.user
                            )

                        setattr(doc, model_field, new_value)

                doc.save()

                return JsonResponse({
                    'success': True,
                    'message': 'Metadata updated successfully'
                })

            except RawDocument.DoesNotExist:
                return JsonResponse({
                    'success': False,
                    'error': 'Document not found'
                }, status=404)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return JsonResponse({
                    'success': False,
                    'error': str(e)
                }, status=500)

        # Get form data for upload
        pdf_url = request.POST.get('pdf_url', '').strip()
        pdf_file = request.FILES.get('pdf_file')
        validate = request.POST.get('validate') == '1'

        print(f"📥 Upload request - URL: {pdf_url}, File: {pdf_file.name if pdf_file else None}")

        if not pdf_url and not pdf_file:
            return JsonResponse({
                'success': False,
                'error': 'Aucun fichier ou URL fourni'
            }, status=400)

        processed_docs = []
        is_zip_upload = False

        # Handle URL upload
        if pdf_url:
            try:
                resp = requests.get(pdf_url, timeout=30)
                resp.raise_for_status()

                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                fn = os.path.basename(pdf_url) or 'document.pdf'

                rd = RawDocument(url=pdf_url, owner=request.user)
                rd.file.save(os.path.join(ts, fn), ContentFile(resp.content))
                rd.save()

                # Extract metadata using your existing function
                from .utils import extract_metadonnees
                metadata = extract_metadonnees(rd.file.path, rd.url or "")

                # Generate structured HTML using your existing function
                structured_html, _ = generate_structured_html(rd, request.user)

                # Save metadata
                if metadata and isinstance(metadata, dict):
                    rd.original_ai_metadata = metadata
                    rd.title = metadata.get('title', '')
                    rd.doc_type = metadata.get('type', '')
                    rd.publication_date = metadata.get('publication_date', '')
                    rd.version = metadata.get('version', '')
                    rd.source = metadata.get('source', '')
                    rd.context = metadata.get('context', '')
                    rd.country = metadata.get('country', '')
                    rd.language = metadata.get('language', '')
                    rd.url_source = metadata.get('url_source', rd.url or '')
                    rd.save()

                # Validate if requested
                if validate:
                    validate_document_with_pages(rd)

                processed_docs.append(rd)
                print(f"✅ Document from URL uploaded: {rd.id}")

            except Exception as e:
                print(f"❌ URL upload error: {e}")
                return JsonResponse({
                    'success': False,
                    'error': f'Erreur lors du téléchargement depuis URL: {str(e)}'
                }, status=500)

        # Handle file upload
        elif pdf_file:
            # Check if it's a ZIP
            if pdf_file.name.lower().endswith('.zip'):
                is_zip_upload = True
                print(f"📦 Processing ZIP file: {pdf_file.name}")

                try:
                    with zipfile.ZipFile(pdf_file, 'r') as zip_ref:
                        pdf_count = 0
                        for file_info in zip_ref.infolist():
                            if file_info.filename.lower().endswith('.pdf'):
                                pdf_count += 1
                                print(f"📄 Extracting PDF {pdf_count}: {file_info.filename}")

                                # Extract PDF
                                with zip_ref.open(file_info) as pdf_file_obj:
                                    pdf_content = pdf_file_obj.read()

                                    rd = RawDocument(owner=request.user)
                                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                                    fn = os.path.basename(file_info.filename)
                                    rd.file.save(os.path.join(ts, fn), ContentFile(pdf_content))
                                    rd.save()

                                    # Extract metadata
                                    from .utils import extract_metadonnees
                                    metadata = extract_metadonnees(rd.file.path, "")
                                    if isinstance(metadata, dict):
                                        metadata['source'] = 'client'

                                    # Generate structured HTML with CSS
                                    structured_html, structured_html_css = generate_structured_html(rd, request.user)
                                    rd._structured_html_css = structured_html_css

                                    # Save metadata
                                    if metadata and isinstance(metadata, dict):
                                        rd.original_ai_metadata = metadata
                                        rd.title = metadata.get('title', '')
                                        rd.doc_type = metadata.get('type', '')
                                        rd.publication_date = metadata.get('publication_date', '')
                                        rd.version = metadata.get('version', '')
                                        rd.source = metadata.get('source', '')
                                        rd.context = metadata.get('context', '')
                                        rd.country = metadata.get('country', '')
                                        rd.language = metadata.get('language', '')
                                        rd.url_source = metadata.get('url_source', '')
                                        rd.save()

                                    # Validate if requested
                                    if validate:
                                        validate_document_with_pages(rd)

                                    processed_docs.append(rd)

                        print(f"✅ ZIP processed: {pdf_count} PDFs extracted")

                except zipfile.BadZipFile:
                    return JsonResponse({
                        'success': False,
                        'error': 'Fichier ZIP corrompu ou invalide'
                    }, status=400)

            else:
                # Single PDF
                print(f"📄 Processing single PDF: {pdf_file.name}")

                rd = RawDocument(owner=request.user)
                rd.file.save(pdf_file.name, pdf_file)
                rd.save()

                # Extract metadata
                from .utils import extract_metadonnees
                metadata = extract_metadonnees(rd.file.path, "")
                if isinstance(metadata, dict):
                    metadata['source'] = 'client'

                # Generate structured HTML with CSS
                structured_html, structured_html_css = generate_structured_html(rd, request.user)
                rd._structured_html_css = structured_html_css

                # Save metadata
                if metadata and isinstance(metadata, dict):
                    rd.original_ai_metadata = metadata
                    rd.title = metadata.get('title', '')
                    rd.doc_type = metadata.get('type', '')
                    rd.publication_date = metadata.get('publication_date', '')
                    rd.version = metadata.get('version', '')
                    rd.source = metadata.get('source', '')
                    rd.context = metadata.get('context', '')
                    rd.country = metadata.get('country', '')
                    rd.language = metadata.get('language', '')
                    rd.url_source = metadata.get('url_source', '')
                    rd.save()

                # Validate if requested
                if validate:
                    validate_document_with_pages(rd)

                processed_docs.append(rd)
                print(f"✅ Single PDF uploaded: {rd.id}")

        # Prepare response
        if is_zip_upload:
            return JsonResponse({
                'success': True,
                'is_zip_upload': True,
                'documents': [serialize_document(doc) for doc in processed_docs],
                'message': f'{len(processed_docs)} documents importés avec succès!'
            })
        else:
            return JsonResponse({
                'success': True,
                'is_zip_upload': False,
                'document': serialize_document(processed_docs[0]) if processed_docs else None,
                'message': 'Document importé avec succès!'
            })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Upload error: {e}")
        return JsonResponse({
            'success': False,
            'error': f'Erreur lors de l\'importation: {str(e)}'
        }, status=500)


@require_http_methods(["GET"])
@login_required
def api_list_documents(request):
    """List all documents for Document Manager"""
    try:
        # Get documents that are validated (extracted) for the current user
        docs = RawDocument.objects.filter(
            is_validated=True
        ).order_by('-created_at')

        documents_data = []
        for doc in docs:
            documents_data.append({
                'id': doc.id,
                'name': doc.title or 'Untitled',
                'file_name': doc.file.name.split('/')[-1] if doc.file else '',
                'title': doc.title or 'Untitled',
                'status': 'validated' if doc.is_validated else 'pending',
                'total_pages': doc.total_pages or 0,
                'uploadedAt': doc.created_at.isoformat(),
                'uploaded_by': doc.owner.username if doc.owner else 'Unknown',
                'is_validated': doc.is_validated,
                'validated_at': doc.validated_at.isoformat() if doc.validated_at else None,
                'pages_extracted': doc.pages_extracted,
                'file_size': doc.file.size if doc.file else 0
            })

        return JsonResponse({
            'success': True,
            'documents': documents_data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def list_documents(request):
    """List all documents for Document Manager"""
    try:
        # Get all documents for current user (both validated and not)
        docs = RawDocument.objects.filter(
            owner=request.user
        ).order_by('-created_at')

        print(f"📄 Found {docs.count()} documents for user {request.user.username}")

        documents_data = []
        for doc in docs:
            documents_data.append({
                'id': doc.id,
                'name': doc.title or 'Untitled',
                'file_name': doc.file.name.split('/')[-1] if doc.file else '',
                'title': doc.title or 'Untitled',
                'status': 'validated' if doc.is_validated else 'pending',
                'total_pages': doc.total_pages or 0,
                'uploadedAt': doc.created_at.isoformat(),
                'uploaded_by': doc.owner.username if doc.owner else 'Unknown',
                'is_validated': doc.is_validated,
                'validated_at': doc.validated_at.isoformat() if doc.validated_at else None,
                'pages_extracted': doc.pages_extracted,
                'file_size': doc.file.size if doc.file else 0
            })

        print(f"📤 Returning {len(documents_data)} documents")

        return JsonResponse({
            'success': True,
            'documents': documents_data
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def api_reextract_metadata(request, doc_id):
    """API endpoint to reextract metadata"""
    rd = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

    try:
        from .utils import extract_metadonnees
        new_metadata = extract_metadonnees(rd.file.path, rd.url or "")

        if not isinstance(new_metadata, dict):
            return JsonResponse({
                'success': False,
                'error': 'Invalid metadata format'
            }, status=500)

        # Update document
        rd.original_ai_metadata = new_metadata
        rd.title = new_metadata.get('title', '')
        rd.doc_type = new_metadata.get('type', '')
        rd.publication_date = new_metadata.get('publication_date', '')
        rd.version = new_metadata.get('version', '')
        rd.source = new_metadata.get('source', '')
        rd.context = new_metadata.get('context', '')
        rd.country = new_metadata.get('country', '')
        rd.language = new_metadata.get('language', '')
        rd.url_source = new_metadata.get('url_source', rd.url or '')
        rd.save()

        return JsonResponse({
            'success': True,
            'metadata': new_metadata
        })

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
@csrf_exempt
@require_http_methods(["POST"])
@login_required
def api_validate_document(request, doc_id):
    """API endpoint to validate document"""
    document = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

    try:
        validate_document_with_pages(document)

        return JsonResponse({
            'success': True,
            'message': 'Document validé avec succès'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
@login_required
def api_get_document(request, doc_id):
    """API endpoint to get document details"""
    try:
        # Essayer d'abord avec owner
        document = RawDocument.objects.filter(id=doc_id, owner=request.user).first()
        
        # Si pas trouvé, vérifier si l'utilisateur a accès (expert, admin, etc.)
        if not document:
            document = RawDocument.objects.filter(id=doc_id).first()
            if document and not document.is_accessible_by(request.user):
                return JsonResponse({
                    'success': False,
                    'error': 'Accès non autorisé à ce document'
                }, status=403)
        
        if not document:
            return JsonResponse({
                'success': False,
                'error': 'Document non trouvé'
            }, status=404)

        return JsonResponse({
            'success': True,
            'document': serialize_document(document)
        })
    except Exception as e:
        print(f"Erreur api_get_document: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["DELETE"])
@login_required
def api_delete_document(request, doc_id):
    """API endpoint to delete document"""
    document = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

    try:
        document.delete()
        return JsonResponse({
            'success': True,
            'message': 'Document supprimé avec succès'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@require_http_methods(["GET"])
@login_required
def api_get_structured_html(request, doc_id):
    """API endpoint to get structured HTML with CSS"""
    document = get_object_or_404(RawDocument, id=doc_id, owner=request.user)
    regen = request.GET.get('regen', '0') == '1'

    try:
        structured_html_css = ''
        
        if regen or not document.structured_html:
            structured_html, structured_html_css = generate_structured_html(document, request.user)
        else:
            structured_html = document.structured_html
            # Try to extract CSS from Document model if exists
            try:
                if hasattr(document, '_structured_html_css'):
                    structured_html_css = document._structured_html_css
                else:
                    from documents.models import Document as DocModel
                    doc = DocModel.objects.filter(
                        original_file=document.file.name,
                        uploaded_by=document.owner
                    ).first()
                    if doc and hasattr(doc, 'format_info') and doc.format_info:
                        structured_html_css = getattr(doc.format_info, 'generated_css', '') or ''
            except Exception as e:
                print(f"⚠️ Could not extract CSS: {e}")

        return JsonResponse({
            'success': True,
            'structured_html': structured_html,
            'structured_html_css': structured_html_css
        })

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
def api_save_structured_edits(request, doc_id):
    try:
        # Essayer d'abord avec owner, sinon vérifier l'accès
        doc = RawDocument.objects.filter(id=doc_id, owner=request.user).first()
        if not doc:
            doc = RawDocument.objects.filter(id=doc_id).first()
            if doc and not doc.is_accessible_by(request.user):
                return JsonResponse({'success': False, 'error': 'Accès non autorisé'}, status=403)
        
        if not doc:
            return JsonResponse({'success': False, 'error': 'Document non trouvé'}, status=404)
        
        data = json.loads(request.body)
        edits = data.get('edits', [])

        if not edits:
            return JsonResponse({'success': False, 'error': 'Aucune modification fournie'}, status=400)

        if not doc.structured_html:
            return JsonResponse({'success': False, 'error': 'Aucun HTML structuré à modifier'}, status=400)

        soup = BeautifulSoup(doc.structured_html, 'html.parser')
        updated_count = 0

        for edit in edits:
            element_id = edit.get('element_id')
            new_text = edit.get('new_text', '').strip()

            if not element_id:
                continue

            # Chercher par data-element-id (comme dans views.py)
            element = soup.find(attrs={'data-element-id': element_id})
            
            # Si pas trouvé, chercher par id
            if not element:
                element = soup.find(id=element_id)
            
            if element:
                element.clear()
                element.string = new_text
                updated_count += 1
                
                # Log de la modification
                print(f"✏️ Élément {element_id} modifié: {new_text[:50]}...")

        if updated_count > 0:
            doc.structured_html = str(soup)
            doc.structured_html_generated_at = timezone.now()
            doc.save(update_fields=['structured_html', 'structured_html_generated_at'])
            
            print(f"✅ {updated_count} élément(s) sauvegardé(s) pour le document {doc_id}")

        # RETOUR OBLIGATOIRE avec le HTML mis à jour
        return JsonResponse({
            'success': True,
            'structured_html': doc.structured_html,
            'updated_count': updated_count,
            'message': f'{updated_count} élément(s) mis à jour avec succès.'
        })

    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'JSON invalide'}, status=400)
    except Exception as e:
        print(f"❌ Erreur api_save_structured_edits: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def api_view_original_document(request, doc_id):
    """API endpoint to view original PDF"""
    document = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

    if document.file:
        try:
            document.file.seek(0)
            file_content = document.file.read()

            if not file_content:
                return HttpResponse("Le fichier PDF est vide", status=404)

            response = HttpResponse(file_content, content_type='application/pdf')
            filename = os.path.basename(document.file.name)
            if not filename.lower().endswith('.pdf'):
                filename += '.pdf'

            response['Content-Disposition'] = f'inline; filename="{filename}"'
            response['X-Frame-Options'] = 'SAMEORIGIN'
            response['Content-Security-Policy'] = "frame-ancestors 'self'"

            return response

        except Exception as e:
            import traceback
            traceback.print_exc()
            return HttpResponse(f"Erreur: {str(e)}", status=500)

    return HttpResponse("No file available", status=404)


@require_http_methods(["GET"])
@login_required
def get_annotation_details(request, annotation_id):
    """Get detailed information about an annotation"""
    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        return JsonResponse({
            'success': True,
            'annotation': {
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'type_id': annotation.annotation_type.id,
                'type_display': annotation.annotation_type.display_name,
                'color': annotation.annotation_type.color,
                'confidence': annotation.confidence_score,
                'reasoning': annotation.ai_reasoning,
                'created_by': annotation.created_by.username,
                'mode': annotation.mode
            }
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def edit_annotation(request, annotation_id):
    """Edit an existing annotation"""
    try:
        data = json.loads(request.body)
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Check permissions
        if not (annotation.created_by == request.user or request.user.groups.filter(name='Expert').exists()):
            return JsonResponse({'success': False, 'error': 'Permission denied'}, status=403)

        # Update fields
        if 'selected_text' in data:
            annotation.selected_text = data['selected_text']
        if 'type_id' in data:
            annotation.annotation_type = get_object_or_404(AnnotationType, id=data['type_id'])

        annotation.save()

        return JsonResponse({
            'success': True,
            'annotation': {
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'type_display': annotation.annotation_type.display_name
            }
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def add_structured_annotation(request):
    """Add a new structured annotation"""
    try:
        data = json.loads(request.body)
        page = get_object_or_404(DocumentPage, id=data['page_id'])

        annotation = Annotation.objects.create(
            page=page,
            annotation_type_id=data['type_id'],
            selected_text=data['selected_text'],
            start_xpath=data.get('start_xpath'),
            end_xpath=data.get('end_xpath'),
            mode='structured',
            created_by=request.user
        )

        return JsonResponse({
            'success': True,
            'annotation_id': annotation.id
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
@login_required
def sync_page_json(request, page_id):
    """Sync JSON data with page annotations"""
    try:
        data = json.loads(request.body)
        page = get_object_or_404(DocumentPage, id=page_id)

        # Get current annotations
        current_annotations = page.annotations.all()

        # Update annotations from JSON
        for ann_data in data['annotations']:
            if 'id' in ann_data:
                # Update existing
                ann = current_annotations.get(id=ann_data['id'])
                ann.selected_text = ann_data['text']
                ann.annotation_type_id = ann_data['type_id']
                ann.save()
            else:
                # Create new
                Annotation.objects.create(
                    page=page,
                    selected_text=ann_data['text'],
                    annotation_type_id=ann_data['type_id'],
                    created_by=request.user
                )

        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@require_http_methods(["GET"])
@login_required
def view_original_pdf(request, doc_id):
    """View original PDF file"""
    try:
        # Get document - allow access for owner, document_manager, expert, and admin
        document = RawDocument.objects.get(id=doc_id)

        # Check permissions
        user_role = getattr(request.user, 'role', None)
        is_owner = document.owner == request.user
        is_allowed_role = user_role in ['document_manager', 'expert', 'admin']

        if not (is_owner or is_allowed_role):
            return JsonResponse({
                'success': False,
                'error': 'Permission denied'
            }, status=403)

        # Check if file exists
        if not document.file:
            return JsonResponse({
                'success': False,
                'error': 'PDF file not found'
            }, status=404)

        # Open and return the PDF file
        from django.http import FileResponse
        import os

        file_path = document.file.path
        if not os.path.exists(file_path):
            return JsonResponse({
                'success': False,
                'error': 'PDF file not found on disk'
            }, status=404)

        # Return the PDF file
        response = FileResponse(open(file_path, 'rb'), content_type='application/pdf')
        # Get filename from the file field
        filename = os.path.basename(document.file.name) if document.file else 'document.pdf'
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    except RawDocument.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Document not found'
        }, status=404)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)