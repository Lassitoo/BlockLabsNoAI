from django.shortcuts import render, get_object_or_404, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponse, Http404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator
from django.db.models import Q
from django.utils import timezone
import threading
import json

from .models import Document, DocumentImage, DocumentFormat
# from .forms import DocumentUploadForm, DocumentFilterForm  # Supprimé - utiliser API
from .utils.document_processor import DocumentProcessor


# ============================================================================
# FONCTIONS DÉSACTIVÉES - Utilisaient les formulaires Django (supprimés)
# Utiliser les API à la place (rawdocs/api_views.py)
# ============================================================================

# def document_list(request):
#     """Liste des documents avec filtres et pagination - DÉSACTIVÉ"""
#     pass

# def document_upload(request):
#     """Upload d'un nouveau document - DÉSACTIVÉ"""
#     pass


def document_detail(request, pk):
    """Détail d'un document"""
    document = get_object_or_404(Document, pk=pk)

    # Vérifier les permissions (simplifiées pour la démo)
    if request.user.is_authenticated and document.uploaded_by != request.user:
        raise Http404("Document non trouvé")

    context = {
        'document': document,
        'images': document.images.all(),
        'format_info': getattr(document, 'format_info', None),
    }

    return render(request, 'documents/document_detail.html', context)


@require_http_methods(["GET"])
def document_status(request, pk):
    """API pour vérifier le statut de traitement d'un document"""
    document = get_object_or_404(Document, pk=pk)

    data = {
        'status': document.status,
        'processed_at': document.processed_at.isoformat() if document.processed_at else None,
        'error_message': document.error_message,
        'has_content': bool(document.extracted_content),
        'has_formatted_content': bool(document.formatted_content),
        'progress': get_processing_progress(document.status)
    }

    return JsonResponse(data)


@require_http_methods(["POST"])
def reprocess_document(request, pk):
    """Relance le traitement d'un document"""
    document = get_object_or_404(Document, pk=pk)

    # Vérifier les permissions
    if request.user.is_authenticated and document.uploaded_by != request.user:
        return JsonResponse({'error': 'Permission refusée'}, status=403)

    if document.status == 'processing':
        return JsonResponse({'error': 'Le document est déjà en cours de traitement'}, status=400)

    # Réinitialiser le statut
    document.status = 'pending'
    document.error_message = None
    document.processed_at = None
    document.save()

    # Lancer le traitement
    thread = threading.Thread(
        target=process_document_background,
        args=(document.id,)
    )
    thread.daemon = True
    thread.start()

    return JsonResponse({'success': True, 'message': 'Retraitement lancé'})


@csrf_exempt  # Temporairement désactivé pour les tests ngrok
@require_http_methods(["DELETE"])
def delete_document(request, pk):
    """Supprime un document"""
    print(f"🗑️ Delete document endpoint called for doc_id: {pk}")
    print(f"👤 User authenticated: {request.user.is_authenticated}")
    print(f"👤 User: {request.user}")
    print(f"🍪 Cookies: {request.COOKIES}")
    
    document = get_object_or_404(Document, pk=pk)
    print(f"📄 Document owner: {document.uploaded_by}")

    # Vérifier les permissions
    if request.user.is_authenticated and document.uploaded_by != request.user:
        print(f"❌ Permission denied: user {request.user} != owner {document.uploaded_by}")
        return JsonResponse({'error': 'Permission refusée'}, status=403)

    title = document.title
    document.delete()
    print(f"✅ Document '{title}' deleted successfully")

    return JsonResponse({
        'success': True,
        'message': f'Document "{title}" supprimé avec succès'
    })


@require_http_methods(["GET"])
def download_original(request, pk):
    """Télécharge le fichier original"""
    document = get_object_or_404(Document, pk=pk)

    # Vérifier les permissions
    if request.user.is_authenticated and document.uploaded_by != request.user:
        raise Http404("Document non trouvé")

    try:
        response = HttpResponse(
            document.original_file.read(),
            content_type='application/octet-stream'
        )
        response['Content-Disposition'] = f'attachment; filename="{document.original_file.name}"'
        return response
    except Exception as e:
        raise Http404("Fichier non trouvé")


@require_http_methods(["GET"])
def export_html(request, pk):
    """Exporte le contenu formaté en HTML"""
    document = get_object_or_404(Document, pk=pk)

    # Vérifier les permissions
    if request.user.is_authenticated and document.uploaded_by != request.user:
        raise Http404("Document non trouvé")

    if not document.formatted_content:
        raise Http404("Contenu formaté non disponible")

    # Générer le HTML complet
    html_content = f"""
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{document.title}</title>
        <style>
        {getattr(document.format_info, 'generated_css', '') if hasattr(document, 'format_info') else ''}
        </style>
    </head>
    <body>
        {document.formatted_content}
    </body>
    </html>
    """

    response = HttpResponse(html_content, content_type='text/html')
    response['Content-Disposition'] = f'attachment; filename="{document.title}.html"'

    return response


def process_document_background(document_id):
    """Traite un document en arrière-plan"""
    try:
        document = Document.objects.get(id=document_id)
        processor = DocumentProcessor(document)
        success = processor.process_document()

        if success:
            print(f"Document {document.title} traité avec succès")
        else:
            print(f"Erreur lors du traitement du document {document.title}")

    except Document.DoesNotExist:
        print(f"Document avec l'ID {document_id} non trouvé")
    except Exception as e:
        print(f"Erreur lors du traitement: {str(e)}")


def get_processing_progress(status):
    """Retourne le pourcentage de progression basé sur le statut"""
    progress_map = {
        'pending': 0,
        'processing': 50,
        'completed': 100,
        'error': 0
    }
    return progress_map.get(status, 0)


def home(request):
    """Page d'accueil"""
    # Statistiques rapides
    total_docs = Document.objects.count()
    processed_docs = Document.objects.filter(status='completed').count()
    processing_docs = Document.objects.filter(status='processing').count()
    error_docs = Document.objects.filter(status='error').count()

    # Documents récents
    recent_docs = Document.objects.order_by('-uploaded_at')[:5]

    context = {
        'total_docs': total_docs,
        'processed_docs': processed_docs,
        'processing_docs': processing_docs,
        'error_docs': error_docs,
        'recent_docs': recent_docs,
    }

    return render(request, 'documents/home.html', context)


# Add this function to your views.py

@require_http_methods(["POST"])
def save_document_edits(request, pk):
    """Save user edits to the document"""
    document = get_object_or_404(Document, pk=pk)
    
    # Check permissions
    if request.user.is_authenticated and document.uploaded_by != request.user:
        return JsonResponse({'error': 'Permission refusée'}, status=403)
    
    try:
        data = json.loads(request.body)
        formatted_content = data.get('formatted_content', '')
        extracted_content = data.get('extracted_content', '')
        
        if not formatted_content:
            return JsonResponse({'error': 'Contenu formaté manquant'}, status=400)
        
        # Update document with edited content
        document.formatted_content = formatted_content
        document.extracted_content = extracted_content
        
        # Update modification timestamp
        document.processed_at = timezone.now()
        document.save()
        
        return JsonResponse({
            'success': True,
            'message': 'Modifications sauvegardées avec succès'
        })
        
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Données JSON invalides'}, status=400)
    except Exception as e:
        return JsonResponse({'error': f'Erreur serveur: {str(e)}'}, status=500)