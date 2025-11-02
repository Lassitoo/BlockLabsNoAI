# rawdocs/views.py
# Replace / consolidate the top imports block with this
from datetime import datetime, timezone as dt_timezone
import time
import os
import json
import re

import requests
from pymongo import MongoClient
from PyPDF2 import PdfReader
from bs4 import BeautifulSoup

from collections import OrderedDict

from django.conf import settings
from django.utils import timezone
from django.shortcuts import render, redirect, get_object_or_404
from django.core.files.base import ContentFile
from django.http import JsonResponse, HttpResponse
from django.contrib import messages
from django.contrib.auth import authenticate, login, views as auth_views
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User, Group
from django.core.paginator import Paginator
from django.db import transaction, models
from django import forms
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_POST, require_http_methods
from django.urls import reverse

from difflib import SequenceMatcher

from .groq_annotation_system import GroqAnnotator
from .metadata_rlhf_learning import MetadataRLHFLearner
from .rlhf_learning import RLHFGroqAnnotator
from .utils import extract_metadonnees, extract_full_text
from .annotation_utils import extract_pages_from_pdf
from .regulatory_analyzer import RegulatoryAnalyzer
from .models import (
    RawDocument, MetadataLog, DocumentPage,
    AnnotationType, Annotation, AnnotationSession,
    AILearningMetrics, AnnotationFeedback,
    GlobalSummaryEditHistory, DocumentRegulatoryAnalysis
)

import zipfile
from io import BytesIO

# --- Mongo client (réutilisé) ---
try:
    _mongo_client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
    _mongo_coll = _mongo_client[settings.MONGO_DB][settings.MONGO_COLLECTION]
    print("Mongo ready:", settings.MONGO_URI, settings.MONGO_DB, settings.MONGO_COLLECTION)
except Exception as e:
    _mongo_client = None
    _mongo_coll = None
    print("Mongo init failed:", e)


# ——— Forms ——————————————————————————————————————————

class UploadForm(forms.Form):
    pdf_url = forms.URLField(
        required=False,
        widget=forms.URLInput(attrs={
            'placeholder': 'https://…',
            'class': 'upload-cell__input'
        })
    )
    pdf_file = forms.FileField(required=False)


class RegisterForm(UserCreationForm):
    email = forms.EmailField(required=True)
    role = forms.ChoiceField(choices=[
        ("Metadonneur", "Métadonneur"),
        ("Annotateur", "Annotateur"),
        ("Expert", "Expert"),
        ("Client", "Client"),

    ], label="Profil")

    class Meta:
        model = User
        fields = ("username", "email", "role", "password1", "password2")

    def save(self, commit=True):
        user = super().save(commit)
        user.email = self.cleaned_data["email"]
        group = Group.objects.get_or_create(name=self.cleaned_data["role"])[0]  # CHANGE THIS LINE
        user.groups.add(group)
        if commit:
            user.save()
        return user


class MetadataEditForm(forms.Form):
    title = forms.CharField(required=False)
    type = forms.CharField(required=False)
    # Use CharField to accept free-text dates coming from LLM (e.g., "23 January 2025")
    publication_date = forms.CharField(required=False)
    version = forms.CharField(required=False)
    source = forms.CharField(required=False)
    context = forms.CharField(required=False)
    country = forms.CharField(required=False)
    language = forms.CharField(required=False)
    url_source = forms.URLField(required=False)


# ——— Permissions ——————————————————————————————————————

def is_metadonneur(user):
    return user.groups.filter(name="Metadonneur").exists()


def is_annotateur(user):
    return user.groups.filter(name="Annotateur").exists()


def is_expert(user):
    return user.groups.filter(name="Expert").exists()


def is_dev_metier(user):
    return False


# ——— Authentication ————————————————————————————————————

from django.urls import reverse
from django.conf import settings


class CustomLoginView(auth_views.LoginView):
    template_name = 'registration/login.html'

    def get_success_url(self):
        user = self.request.user
        if user.groups.filter(name='Client').exists():
            return '/client/'  # We'll create this
        if user.groups.filter(name='Expert').exists():
            return reverse('expert:dashboard')
        if user.groups.filter(name='Annotateur').exists():
            return reverse('rawdocs:annotation_dashboard')
        if user.groups.filter(name='Metadonneur').exists():
            return reverse('rawdocs:dashboard')
        if False:  # DevMetier group removed
            return reverse('rawdocs:dev_metier_dashboard')
        return '/'


def register(request):
    if request.method == 'POST':
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            uname = form.cleaned_data['username']
            pwd = form.cleaned_data['password1']
            user = authenticate(username=uname, password=pwd)
            login(request, user)

            # Redirect to proper dashboard based on role
            grp = form.cleaned_data['role']
            if grp == "Metadonneur":
                return redirect('rawdocs:dashboard')  # Metadonneur dashboard
            elif grp == "Annotateur":
                return redirect('rawdocs:annotation_dashboard')  # Annotateur dashboard
            elif grp == "Expert":
                return redirect('expert:dashboard')  # Expert dashboard
            elif grp == "Client":
                return redirect('/client/')  # Client dashboard
            elif False:  # DevMetier group removed
                return redirect('rawdocs:dev_metier_dashboard')  # dev metier dashboard
            else:
                return redirect('rawdocs:dashboard')  # Fallback
    else:
        form = RegisterForm()
    return render(request, 'registration/register.html', {'form': form})


# ——— Métadonneur Views ——————————————————————————————

from .models import UserProfile  # déjà importé


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def dashboard_view(request):
    profile, _ = UserProfile.objects.get_or_create(user=request.user)  # Récupérer ou créer le profil

    if request.method == 'POST':
        planned_value = request.POST.get('planned_number')
        try:
            profile.planned_documents = int(planned_value or 0)
            profile.save()
            messages.success(request, "Nombre de documents planifiés mis à jour.")
        except (TypeError, ValueError):
            messages.error(request, "Valeur invalide pour le nombre planifié.")
        except Exception as e:
            # Probablement migration non appliquée (colonne manquante)
            messages.error(
                request,
                "Impossible d'enregistrer le nombre planifié. Assurez-vous d'avoir exécuté les migrations (makemigrations/migrate)."
            )

    docs = RawDocument.objects.filter(owner=request.user).order_by('-created_at')
    total_imported = docs.count()
    validated_count = docs.filter(is_validated=True).count()
    pending_validation_count = docs.filter(is_validated=False).count()

    planned = getattr(profile, 'planned_documents', 0)

    context = {
        'documents': docs,
        'total_scrapped': total_imported,
        'total_planned': planned,  # <-- Utiliser la valeur du profil
        'total_completed': validated_count,
        'in_progress': pending_validation_count,
        'pending_validation_count': pending_validation_count,
        'total_imported': total_imported,
        'total_in_reextraction': total_imported,
        'pie_data': json.dumps([15, 8, 12, 5, 3]),
        'bar_data': json.dumps([planned, total_imported, validated_count, pending_validation_count]),
    }
    return render(request, 'rawdocs/dashboard.html', context)


# Wrapper sécurisé pour extract_metadonnees qui garantit toujours un dict
# et fusionne avec des valeurs par défaut

def safe_extract_metadata(file_path, url=""):
    """
    Wrapper sécurisé pour extract_metadonnees qui garantit toujours un dict
    """
    try:
        result = extract_metadonnees(file_path, url)

        # Vérification stricte du type
        if not isinstance(result, dict):
            print(f"⚠️ ALERTE: extract_metadonnees a retourné un {type(result)}")
            print(f"⚠️ Valeur reçue: {result}")
            return {
                'title': '',
                'type': '',
                'publication_date': '',
                'version': '',
                'source': '',
                'context': '',
                'country': '',
                'language': 'en',
                'url_source': url or '',
                'quality': {
                    'extraction_rate': 0,
                    'field_scores': {},
                    'extraction_reasoning': {},
                    'extracted_fields': 0,
                    'total_fields': 8,
                    'llm_powered': False
                }
            }

        # S'assurer que tous les champs requis existent
        default_metadata = {
            'title': '',
            'type': '',
            'publication_date': '',
            'version': '',
            'source': '',
            'context': '',
            'country': '',
            'language': 'en',
            'url_source': url or '',
            'quality': {
                'extraction_rate': 0,
                'field_scores': {},
                'extraction_reasoning': {},
                'extracted_fields': 0,
                'total_fields': 8,
                'llm_powered': False
            }
        }

        # Fusionner avec les valeurs par défaut
        return {**default_metadata, **result}

    except Exception as e:
        print(f"❌ Exception dans safe_extract_metadata: {e}")
        import traceback
        traceback.print_exc()

        return {
            'title': '',
            'type': '',
            'publication_date': '',
            'version': '',
            'source': '',
            'context': '',
            'country': '',
            'language': 'en',
            'url_source': url or '',
            'quality': {
                'extraction_rate': 0,
                'field_scores': {},
                'extraction_reasoning': {},
                'extracted_fields': 0,
                'total_fields': 8,
                'llm_powered': False
            }
        }


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def upload_pdf(request):
    form = UploadForm(request.POST or None, request.FILES or None)
    context = {'form': form}

    # Handle metadata editing form submission
    if request.method == 'POST' and request.POST.get('edit_metadata'):
        doc_id = request.POST.get('doc_id')
        rd = get_object_or_404(RawDocument, id=doc_id, owner=request.user)
        edit_form = MetadataEditForm(request.POST)

        ai_metadata = rd.original_ai_metadata or {}

        if edit_form.is_valid():
            human_metadata = {}
            changes_made = False
            field_mapping = {
                'title': 'title',
                'type': 'doc_type',
                'publication_date': 'publication_date',
                'version': 'version',
                'source': 'source',
                'context': 'context',
                'country': 'country',
                'language': 'language',
                'url_source': 'url_source'
            }

            for form_field, model_field in field_mapping.items():
                new_value = edit_form.cleaned_data.get(form_field, '') or ''
                old_value = getattr(rd, model_field, '') or ''
                human_metadata[form_field] = new_value

                if str(old_value) != str(new_value):
                    changes_made = True
                    MetadataLog.objects.create(
                        document=rd, field_name=form_field,
                        old_value=old_value, new_value=new_value,
                        modified_by=request.user
                    )
                    setattr(rd, model_field, new_value)

            if changes_made:
                rd.save()
                from .metadata_rlhf_learning import MetadataRLHFLearner
                learner = MetadataRLHFLearner()
                feedback_result = learner.process_metadata_feedback(rd, ai_metadata, human_metadata, request.user)

                corrections = feedback_result['corrections_summary']
                score = int(feedback_result['feedback_score'] * 100)
                correct_count = len(corrections.get('kept_correct', []))
                wrong_count = len(corrections.get('corrected_fields', [])) + len(corrections.get('removed_fields', []))
                missed_count = len(corrections.get('missed_fields', []))

                learning_message = f"✅ Métadonnées sauvegardées! 🧠 IA Score: {score}% | ✅ Corrects: {correct_count} | ❌ Erreurs: {wrong_count} | 📝 Manqués: {missed_count}"
                messages.success(request, learning_message)
                context['learning_feedback'] = {
                    'score': score,
                    'correct': correct_count,
                    'wrong': wrong_count,
                    'missed': missed_count,
                    'show': True,
                    'feedback_result': feedback_result
                }
            else:
                messages.info(request, "Aucune modification détectée.")

        metadata = safe_extract_metadata(rd.file.path, rd.url or "")
        text = extract_full_text(rd.file.path)

        # Générer le HTML structuré et le sauvegarder dans RawDocument
        structured_html = rd.structured_html or ""
        if not structured_html:
            structured_html = generate_structured_html(rd, request.user)

        initial_data = {
            'title': rd.title or '',
            'type': rd.doc_type or '',
            'publication_date': rd.publication_date or '',
            'version': rd.version or '',
            'source': rd.source or '',
            'context': rd.context or '',
            'country': rd.country or '',
            'language': rd.language or '',
            'url_source': rd.url_source or (rd.url or ''),
        }
        edit_form = MetadataEditForm(initial=initial_data)

        context.update({
            'doc': rd,
            'metadata': metadata,
            'extracted_text': text,
            'structured_html': structured_html,
            'edit_form': edit_form,
            'logs': MetadataLog.objects.filter(document=rd).order_by('-modified_at')
        })

        return render(request, 'rawdocs/upload.html', context)

    # Handle file upload
    elif request.method == 'POST' and form.is_valid():
        try:
            uploaded_file = form.cleaned_data.get('pdf_file')
            url = form.cleaned_data.get('pdf_url')

            if url:
                # Traitement URL (PDF unique)
                resp = requests.get(url, timeout=30)
                resp.raise_for_status()
                ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                fn = os.path.basename(url) or 'document.pdf'
                rd = RawDocument(url=url, owner=request.user)
                rd.file.save(os.path.join(ts, fn), ContentFile(resp.content))
                rd.save()

                # Extraire métadonnées et texte
                metadata = safe_extract_metadata(rd.file.path, rd.url or "")
                text = extract_full_text(rd.file.path)

                # Générer HTML structuré
                structured_html = generate_structured_html(rd, request.user)

                # Save extracted metadata to the model
                if metadata:
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
                    print(f"✅ Métadonnées LLM sauvegardées pour le document {rd.pk}")

                # Validation automatique si demandée
                if 'validate' in request.POST:
                    validate_document_with_pages(rd)
                    messages.success(request, 'Document validé avec succès.')
                    return redirect('rawdocs:document_list')

                # Create form for editing
                initial_data = {
                    'title': rd.title or '',
                    'type': rd.doc_type or '',
                    'publication_date': rd.publication_date or '',
                    'version': rd.version or '',
                    'source': rd.source or '',
                    'context': rd.context or '',
                    'country': rd.country or '',
                    'language': rd.language or '',
                    'url_source': rd.url_source or (rd.url or ''),
                }
                edit_form = MetadataEditForm(initial=initial_data)

                context.update({
                    'doc': rd,
                    'metadata': metadata,
                    'extracted_text': text,
                    'structured_html': structured_html,
                    'edit_form': edit_form,
                    'logs': MetadataLog.objects.filter(document=rd).order_by('-modified_at')
                })
                messages.success(request, "Document importé avec succès depuis l'URL!")

            elif uploaded_file:
                # Vérifier si c'est un ZIP
                if uploaded_file.name.lower().endswith('.zip'):
                    # Traiter le ZIP
                    processed_docs = []
                    with zipfile.ZipFile(uploaded_file, 'r') as zip_ref:
                        for file_info in zip_ref.infolist():
                            if file_info.filename.lower().endswith('.pdf'):
                                # Extraire le PDF en mémoire
                                with zip_ref.open(file_info) as pdf_file:
                                    pdf_content = pdf_file.read()
                                    pdf_io = BytesIO(pdf_content)

                                    # Créer un RawDocument pour ce PDF
                                    rd = RawDocument(owner=request.user)
                                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                                    fn = os.path.basename(file_info.filename)
                                    rd.file.save(os.path.join(ts, fn), ContentFile(pdf_content))
                                    rd.save()

                                    # Extraire métadonnées et texte
                                    metadata = safe_extract_metadata(rd.file.path, "")
                                    text = extract_full_text(rd.file.path)
                                    metadata['source'] = 'client'

                                    # Générer HTML structuré
                                    structured_html = generate_structured_html(rd, request.user)

                                    # Sauvegarder les métadonnées dans le modèle
                                    if metadata:
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

                                    # Validation si demandée
                                    if 'validate' in request.POST:
                                        validate_document_with_pages(rd)

                                    # Ajouter les données pour l'affichage
                                    initial_data = {
                                        'title': rd.title or '',
                                        'type': rd.doc_type or '',
                                        'publication_date': rd.publication_date or '',
                                        'version': rd.version or '',
                                        'source': rd.source or '',
                                        'context': rd.context or '',
                                        'country': rd.country or '',
                                        'language': rd.language or '',
                                        'url_source': rd.url_source or '',
                                    }
                                    edit_form = MetadataEditForm(initial=initial_data)

                                    processed_docs.append({
                                        'doc': rd,
                                        'metadata': metadata,
                                        'extracted_text': text,
                                        'structured_html': structured_html,
                                        'edit_form': edit_form,
                                        'logs': MetadataLog.objects.filter(document=rd).order_by('-modified_at')
                                    })
                            else:
                                print(f"Ignoré non-PDF dans ZIP: {file_info.filename}")

                    if processed_docs:
                        messages.success(request, f"{len(processed_docs)} PDFs importés et traités depuis le ZIP!")
                        # Mettre à jour le contexte pour afficher tous les documents extraits
                        context.update({
                            'processed_docs': processed_docs,  # Liste des documents pour affichage
                            'is_zip_upload': True  # Indicateur pour le template
                        })
                        return render(request, 'rawdocs/upload.html', context)
                    else:
                        messages.error(request, "Aucun PDF valide trouvé dans le ZIP.")

                else:
                    # Traitement PDF unique
                    rd = RawDocument(owner=request.user)
                    rd.file.save(uploaded_file.name, uploaded_file)
                    rd.save()

                    # Extraire métadonnées et texte
                    metadata = safe_extract_metadata(rd.file.path, "")
                    text = extract_full_text(rd.file.path)
                    metadata['source'] = 'client'

                    # Générer HTML structuré
                    structured_html = generate_structured_html(rd, request.user)

                    # Save extracted metadata to the model
                    if metadata:
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
                        print(f"✅ Métadonnées LLM sauvegardées pour le document {rd.pk}")

                    # Validation automatique si demandée
                    if 'validate' in request.POST:
                        validate_document_with_pages(rd)
                        messages.success(request, 'Document validé avec succès.')
                        return redirect('rawdocs:document_list')

                    # Create form for editing
                    initial_data = {
                        'title': rd.title or '',
                        'type': rd.doc_type or '',
                        'publication_date': rd.publication_date or '',
                        'version': rd.version or '',
                        'source': rd.source or '',
                        'context': rd.context or '',
                        'country': rd.country or '',
                        'language': rd.language or '',
                        'url_source': rd.url_source or '',
                    }
                    edit_form = MetadataEditForm(initial=initial_data)

                    context.update({
                        'doc': rd,
                        'metadata': metadata,
                        'extracted_text': text,
                        'structured_html': structured_html,
                        'edit_form': edit_form,
                        'logs': MetadataLog.objects.filter(document=rd).order_by('-modified_at')
                    })
                    messages.success(request, "Document PDF importé avec succès!")

            else:
                messages.error(request, "Aucun fichier ou URL fourni.")

        except zipfile.BadZipFile:
            messages.error(request, "Fichier ZIP corrompu ou invalide.")
        except Exception as e:
            messages.error(request, f"Erreur lors de l'import: {str(e)}")

    return render(request, 'rawdocs/upload.html', context)


# Fonction helper pour générer le HTML structuré
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

        # SAUVEGARDER dans RawDocument
        raw_document.structured_html = structured_html
        raw_document.structured_html_generated_at = timezone.now()
        raw_document.structured_html_method = 'document_processor'
        raw_document.structured_html_confidence = 0.0
        raw_document.save()

        print(f"✅ HTML structuré généré et sauvé pour le document {raw_document.id}")
        return structured_html

    except Exception as e:
        print(f"⚠️ Erreur génération HTML structuré: {e}")
        return ""


# Fonction helper pour la validation avec extraction des pages
def validate_document_with_pages(document):
    """Valide un document et extrait ses pages"""
    # Vérifier si les pages existent déjà
    existing_pages = document.pages.count()

    if existing_pages == 0 and not document.pages_extracted:
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
        # Juste marquer comme validé si déjà extrait ou si les pages existent déjà
        if not document.is_validated:
            document.is_validated = True
            document.validated_at = timezone.now()
            if existing_pages > 0 and not document.pages_extracted:
                document.pages_extracted = True
                document.total_pages = existing_pages
            document.save()
            print(f"✅ Document {document.id} marqué comme validé (pages déjà extraites)")


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def document_list(request):
    docs = RawDocument.objects.filter(owner=request.user).order_by('-created_at')
    for d in docs:
        d.basename = os.path.basename(d.file.name)
    return render(request, 'rawdocs/document_list.html', {'documents': docs})


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def document_metadata(request, doc_id):
    rd = get_object_or_404(RawDocument, id=doc_id, owner=request.user)
    return JsonResponse(safe_extract_metadata(rd.file.path, rd.url or ""))


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def delete_document(request, doc_id):
    rd = get_object_or_404(RawDocument, id=doc_id, owner=request.user)
    if request.method == 'POST':
        rd.delete()
        messages.success(request, "Document supprimé avec succès")
    return redirect('rawdocs:document_list')


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def edit_metadata(request, doc_id):
    rd = get_object_or_404(RawDocument, id=doc_id, owner=request.user)
    metadata = safe_extract_metadata(rd.file.path, rd.url or "")

    if request.method == 'POST':
        form = MetadataEditForm(request.POST)
        if form.is_valid():
            # Handle standard fields (your existing code)
            standard_fields = ['title', 'type', 'publication_date', 'version', 'source', 'context', 'country',
                               'language', 'url_source']

            for field_name in standard_fields:
                if field_name in form.cleaned_data:
                    new_value = form.cleaned_data[field_name]
                    old_value = metadata.get(field_name)
                    if str(old_value) != str(new_value):
                        MetadataLog.objects.create(
                            document=rd, field_name=field_name,
                            old_value=old_value, new_value=new_value,
                            modified_by=request.user
                        )
                        metadata[field_name] = new_value

            # Persist updates to the RawDocument model so changes are visible everywhere (Library, details, etc.)
            rd.title = form.cleaned_data.get('title', rd.title) or ''
            rd.doc_type = form.cleaned_data.get('type', rd.doc_type) or ''
            rd.publication_date = form.cleaned_data.get('publication_date', rd.publication_date) or ''
            rd.version = form.cleaned_data.get('version', rd.version) or ''
            rd.source = form.cleaned_data.get('source', rd.source) or ''
            rd.context = form.cleaned_data.get('context', rd.context) or ''
            rd.country = form.cleaned_data.get('country', rd.country) or ''
            rd.language = form.cleaned_data.get('language', rd.language) or ''
            rd.url_source = form.cleaned_data.get('url_source', rd.url_source) or (rd.url or '')
            rd.save()

            from .models import CustomField, CustomFieldValue
            for key, value in request.POST.items():
                if key.startswith('custom_'):
                    field_name = key.replace('custom_', '')
                    try:
                        custom_field = CustomField.objects.get(name=field_name)
                        custom_value, created = CustomFieldValue.objects.get_or_create(
                            document=rd,
                            field=custom_field,
                            defaults={'value': value}
                        )
                        if not created:
                            # Log the change
                            old_val = custom_value.value
                            custom_value.value = value
                            custom_value.save()

                            MetadataLog.objects.create(
                                document=rd,
                                field_name=f"Custom: {field_name}",
                                old_value=old_val,
                                new_value=value,
                                modified_by=request.user
                            )
                    except CustomField.DoesNotExist:
                        pass

            return redirect('rawdocs:document_list')
    else:
        initial_data = {
            'title': rd.title or '',
            'type': rd.doc_type or '',
            'publication_date': rd.publication_date or '',
            'version': rd.version or '',
            'source': rd.source or '',
            'context': rd.context or '',
            'country': rd.country or '',
            'language': rd.language or '',
            'url_source': rd.url_source or (rd.url or ''),
        }
        form = MetadataEditForm(initial=initial_data)

    logs = MetadataLog.objects.filter(document=rd).order_by('-modified_at')

    # Load existing custom fields fo this document ONLY
    from .models import CustomField, CustomFieldValue
    custom_fields_data = []
    for custom_value in CustomFieldValue.objects.filter(document=rd):
        custom_fields_data.append({
            'name': custom_value.field.name,
            'type': custom_value.field.field_type,
            'value': custom_value.value
        })

    return render(request, 'rawdocs/edit_metadata.html', {
        'form': form,
        'metadata': metadata,
        'doc': rd,
        'logs': logs,
        'custom_fields_data': custom_fields_data  # ADD THIS LINE
    })


@login_required(login_url='rawdocs:login')
@user_passes_test(is_metadonneur)
def reextract_metadata(request, doc_id):
    """Relance l'extraction, écrase les champs du modèle et logue les changements."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    rd = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

    try:
        new_metadata = safe_extract_metadata(rd.file.path, rd.url or "")

        # mapping: modèle -> clé metadata
        mapping = {
            'title': ('title',),
            'doc_type': ('type',),
            'publication_date': ('publication_date',),
            'version': ('version',),
            'source': ('source',),
            'context': ('context',),
            'country': ('country',),
            'language': ('language',),
            'url_source': ('url_source',),
        }

        # Appliquer tous les champs et logger les changements
        for model_field, meta_keys in mapping.items():
            meta_key = meta_keys[0]
            old_val = getattr(rd, model_field, '') or ''
            # Ne pas écraser par une valeur vide; écraser seulement si on a une vraie nouvelle valeur non vide
            candidate_val = new_metadata.get(meta_key, None)
            new_val = (candidate_val if candidate_val is not None else '')
            if new_val == '':
                continue
            if str(old_val) != str(new_val):
                MetadataLog.objects.create(
                    document=rd,
                    field_name=('type' if model_field == 'doc_type' else model_field),
                    old_value=old_val,
                    new_value=new_val,
                    modified_by=request.user
                )
                setattr(rd, model_field, new_val)

        rd.save()

        return JsonResponse({'success': True, 'metadata': new_metadata})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required
@user_passes_test(is_metadonneur)
def validate_document(request, doc_id):
    document = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

    if request.method == 'POST':
        # GÉNÉRER LE HTML STRUCTURÉ AVANT LA VALIDATION
        if not document.structured_html:
            try:
                from documents.models import Document as DocModel
                from documents.utils.document_processor import DocumentProcessor

                ext = os.path.splitext(document.file.name)[1].lower().lstrip('.')
                allowed = {'pdf', 'docx', 'doc', 'txt', 'html', 'xlsx', 'xls', 'rtf'}
                file_type = ext if ext in allowed else 'pdf'

                doc = DocModel.objects.filter(
                    original_file=document.file.name,
                    uploaded_by=document.owner or request.user
                ).first()

                if not doc:
                    doc = DocModel(
                        title=document.title or os.path.basename(document.file.name),
                        original_file=document.file,
                        file_type=file_type,
                        file_size=getattr(document.file, 'size', 0),
                        uploaded_by=document.owner or request.user,
                    )
                    doc.save()

                processor = DocumentProcessor(doc)
                processor.process_document()

                # Sauvegarder le HTML structuré
                document.structured_html = doc.formatted_content or ''
                document.structured_html_generated_at = timezone.now()
                document.structured_html_method = 'document_processor'
                document.structured_html_confidence = 0.0
                document.save()

                print(f"✅ HTML structuré généré lors de la validation du document {doc_id}")

            except Exception as e:
                print(f"⚠️ Erreur génération HTML lors de validation: {e}")
                messages.warning(request, f"Avertissement: Contenu structuré non généré: {str(e)}")

        # Extraction des pages (votre code existant)
        if not document.pages_extracted:
            try:
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

                    messages.success(request, f"Document validé ({document.total_pages} pages)")
                    create_product_from_metadata(document)
                    return redirect('rawdocs:document_list')

            except Exception as e:
                messages.error(request, f"Erreur lors de l'extraction: {str(e)}")
                return redirect('rawdocs:document_list')

    return render(request, 'rawdocs/validate_document.html', {'document': document})


# ——— Annotateur Views ——————————————————————————————

@login_required(login_url='rawdocs:login')
@user_passes_test(is_annotateur)
def annotation_dashboard(request):
    # Base queryset: documents prêts pour annotation
    docs = RawDocument.objects.filter(
        is_validated=True,
        pages_extracted=True
    ).order_by('-validated_at')

    from django.db.models import Q, F, Count, Sum

    # Annoter la queryset avec le nombre de pages annotées par document
    docs_with_progress = docs.annotate(
        annotated_pages_count=Count('pages', filter=Q(pages__is_annotated=True))
    )

    # Pagination pour le tableau (sur la queryset annotée)
    paginator = Paginator(docs_with_progress, 10)
    page = request.GET.get('page')
    documents_page = paginator.get_page(page)

    # KPI dynamiques
    total_documents = docs_with_progress.count()
    total_pages = docs_with_progress.aggregate(total=Sum('total_pages'))['total'] or 0

    # Nombre de pages annotées (toutes docs confondues)
    total_annotated_pages = DocumentPage.objects.filter(
        document__in=docs_with_progress,
        is_annotated=True
    ).count()

    # Documents complétés: toutes les pages annotées
    completed_count = docs_with_progress.filter(
        total_pages__gt=0,
        annotated_pages_count=F('total_pages')
    ).count()

    # Documents en cours: au moins 1 page annotée mais pas toutes
    in_progress_count = docs_with_progress.filter(
        annotated_pages_count__gt=0
    ).exclude(
        annotated_pages_count=F('total_pages')
    ).count()

    to_annotate_count = max(0, total_documents - in_progress_count - completed_count)

    avg_annotated_pages_per_doc = (total_annotated_pages / total_documents) if total_documents > 0 else 0

    context = {
        'documents': documents_page,
        'total_documents': total_documents,
        'total_pages': total_pages,
        'total_annotated_pages': total_annotated_pages,
        'in_progress_count': in_progress_count,
        'completed_count': completed_count,
        'to_annotate_count': to_annotate_count,
        'avg_annotated_pages_per_doc': avg_annotated_pages_per_doc,
    }

    return render(request, 'rawdocs/annotation_dashboard.html', context)


def annotate_document(request, doc_id):
    """Vue d'annotation mise à jour avec analyse réglementaire"""
    document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)
    pages = document.pages.all()
    pnum = int(request.GET.get('page', 1))
    page_obj = get_object_or_404(DocumentPage, document=document, page_number=pnum)

    # Statistiques d'analyse réglementaire
    regulatory_stats = {
        'total_pages': document.total_pages,
        'analyzed_pages': pages.filter(is_regulatory_analyzed=True).count(),
        'high_importance_pages': pages.filter(regulatory_importance_score__gte=70).count(),
    }
    regulatory_stats['completion_percentage'] = int(
        (regulatory_stats['analyzed_pages'] / regulatory_stats['total_pages'] * 100)) if regulatory_stats[
                                                                                             'total_pages'] > 0 else 0

    # Analyse globale du document
    try:
        global_analysis = document.regulatory_analysis
    except DocumentRegulatoryAnalysis.DoesNotExist:
        global_analysis = None

    # Build reduced, default annotation types + include types already used in this document
    used_type_ids = Annotation.objects.filter(page__document=document).values_list('annotation_type_id', flat=True).distinct()

    # Default whitelist (keywords-independent)
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

    return render(request, 'rawdocs/annotate_document.html', {
        'document': document,
        'pages': pages,
        'current_page': page_obj,
        'annotation_types': annotation_types,
        'existing_annotations': page_obj.annotations.all().order_by('start_pos'),
        'total_pages': document.total_pages,
        # Nouvelles données pour l'analyse réglementaire
        'regulatory_stats': regulatory_stats,
        'global_analysis': global_analysis,
        'page_analysis': page_obj.regulatory_analysis if page_obj.is_regulatory_analyzed else None,
        'page_summary': page_obj.page_summary,
        'page_importance_score': page_obj.regulatory_importance_score
    })



@login_required
@csrf_exempt
def save_manual_annotation(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
        page = get_object_or_404(DocumentPage, id=data['page_id'])
        atype = get_object_or_404(AnnotationType, id=data['type_id'])

        # Get mode from request, default to 'raw'
        mode = data.get('mode', 'raw')
        if mode not in ['raw', 'structured']:
            mode = 'raw'

        ann = Annotation.objects.create(
            page=page,
            annotation_type=atype,
            start_pos=data.get('start_pos', 0),
            end_pos=data.get('end_pos', 0),
            selected_text=data['selected_text'],
            confidence_score=100.0,
            created_by=request.user,
            source='manual',
            mode=mode,
            start_xpath=data.get('start_xpath'),
            end_xpath=data.get('end_xpath'),
            start_offset=data.get('start_offset'),
            end_offset=data.get('end_offset')
        )

        return JsonResponse({
            'success': True,
            'annotation_id': ann.id,
            'mode': ann.mode
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def get_page_annotations(request, page_id):
    try:
        page = get_object_or_404(DocumentPage, id=page_id)
        annotations = page.annotations.all().select_related('annotation_type').order_by('start_pos')

        anns = []
        for a in annotations:
            anns.append({
                'id': a.id,
                'start_pos': a.start_pos,
                'end_pos': a.end_pos,
                'selected_text': a.selected_text,
                'type': a.annotation_type.name,
                'type_display': a.annotation_type.display_name,
                'color': a.annotation_type.color,
                'confidence': a.confidence_score,
                'reasoning': a.ai_reasoning or '',
                'is_validated': getattr(a, 'is_validated', False),
                'mode': getattr(a, 'mode', 'raw'),
                'start_xpath': getattr(a, 'start_xpath', None),
                'end_xpath': getattr(a, 'end_xpath', None),
            })

        return JsonResponse({
            'success': True,
            'annotations': anns,
            'page_text': page.cleaned_text,
            'total_annotations': len(anns)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e),
            'annotations': [],
            'page_text': '',
            'total_annotations': 0
        })


@login_required
@csrf_exempt
def delete_annotation(request, annotation_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        # Utiliser une transaction explicite pour s'assurer de la cohérence
        from django.db import transaction

        with transaction.atomic():
            ann = get_object_or_404(Annotation, id=annotation_id)

            # Check permissions
            if ann.created_by != request.user and not request.user.groups.filter(name="Expert").exists():
                return JsonResponse({'error': 'Permission denied'}, status=403)

            # Store page reference before deletion
            page = ann.page
            annotation_text = ann.selected_text[:50]  # For logging

            # Log before deletion
            print(f"🗑️ Deleting annotation {annotation_id}: '{annotation_text}' from page {page.id}")

            # Delete the annotation
            ann.delete()

            # Force commit the transaction
            transaction.on_commit(lambda: print(f"✅ Annotation {annotation_id} committed to database"))

            # Check if page still has annotations
            remaining_annotations = page.annotations.count()
            print(f"📊 Remaining annotations on page {page.id}: {remaining_annotations}")

            if remaining_annotations == 0:
                page.is_annotated = False
                page.save()
                print(f"📄 Page {page.id} marked as not annotated")

        return JsonResponse({
            'success': True,
            'message': 'Annotation supprimée',
            'remaining_annotations': remaining_annotations,
            'debug_info': {
                'annotation_id': annotation_id,
                'page_id': page.id,
                'deleted_text': annotation_text,
                'remaining_count': remaining_annotations
            }
        })

    except Exception as e:
        print(f"❌ Error deleting annotation {annotation_id}: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@login_required
@csrf_exempt
def validate_page_annotations(request, page_id):
    """Validate page annotations with RLHF learning"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

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
        rlhf_annotator = RLHFGroqAnnotator()
        feedback_result = rlhf_annotator.process_human_feedback(
            page_id=page_id,
            ai_annotations=ai_session_data,
            human_annotations=current_annotations,
            annotator_id=request.user.id
        )

        # Update page status
        page.is_validated_by_human = True
        page.human_validated_at = datetime.now()
        page.validated_by = request.user
        page.save()

        # Clear session
        if ai_session_key in request.session:
            del request.session[ai_session_key]

        # If all pages of the document are validated by human, auto-submit for expert review
        doc = page.document
        try:
            total = doc.total_pages or doc.pages.count()
            validated = doc.pages.filter(is_validated_by_human=True).count()
            if total > 0 and validated >= total and not doc.is_ready_for_expert:
                doc.is_ready_for_expert = True
                doc.expert_ready_at = datetime.now()
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


@login_required
def get_learning_dashboard(request):
    """Get AI learning metrics dashboard"""
    try:
        # Get recent metrics
        recent_metrics = AILearningMetrics.objects.order_by('-created_at')[:10]

        # Prepare improvement data
        improvement_data = [{
            'date': m.created_at.strftime('%Y-%m-%d'),
            'f1_score': m.f1_score,
            'precision': m.precision_score,
            'recall': m.recall_score
        } for m in recent_metrics]

        # Get feedback stats
        total_feedbacks = AnnotationFeedback.objects.count()
        avg_feedback_score = AnnotationFeedback.objects.aggregate(
            avg_score=models.Avg('feedback_score')
        )['avg_score'] or 0

        # Get entity performance from latest metric
        latest_metric = recent_metrics.first()
        entity_performance = latest_metric.entity_performance if latest_metric else {}

        return JsonResponse({
            'total_feedbacks': total_feedbacks,
            'average_feedback_score': avg_feedback_score,
            'improvement_trend': improvement_data,
            'entity_performance': entity_performance,
            'learning_active': True
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@csrf_exempt
def ai_annotate_page_groq(request, page_id):
    """AI annotation with GROQ and RLHF for a single page.
    - Expects POST.
    - Optional JSON body: {"mode": "raw"|"structured"}
    - Stores AI annotations in session key "ai_annotations_{page_id}" for later RLHF feedback processing.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        # Permissions: only annotators or experts
        if not (is_annotateur(request.user) or is_expert(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        page = get_object_or_404(DocumentPage, id=page_id)

        # Parse body for optional parameters
        try:
            data = json.loads(request.body.decode('utf-8')) if request.body else {}
        except Exception:
            data = {}

        requested_mode = data.get('mode', 'raw')
        if requested_mode not in ['raw', 'structured']:
            requested_mode = 'raw'

        # Remove previous AI annotations on this page (we keep manual annotations if you prefer, adjust accordingly)
        page.annotations.all().delete()

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
            # session might be not writable or too large; ignore silently
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

                # Sanitize fields to match model constraints
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
                # Store percentage to remain backward compatible with existing UI (0-100)
                confidence_score = conf * 100 if conf <= 1.5 else conf

                Annotation.objects.create(
                    page=page,
                    annotation_type=ann_type,
                    start_pos=start,
                    end_pos=end,
                    selected_text=sel_text,
                    confidence_score=confidence_score,
                    ai_reasoning=ann_data.get('reasoning', 'GROQ classification'),
                    created_by=request.user
                )
                saved_count += 1
            except Exception as e:
                # log and continue with next annotation
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

@login_required
@csrf_exempt
def ai_annotate_document_groq(request, doc_id):
    """Annotation automatique d'un document complet avec Groq.
    - Expects POST.
    - Optional JSON body: {"mode": "raw"|"structured"}
    - Iterates pages and annotates each page; returns counts.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        # Permissions: annotator or expert
        if not (is_annotateur(request.user) or is_expert(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)

        # Parse optional params
        try:
            data = json.loads(request.body.decode('utf-8')) if request.body else {}
        except Exception:
            data = {}

        requested_mode = data.get('mode', 'raw')
        if requested_mode not in ['raw', 'structured']:
            requested_mode = 'raw'

        print(f"🔍 Démarrage annotation Groq document {doc_id} with mode: {requested_mode}")

        groq_annotator = GroqAnnotator()
        pages = document.pages.all().order_by('page_number')
        total_annotations = 0
        pages_annotated = 0

        for page in pages:
            try:
                print(f"📄 Annotation page {page.page_number}/{document.total_pages}")

                # Remove previous annotations for the page
                page.annotations.all().delete()

                page_data = {
                    'page_num': page.page_number,
                    'text': page.cleaned_text or "",
                    'char_count': len(page.cleaned_text or "")
                }

                annotations, schema = groq_annotator.annotate_page_with_groq(page_data)

                # Optionally store per-page session info (for RLHF feedback)
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

                        # Sanitize fields to match model constraints
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
                        # Store percentage to remain backward compatible with existing UI (0-100)
                        confidence_score = conf * 100 if conf <= 1.5 else conf

                        Annotation.objects.create(
                            page=page,
                            annotation_type=ann_type,
                            start_pos=start,
                            end_pos=end,
                            selected_text=sel_text,
                            confidence_score=confidence_score,
                            ai_reasoning=ann_data.get('reasoning', 'GROQ bulk annotation'),
                            created_by=request.user
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
                time.sleep(2)

            except Exception as e:
                print(f"❌ Erreur lors de l'annotation de la page {page.page_number}: {e}")
                continue

        print(f"✅ Annotation document terminée: {pages_annotated} pages, {total_annotations} annotations with mode={requested_mode}")

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

@login_required
def get_document_status(request, doc_id):
    """Get document validation status"""
    try:
        document = get_object_or_404(RawDocument, id=doc_id)
        total_pages = document.pages.count()
        validated_pages = document.pages.filter(is_validated_by_human=True).count()

        return JsonResponse({
            'total_pages': total_pages,
            'validated_pages': validated_pages,
            'is_ready_for_expert': document.is_ready_for_expert,
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@csrf_exempt
def submit_for_expert_review(request, doc_id):
    """Submit entire document for expert review"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        document = get_object_or_404(RawDocument, id=doc_id)
        document.is_ready_for_expert = True
        document.expert_ready_at = datetime.now()
        document.save()

        return JsonResponse({
            'success': True,
            'message': 'Document soumis pour révision expert!'
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@csrf_exempt
def create_annotation_type(request):
    """Create a new annotation type"""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
        name = data.get('name', '').strip().lower().replace(' ', '_')
        display_name = data.get('display_name', '').strip()

        if not name or not display_name:
            return JsonResponse({'error': 'Name and display name are required'}, status=400)

        # Check if already exists
        if AnnotationType.objects.filter(name=name).exists():
            return JsonResponse({'error': f'Annotation type "{display_name}" already exists'}, status=400)

        # Create new annotation type
        annotation_type = AnnotationType.objects.create(
            name=name,
            display_name=display_name,
            color='#6366f1',  # Default purple color
            description=f'Custom annotation type created by {request.user.username}'
        )

        return JsonResponse({
            'success': True,
            'annotation_type': {
                'id': annotation_type.id,
                'name': annotation_type.name,
                'display_name': annotation_type.display_name,
                'color': annotation_type.color
            },
            'message': f'Annotation type "{display_name}" created successfully!'
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@csrf_exempt
def delete_annotation_type(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        data = json.loads(request.body)
        type_id = data.get('type_id')

        if not type_id:
            return JsonResponse({'error': 'Type ID required'}, status=400)

        # Get the annotation type
        annotation_type = get_object_or_404(AnnotationType, id=type_id)

        # Count how many annotations will be deleted
        annotation_count = Annotation.objects.filter(annotation_type=annotation_type).count()

        display_name = annotation_type.display_name

        # FORCE DELETE: Delete all annotations using this type first
        if annotation_count > 0:
            deleted_annotations = Annotation.objects.filter(annotation_type=annotation_type).delete()
            print(f"🗑️ Deleted {annotation_count} annotations of type '{display_name}'")

        # Now delete the annotation type itself
        annotation_type.delete()

        # Create success message
        if annotation_count > 0:
            message = f'Annotation type "{display_name}" and {annotation_count} associated annotation(s) deleted successfully!'
        else:
            message = f'Annotation type "{display_name}" deleted successfully!'

        return JsonResponse({
            'success': True,
            'message': message,
            'deleted_annotations': annotation_count
        })

    except Exception as e:
        print(f"❌ Error deleting annotation type: {e}")
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def view_original_document(request, document_id):
    """View the original document PDF - RAWDOCS VERSION AMÉLIORÉE"""
    document = get_object_or_404(RawDocument, id=document_id)

    # Paramètre pour téléchargement direct
    download = request.GET.get('download', '0') == '1'

    # Case 1: Document has a local file
    if document.file:
        try:
            # Réinitialiser la position du fichier
            document.file.seek(0)

            # Lire le contenu du fichier
            file_content = document.file.read()

            # Vérifier que le fichier n'est pas vide
            if not file_content:
                raise Exception("Le fichier PDF est vide")

            # Créer la réponse HTTP
            response = HttpResponse(file_content, content_type='application/pdf')

            # Nom du fichier propre
            filename = document.file.name
            if not filename.lower().endswith('.pdf'):
                filename += '.pdf'

            # Headers pour l'affichage dans le navigateur ou téléchargement
            if download:
                response['Content-Disposition'] = f'attachment; filename="{filename}"'
            else:
                response['Content-Disposition'] = f'inline; filename="{filename}"'

            # Headers supplémentaires pour améliorer la compatibilité
            # Dans votre vue view_original_document, après la ligne response = HttpResponse(file_content, content_type='application/pdf')
            response['X-Frame-Options'] = 'SAMEORIGIN'  # Permettre iframe sur même domaine
            response['Content-Security-Policy'] = "frame-ancestors 'self'"
            response['X-PDF-Options'] = 'toolbar=yes,scrollbars=yes,location=no,menubar=yes'

            return response

        except Exception as e:
            # Logging pour débugger
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Erreur lors du chargement du PDF {document_id}: {str(e)}")

            # Page d'erreur avec plus d'informations
            error_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>Erreur - PDF non disponible</title>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 40px; background: #f8fafc; }}
                    .error-container {{ background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }}
                    .error-icon {{ font-size: 48px; color: #ef4444; margin-bottom: 20px; }}
                    h2 {{ color: #dc2626; margin: 0 0 16px 0; }}
                    p {{ color: #6b7280; line-height: 1.6; }}
                    .btn {{ background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-right: 10px; }}
                    .btn:hover {{ background: #2563eb; }}
                    .btn-secondary {{ background: #6b7280; }}
                    .btn-secondary:hover {{ background: #4b5563; }}
                    .details {{ background: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; }}
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">📄❌</div>
                    <h2>Fichier PDF non accessible</h2>
                    <p>Le fichier PDF n'a pas pu être chargé. Cela peut être dû à :</p>
                    <ul>
                        <li>Le fichier a été déplacé ou supprimé</li>
                        <li>Problème de permissions d'accès</li>
                        <li>Fichier corrompu</li>
                        <li>Problème temporaire du serveur</li>
                    </ul>

                    <div class="details">
                        <strong>Détails techniques :</strong><br>
                        Document ID: {document_id}<br>
                        Fichier: {document.file.name if document.file else 'N/A'}<br>
                        Erreur: {str(e)}
                    </div>

                    <div>
                        <a href="javascript:history.back()" class="btn">← Retour</a>
                        <a href="javascript:location.reload()" class="btn btn-secondary">🔄 Réessayer</a>
                    </div>
                </div>

                <script>
                    // Notifier le parent si on est dans une iframe
                    if (window.parent !== window) {{
                        window.parent.postMessage({{
                            type: 'pdf-load-error',
                            message: 'Erreur de chargement du PDF'
                        }}, '*');
                    }}
                </script>
            </body>
            </html>
            """
            return HttpResponse(error_html, status=500)

    # Case 2: Document was uploaded via URL
    elif document.url:
        try:
            if download:
                # Redirection vers l'URL pour téléchargement
                return redirect(document.url)
            else:
                # Pour les URLs, on redirige directement
                response = redirect(document.url)
                return response

        except Exception as e:
            error_html = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <title>URL non accessible</title>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 40px; background: #f8fafc; }}
                    .error-container {{ background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }}
                    .error-icon {{ font-size: 48px; color: #f59e0b; margin-bottom: 20px; }}
                    h2 {{ color: #d97706; margin: 0 0 16px 0; }}
                    p {{ color: #6b7280; line-height: 1.6; }}
                    .btn {{ background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; margin-right: 10px; }}
                    a {{ color: #3b82f6; }}
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">🌐❌</div>
                    <h2>URL non accessible</h2>
                    <p>L'URL source du document n'est pas accessible actuellement.</p>

                    <p><strong>URL source :</strong><br>
                    <a href="{document.url}" target="_blank">{document.url}</a></p>

                    <p>Vous pouvez essayer de :</p>
                    <ul>
                        <li><a href="{document.url}" target="_blank">Ouvrir l'URL directement dans un nouvel onglet</a></li>
                        <li>Vérifier votre connexion internet</li>
                        <li>Réessayer plus tard</li>
                    </ul>

                    <div>
                        <a href="javascript:history.back()" class="btn">← Retour</a>
                    </div>
                </div>

                <script>
                    if (window.parent !== window) {{
                        window.parent.postMessage({{
                            type: 'pdf-load-error',
                            message: 'URL non accessible'
                        }}, '*');
                    }}
                </script>
            </body>
            </html>
            """
            return HttpResponse(error_html, status=500)

    # Case 3: No file and no URL
    else:
        error_html = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Aucun fichier disponible</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; background: #f8fafc; }
                .error-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; text-align: center; }
                .error-icon { font-size: 48px; color: #6b7280; margin-bottom: 20px; }
                h2 { color: #374151; margin: 0 0 16px 0; }
                p { color: #6b7280; line-height: 1.6; }
                .btn { background: #3b82f6; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-icon">📄</div>
                <h2>Aucun fichier disponible</h2>
                <p>Ce document n'a ni fichier PDF ni URL source associé.</p>
                <a href="javascript:history.back()" class="btn">← Retour</a>
            </div>

            <script>
                if (window.parent !== window) {
                    window.parent.postMessage({
                        type: 'pdf-load-error',
                        message: 'Aucun fichier disponible'
                    }, '*');
                }
            </script>
        </body>
        </html>
        """
        return HttpResponse(error_html, status=404)


@login_required
def document_structured(request, document_id):
    """
    Affiche le contenu structuré (HTML) du document, comme dans Library.
    - Utilise le cache RawDocument.structured_html si présent
    - Utilise uniquement UltraAdvancedPDFExtractor (pas de fallback)
    - Permet forcer régénération via ?regen=1
    """
    try:
        document = RawDocument.objects.get(id=document_id)
        doc = None

        # Permissions identiques à tables/images
        if not request.user.is_staff and document.owner != request.user:
            messages.error(request, "Vous n'avez pas accès à ce document.")
            return redirect('rawdocs:document_list')

        # Charger/générer HTML structuré
        structured_html = document.structured_html or ''
        method = document.structured_html_method or ''
        confidence = document.structured_html_confidence
        regen = request.GET.get('regen') in ['1', 'true', 'True']

        if (regen or not structured_html) and getattr(document, 'file', None):
            try:
                from documents.models import Document as DocModel
                from documents.utils.document_processor import DocumentProcessor
                ext = os.path.splitext(document.file.name)[1].lower().lstrip('.')
                allowed = {'pdf', 'docx', 'doc', 'txt', 'html', 'xlsx', 'xls', 'rtf'}
                file_type = ext if ext in allowed else 'pdf'
                doc = DocModel.objects.filter(original_file=document.file.name,
                                              uploaded_by=document.owner or request.user).first()
                if not doc:
                    doc = DocModel(
                        title=document.title or os.path.basename(document.file.name),
                        original_file=document.file,
                        file_type=file_type,
                        file_size=getattr(document.file, 'size', 0),
                        uploaded_by=document.owner or request.user,
                    )
                    doc.save()
                processor = DocumentProcessor(doc)
                processor.process_document()
                structured_html = doc.formatted_content or ''
                method = 'document_processor'
                confidence = None
            except Exception as e:
                print(f"⚠️ DocumentProcessor failed: {e}")
                structured_html = ''
                method = 'document_processor'
                confidence = None

        # Sauvegarde cache si on a du contenu
        if structured_html:
            document.structured_html = structured_html
            document.structured_html_generated_at = timezone.now()
            document.structured_html_method = method
            document.structured_html_confidence = confidence
            document.save(update_fields=['structured_html', 'structured_html_generated_at', 'structured_html_method',
                                         'structured_html_confidence'])

        context = {
            'document': document,
            'structured_html': structured_html or '',
            'structured_html_method': method,
            'structured_html_confidence': confidence,
            'doc_model_id': getattr(doc, 'id', None),
        }
        return render(request, 'documents/document_structured.html', context)

    except RawDocument.DoesNotExist:
        messages.error(request, "Document non trouvé.")
        return redirect('rawdocs:document_list')
    except Exception as e:
        # Ne pas rediriger vers la page d'édition de métadonnées.
        # Rester sur la page de contenu structuré et afficher l'erreur.
        messages.error(request, f"Erreur lors de la génération du contenu structuré: {str(e)}")
        try:
            document = RawDocument.objects.get(id=document_id)
        except Exception:
            document = None
        context = {
            'document': document,
            'structured_html': '',
            'structured_html_method': '',
            'structured_html_confidence': None,
            'error': str(e),
            'doc_model_id': None,
        }
        return render(request, 'documents/document_structured.html', context)


@csrf_protect
@login_required
@require_POST
def save_structured_edits(request, document_id):
    try:
        # Lire le body par chunks pour éviter les dépassements mémoire
        body_unicode = request.body.decode('utf-8')

        # Vérifier la taille avant de parser
        body_size = len(body_unicode)
        max_size = 20 * 1024 * 1024  # 20MB

        if body_size > max_size:
            return JsonResponse({
                'success': False,
                'error': f'Données trop volumineuses ({body_size / 1024 / 1024:.1f}MB). Maximum autorisé: {max_size / 1024 / 1024}MB'
            }, status=413)

        data = json.loads(body_unicode)
        edits = data.get('edits', [])
        extraction_score = data.get('extraction_score', None)
        formatted_content = data.get('formatted_content')

        # Si c'est une sauvegarde complète du HTML (cas lourd)
        if (not edits) and formatted_content:
            document = get_object_or_404(RawDocument, id=document_id, owner=request.user)

            # Compresser le contenu si trop volumineux
            if len(formatted_content) > 5 * 1024 * 1024:  # 5MB
                print(
                    f"⚠️ Contenu HTML volumineux ({len(formatted_content) / 1024 / 1024:.1f}MB) - compression recommandée")

            document.structured_html = formatted_content
            document.structured_html_generated_at = timezone.now()
            document.structured_html_method = 'manual_edit'

            if extraction_score is not None:
                document.extraction_score = extraction_score

            document.save()

            return JsonResponse({
                'success': True,
                'message': 'Modifications sauvegardées avec succès',
                'updated_count': 0,
                'total_elements': 0,
                'extraction_score': extraction_score,
                'content_size': f"{len(formatted_content) / 1024 / 1024:.1f}MB"
            })

        # Traitement des modifications ponctuelles (plus léger)
        if not edits:
            return JsonResponse({'success': False, 'error': 'Aucune modification fournie'}, status=400)

        document = get_object_or_404(RawDocument, id=document_id, owner=request.user)
        if not document.structured_html:
            return JsonResponse({'success': False, 'error': 'Aucun HTML structuré à modifier'}, status=400)

        # Parser avec limite de taille
        html_size = len(document.structured_html)
        if html_size > 10 * 1024 * 1024:  # 10MB
            return JsonResponse({
                'success': False,
                'error': f'HTML trop volumineux pour modification ({html_size / 1024 / 1024:.1f}MB)'
            }, status=413)

        soup = BeautifulSoup(document.structured_html, 'html.parser')
        updated_count = 0
        total_elements = len(soup.find_all(class_='editable-content'))

        # Traitement des modifications avec limitation
        max_edits = 1000
        if len(edits) > max_edits:
            return JsonResponse({
                'success': False,
                'error': f'Trop de modifications ({len(edits)}). Maximum: {max_edits}'
            }, status=413)

        for edit in edits:
            element_id = edit.get('element_id')
            new_text = edit.get('new_text', '').strip()

            if not element_id:
                continue

            # Limiter la taille du nouveau texte
            if len(new_text) > 10000:  # 10KB par élément
                new_text = new_text[:10000]
                print(f"⚠️ Texte tronqué pour l'élément {element_id}")

            element = soup.find(attrs={'data-element-id': element_id})
            if element:
                old_text = element.get_text().strip()
                element.clear()
                element.string = new_text
                updated_count += 1

                # Log avec limitation
                MetadataLog.objects.create(
                    document=document,
                    field_name='edited_text_' + element_id[:50],  # Limiter la longueur
                    old_value=old_text[:1000],  # Limiter à 1KB
                    new_value=new_text[:1000],  # Limiter à 1KB
                    modified_by=request.user
                )

        if updated_count > 0:
            new_html = str(soup)

            # Vérifier la taille finale
            if len(new_html) > 15 * 1024 * 1024:  # 15MB
                return JsonResponse({
                    'success': False,
                    'error': f'HTML résultant trop volumineux ({len(new_html) / 1024 / 1024:.1f}MB)'
                }, status=413)

            document.structured_html = new_html
            if extraction_score is not None:
                document.extraction_score = extraction_score
            document.structured_html_generated_at = timezone.now()
            document.save()

        message = f'{updated_count} élément(s) mis à jour avec succès.'
        if extraction_score is not None:
            message += f' Score d\'extraction : {extraction_score:.2f}%'

        return JsonResponse({
            'success': True,
            'message': message,
            'updated_count': updated_count,
            'total_elements': total_elements,
            'extraction_score': extraction_score
        })

    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'JSON invalide'}, status=400)
    except MemoryError:
        return JsonResponse({'success': False, 'error': 'Mémoire insuffisante pour traiter cette requête'}, status=507)
    except Exception as e:
        print(f"Error in save_structured_edits: {str(e)}")
        return JsonResponse({'success': False, 'error': f'Erreur serveur: {str(e)}'}, status=500)


def manual_annotation_view(request):
    if request.method == 'POST':
        data = json.loads(request.body)

        annotation = Annotation.objects.create(
            page_id=data['page_id'],
            annotation_type_id=data['type_id'],
            selected_text=data['selected_text'],
            start_pos=data.get('start_pos', 0),
            end_pos=data.get('end_pos', 0),
            source='manual',
            # NEW FIELDS:
            mode=data.get('mode', 'raw'),
            start_xpath=data.get('start_xpath'),
            end_xpath=data.get('end_xpath'),
            start_offset=data.get('start_offset'),
            end_offset=data.get('end_offset')
        )

        return JsonResponse({'success': True, 'annotation_id': annotation.id})


@login_required
def document_detail(request, document_id):
    """
    Vue pour afficher les détails d'un document
    """
    try:
        document = get_object_or_404(RawDocument, id=document_id)

        # Vérifier les permissions
        if not request.user.is_staff and document.owner != request.user:
            messages.error(request, "Vous n'avez pas accès à ce document.")
            return redirect('rawdocs:document_list')

        # Ajouter basename pour le template
        document.basename = os.path.basename(document.file.name) if document.file else "Document sans fichier"

        context = {
            'doc': document,
            'document': document,
        }

        return render(request, 'rawdocs/details_metadata.html', context)

    except RawDocument.DoesNotExist:
        messages.error(request, "Document non trouvé.")
        return redirect('rawdocs:document_list')
    except Exception as e:
        messages.error(request, f"Erreur lors de l'affichage du document: {str(e)}")
        return redirect('rawdocs:document_list')


@login_required
def add_field_ajax(request):
    if request.method == 'POST':
        import json
        data = json.loads(request.body)
        name = data.get('name')
        field_type = data.get('type', 'text')
        doc_id = data.get('doc_id')  # Get document ID

        from .models import CustomField, CustomFieldValue, RawDocument

        # Get the document
        document = get_object_or_404(RawDocument, id=doc_id)

        # Get or create the field type globally (for field type reference)
        field, created = CustomField.objects.get_or_create(
            name=name,
            defaults={'field_type': field_type}
        )

        # Create the field value ONLY for this specific document
        custom_value, value_created = CustomFieldValue.objects.get_or_create(
            document=document,
            field=field,
            defaults={'value': ''}  # Empty value initially
        )

        if value_created:
            return JsonResponse({
                'success': True,
                'message': f'Field "{name}" added to this document only!'
            })
        else:
            return JsonResponse({
                'success': False,
                'message': f'Field "{name}" already exists for this document!'
            })

    return JsonResponse({'success': False})


@login_required
def save_custom_field(request):
    if request.method == 'POST':
        doc_id = request.POST.get('doc_id')
        field_name = request.POST.get('field_name')
        value = request.POST.get('value', '')

        from .models import RawDocument, CustomField, CustomFieldValue
        document = get_object_or_404(RawDocument, id=doc_id)
        field = get_object_or_404(CustomField, name=field_name)

        custom_value, created = CustomFieldValue.objects.get_or_create(
            document=document,
            field=field,
            defaults={'value': value}
        )
        if not created:
            custom_value.value = value
            custom_value.save()

        return JsonResponse({'success': True})

    return JsonResponse({'success': False})


def create_product_from_metadata(document):
    """Create product from custom metadata fields"""
    from .models import CustomFieldValue
    from client.products.models import Product

    # Find Product/Produit field (case insensitive)
    custom_values = CustomFieldValue.objects.filter(document=document)

    product_field = None
    product_name = None

    for custom_value in custom_values:
        field_name = custom_value.field.name.lower()
        if field_name in ['product', 'produit']:
            product_name = custom_value.value.strip()
            break

    if not product_name:
        return None

    # Create product with metadata fields
    product_data = {'name': product_name}

    # Auto-map matching fields
    field_mapping = {
        'dosage': 'dosage',
        'dose': 'dosage',
        'active_ingredient': 'active_ingredient',
        'substance_active': 'active_ingredient',
        'form': 'form',
        'forme': 'form',
        'therapeutic_area': 'therapeutic_area',
        'zone_therapeutique': 'therapeutic_area'
    }

    for custom_value in custom_values:
        field_name = custom_value.field.name.lower()
        if field_name in field_mapping and custom_value.value:
            product_data[field_mapping[field_name]] = custom_value.value

    # Create the product
    product = Product.objects.create(
        name=product_data['name'],
        dosage=product_data.get('dosage', ''),
        active_ingredient=product_data.get('active_ingredient', ''),
        form=product_data.get('form', ''),
        therapeutic_area=product_data.get('therapeutic_area', ''),
        status='commercialise',
        source_document=document
    )

    print(f"✅ Product '{product.name}' created from metadata!")
    return product


###############################
# rawdocs/views.py - AJOUTER ces vues au fichier existant

from .regulatory_analyzer import RegulatoryAnalyzer
from .models import DocumentRegulatoryAnalysis


# =================== NOUVELLES VUES POUR L'ANALYSE RÉGLEMENTAIRE ===================

@login_required
@csrf_exempt
def analyze_page_regulatory(request, page_id):
    """
    Analyse réglementaire d'une page spécifique avec GROQ
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        page = get_object_or_404(DocumentPage, id=page_id)

        # Vérifier les permissions (annotateur ou plus)
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        print(f"🔍 Lancement analyse réglementaire page {page.page_number}")

        # Initialiser l'analyseur
        analyzer = RegulatoryAnalyzer()

        # Obtenir le contexte du document
        document_context = f"{page.document.title} - {page.document.doc_type} - {page.document.source}"

        # Analyser la page
        analysis = analyzer.analyze_page_regulatory_content(
            page_text=page.cleaned_text,
            page_num=page.page_number,
            document_context=document_context
        )

        # Sauvegarder l'analyse dans la base de données
        page.regulatory_analysis = analysis
        page.page_summary = analysis.get('page_summary', '')
        page.regulatory_obligations = analysis.get('regulatory_obligations', [])
        page.critical_deadlines = analysis.get('critical_deadlines', [])
        page.regulatory_importance_score = analysis.get('regulatory_importance_score', 0)
        page.is_regulatory_analyzed = True
        page.regulatory_analyzed_at = datetime.now()
        page.regulatory_analyzed_by = request.user
        page.save()

        print(
            f"✅ Analyse réglementaire page {page.page_number} sauvegardée - Score: {page.regulatory_importance_score}")

        return JsonResponse({
            'success': True,
            'message': f'Page {page.page_number} analysée avec succès!',
            'analysis': analysis,
            'importance_score': page.regulatory_importance_score
        })

    except Exception as e:
        print(f"❌ Erreur analyse réglementaire page {page_id}: {e}")
        return JsonResponse({
            'error': f'Erreur lors de l\'analyse: {str(e)}'
        }, status=500)


@login_required
@csrf_exempt
def analyze_document_regulatory_bulk(request, doc_id):
    """
    Analyse réglementaire complète d'un document (toutes les pages)
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        print(f"🔍 Lancement analyse réglementaire complète document {doc_id}")

        # Initialiser l'analyseur
        analyzer = RegulatoryAnalyzer()
        document_context = f"{document.title} - {document.doc_type} - {document.source}"

        # Analyser toutes les pages
        pages = document.pages.all().order_by('page_number')
        analyses = []
        analyzed_count = 0

        for page in pages:
            try:
                print(f"📄 Analyse page {page.page_number}/{document.total_pages}")

                analysis = analyzer.analyze_page_regulatory_content(
                    page_text=page.cleaned_text,
                    page_num=page.page_number,
                    document_context=document_context
                )

                # Sauvegarder l'analyse
                page.regulatory_analysis = analysis
                page.page_summary = analysis.get('page_summary', '')
                page.regulatory_obligations = analysis.get('regulatory_obligations', [])
                page.critical_deadlines = analysis.get('critical_deadlines', [])
                page.regulatory_importance_score = analysis.get('regulatory_importance_score', 0)
                page.is_regulatory_analyzed = True
                page.regulatory_analyzed_at = datetime.now()
                page.regulatory_analyzed_by = request.user
                page.save()

                analyses.append(analysis)
                analyzed_count += 1

                # Pause pour éviter les limites d'API
                time.sleep(2)

            except Exception as e:
                print(f"❌ Erreur page {page.page_number}: {e}")
                continue

        # Générer le résumé global
        print(f"📊 Génération résumé global avec {len(analyses)} analyses...")
        global_analysis = analyzer.generate_document_global_summary(document, analyses)

        # Sauvegarder l'analyse globale
        doc_analysis, created = DocumentRegulatoryAnalysis.objects.update_or_create(
            document=document,
            defaults={
                'global_summary': global_analysis.get('global_summary', ''),
                'consolidated_analysis': global_analysis,
                'main_obligations': global_analysis.get('critical_compliance_requirements', []),
                'critical_deadlines_summary': global_analysis.get('key_deadlines_summary', []),
                'relevant_authorities': global_analysis.get('regulatory_authorities_involved', []),
                'global_regulatory_score': global_analysis.get('global_regulatory_score', 0),
                'analyzed_by': request.user,
                'total_pages_analyzed': analyzed_count,
                'pages_with_regulatory_content': sum(
                    1 for a in analyses if a.get('regulatory_importance_score', 0) > 30)
            }
        )

        print(f"✅ Analyse complète terminée: {analyzed_count} pages analysées")

        return JsonResponse({
            'success': True,
            'message': f'Document analysé avec succès! {analyzed_count} pages traitées.',
            'analyzed_pages': analyzed_count,
            'total_pages': document.total_pages,
            'global_score': global_analysis.get('global_regulatory_score', 0),
            'global_analysis': global_analysis
        })

    except Exception as e:
        print(f"❌ Erreur analyse document {doc_id}: {e}")
        return JsonResponse({
            'error': f'Erreur lors de l\'analyse: {str(e)}'
        }, status=500)


@login_required
def get_page_regulatory_analysis(request, page_id):
    """
    Récupère l'analyse réglementaire d'une page
    """
    try:
        page = get_object_or_404(DocumentPage, id=page_id)

        if not page.is_regulatory_analyzed:
            return JsonResponse({
                'analyzed': False,
                'message': 'Page non analysée'
            })

        return JsonResponse({
            'analyzed': True,
            'page_summary': page.page_summary,
            'importance_score': page.regulatory_importance_score,
            'regulatory_analysis': page.regulatory_analysis,
            'analyzed_at': page.regulatory_analyzed_at.isoformat() if page.regulatory_analyzed_at else None
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
def get_document_regulatory_summary(request, doc_id):
    """
    Récupère le résumé réglementaire global d'un document
    """
    try:
        document = get_object_or_404(RawDocument, id=doc_id)

        # Statistiques des pages
        total_pages = document.pages.count()
        analyzed_pages = document.pages.filter(is_regulatory_analyzed=True).count()
        high_importance_pages = document.pages.filter(regulatory_importance_score__gte=70).count()

        # Analyse globale si disponible
        try:
            global_analysis = document.regulatory_analysis
            has_global_analysis = True
        except DocumentRegulatoryAnalysis.DoesNotExist:
            global_analysis = None
            has_global_analysis = False

        # Résumé des pages importantes
        important_pages = []
        for page in document.pages.filter(regulatory_importance_score__gte=50).order_by('-regulatory_importance_score')[
                    :5]:
            important_pages.append({
                'page_number': page.page_number,
                'summary': page.page_summary,
                'score': page.regulatory_importance_score,
                'key_points': page.regulatory_analysis.get('key_regulatory_points',
                                                           []) if page.regulatory_analysis else []
            })

        return JsonResponse({
            'has_global_analysis': has_global_analysis,
            'stats': {
                'total_pages': total_pages,
                'analyzed_pages': analyzed_pages,
                'high_importance_pages': high_importance_pages,
                'completion_percentage': int((analyzed_pages / total_pages * 100)) if total_pages > 0 else 0
            },
            'global_summary': global_analysis.global_summary if global_analysis else '',
            'global_score': global_analysis.global_regulatory_score if global_analysis else 0,
            'consolidated_analysis': global_analysis.consolidated_analysis if global_analysis else {},
            'important_pages': important_pages
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# =================== MISE À JOUR DE LA VUE ANNOTATION EXISTANTE ===================

def annotate_document(request, doc_id):
    """Vue d'annotation mise à jour avec analyse réglementaire"""
    document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)
    pages = document.pages.all()
    pnum = int(request.GET.get('page', 1))
    page_obj = get_object_or_404(DocumentPage, document=document, page_number=pnum)

    # Statistiques d'analyse réglementaire
    regulatory_stats = {
        'total_pages': document.total_pages,
        'analyzed_pages': pages.filter(is_regulatory_analyzed=True).count(),
        'high_importance_pages': pages.filter(regulatory_importance_score__gte=70).count(),
    }
    regulatory_stats['completion_percentage'] = int(
        (regulatory_stats['analyzed_pages'] / regulatory_stats['total_pages'] * 100)) if regulatory_stats[
                                                                                             'total_pages'] > 0 else 0

    # Analyse globale du document
    try:
        global_analysis = document.regulatory_analysis
    except DocumentRegulatoryAnalysis.DoesNotExist:
        global_analysis = None

    # Build reduced, default annotation types + include types already used in this document
    used_type_ids = Annotation.objects.filter(page__document=document).values_list('annotation_type_id',
                                                                                   flat=True).distinct()

    # Default whitelist (keywords-independent)
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

    return render(request, 'rawdocs/annotate_document.html', {
        'document': document,
        'pages': pages,
        'current_page': page_obj,
        'annotation_types': annotation_types,
        'existing_annotations': page_obj.annotations.all().order_by('start_pos'),
        'total_pages': document.total_pages,
        # Nouvelles données pour l'analyse réglementaire
        'regulatory_stats': regulatory_stats,
        'global_analysis': global_analysis,
        'page_analysis': page_obj.regulatory_analysis if page_obj.is_regulatory_analyzed else None,
        'page_summary': page_obj.page_summary,
        'page_importance_score': page_obj.regulatory_importance_score
    })


# =================== VUE POUR LE DASHBOARD D'ANALYSE RÉGLEMENTAIRE ===================

@login_required
@user_passes_test(is_annotateur)
def regulatory_analysis_dashboard(request):
    """
    Dashboard spécialisé pour l'analyse réglementaire
    """
    # Documents disponibles pour analyse
    documents = RawDocument.objects.filter(
        is_validated=True,
        pages_extracted=True
    ).order_by('-validated_at')

    # Statistiques globales
    total_documents = documents.count()
    analyzed_documents = documents.filter(regulatory_analysis__isnull=False).count()

    # Documents avec analyse en cours ou complète
    documents_with_stats = []
    for doc in documents[:20]:  # Limiter pour performance
        analyzed_pages = doc.pages.filter(is_regulatory_analyzed=True).count()
        total_pages = doc.total_pages
        completion = int((analyzed_pages / total_pages * 100)) if total_pages > 0 else 0

        try:
            global_score = doc.regulatory_analysis.global_regulatory_score
        except DocumentRegulatoryAnalysis.DoesNotExist:
            global_score = 0

        documents_with_stats.append({
            'document': doc,
            'analyzed_pages': analyzed_pages,
            'total_pages': total_pages,
            'completion_percentage': completion,
            'global_score': global_score
        })

    context = {
        'documents_with_stats': documents_with_stats,
        'total_documents': total_documents,
        'analyzed_documents': analyzed_documents,
        'analysis_completion': int((analyzed_documents / total_documents * 100)) if total_documents > 0 else 0
    }

    return render(request, 'rawdocs/regulatory_analysis_dashboard.html', context)


# =================== VUES POUR L'ÉDITION DES ANNOTATIONS ===================

@login_required
@csrf_exempt
def edit_annotation(request, annotation_id):
    """
    Permet de modifier une annotation existante
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        data = json.loads(request.body)

        # Vérifier les champs requis
        required_fields = ['selected_text', 'annotation_type_id']
        for field in required_fields:
            if field not in data:
                return JsonResponse({'error': f'Champ requis manquant: {field}'}, status=400)

        # Obtenir le nouveau type d'annotation
        new_annotation_type = get_object_or_404(AnnotationType, id=data['annotation_type_id'])

        # Sauvegarder les anciennes valeurs pour logging
        old_values = {
            'selected_text': annotation.selected_text,
            'annotation_type': annotation.annotation_type.display_name,
            'start_pos': annotation.start_pos,
            'end_pos': annotation.end_pos
        }

        # Mettre à jour l'annotation
        annotation.selected_text = data['selected_text'].strip()
        annotation.annotation_type = new_annotation_type

        # Mettre à jour les positions si fournies
        if 'start_pos' in data:
            annotation.start_pos = int(data['start_pos'])
        if 'end_pos' in data:
            annotation.end_pos = int(data['end_pos'])

        # Marquer comme modifiée par un humain
        annotation.modified_by_human = True
        annotation.human_modified_at = timezone.now()
        annotation.last_modified_by = request.user

        # Ajouter une note sur la modification
        if annotation.ai_reasoning:
            annotation.ai_reasoning = f"[Modifié par {request.user.username}] {annotation.ai_reasoning}"
        else:
            annotation.ai_reasoning = f"Annotation modifiée par {request.user.username}"

        annotation.save()

        # Logger la modification (optionnel)
        print(f"✏️ Annotation {annotation_id} modifiée par {request.user.username}")
        print(f"   Ancien texte: '{old_values['selected_text']}'")
        print(f"   Nouveau texte: '{annotation.selected_text}'")
        print(f"   Ancien type: {old_values['annotation_type']}")
        print(f"   Nouveau type: {annotation.annotation_type.display_name}")

        return JsonResponse({
            'success': True,
            'message': 'Annotation modifiée avec succès',
            'annotation': {
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'annotation_type': {
                    'id': annotation.annotation_type.id,
                    'name': annotation.annotation_type.name,
                    'display_name': annotation.annotation_type.display_name,
                    'color': annotation.annotation_type.color
                },
                'confidence_score': annotation.confidence_score,
                'ai_reasoning': annotation.ai_reasoning,
                'start_pos': annotation.start_pos,
                'end_pos': annotation.end_pos,
                'modified_by_human': True
            }
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON invalide'}, status=400)
    except Exception as e:
        print(f"❌ Erreur modification annotation {annotation_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de la modification: {str(e)}'}, status=500)


@login_required
def get_annotation_details(request, annotation_id):
    """
    Récupère les détails d'une annotation pour l'édition
    """
    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        return JsonResponse({
            'success': True,
            'annotation': {
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'annotation_type': {
                    'id': annotation.annotation_type.id,
                    'name': annotation.annotation_type.name,
                    'display_name': annotation.annotation_type.display_name,
                    'color': annotation.annotation_type.color
                },
                'confidence_score': annotation.confidence_score,
                'ai_reasoning': annotation.ai_reasoning,
                'start_pos': annotation.start_pos,
                'end_pos': annotation.end_pos,
                'created_by': annotation.created_by.username if annotation.created_by else None,
                'modified_by_human': getattr(annotation, 'modified_by_human', False)
            }
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required(login_url='rawdocs:login')
@user_passes_test(is_dev_metier, login_url='rawdocs:login')
def dev_metier_dashboard(request):
    # Derniers documents validés par l'EXPERT (liste à droite)
    validated_documents = (
        RawDocument.objects
        .filter(is_expert_validated=True)
        .order_by('-expert_validated_at')[:100]
    )

    for doc in validated_documents:
        # Nom de fichier lisible dans le template
        doc.basename = os.path.basename(doc.file.name) if doc.file else ''

    # KPIs cohérents pour Dev Métier
    total_docs = RawDocument.objects.count()
    expert_validated_total = RawDocument.objects.filter(is_expert_validated=True).count()
    ready_for_expert_total = RawDocument.objects.filter(is_ready_for_expert=True).count()
    validated_metadonneur_total = RawDocument.objects.filter(is_validated=True).count()

    # Étapes exclusives pour la répartition
    uploaded_count = max(total_docs - validated_metadonneur_total, 0)  # déposés mais pas encore validés par métadonneur
    in_annotation_count = max(validated_metadonneur_total - ready_for_expert_total,
                              0)  # validés par métadonneur mais pas encore prêts expert
    awaiting_expert_count = max(ready_for_expert_total - expert_validated_total,
                                0)  # prêts expert mais pas encore validés expert

    processed_percent = int((expert_validated_total / total_docs) * 100) if total_docs else 0
    validated_percent = int((validated_metadonneur_total / total_docs) * 100) if total_docs else 0
    awaiting_percent = int(((uploaded_count + in_annotation_count) / total_docs) * 100) if total_docs else 0

    # Données pour graphiques
    # Bar: vue pipeline documents
    bar_data = json.dumps([
        total_docs,
        validated_metadonneur_total,
        ready_for_expert_total,
        expert_validated_total,
    ])

    # Pie: répartition des statuts exclusifs
    pie_data = json.dumps([
        uploaded_count,
        in_annotation_count,
        awaiting_expert_count,
        expert_validated_total,
    ])

    return render(request, 'rawdocs/dev_metier_dashboard.html', {
        "validated_documents": validated_documents,
        # KPIs
        "total_docs": total_docs,
        "expert_validated_total": expert_validated_total,
        "validated_metadonneur_total": validated_metadonneur_total,
        "uploaded_count": uploaded_count,
        "in_annotation_count": in_annotation_count,
        "awaiting_expert_count": awaiting_expert_count,
        "processed_percent": processed_percent,
        "validated_percent": validated_percent,
        "awaiting_percent": awaiting_percent,
        # Graph data
        "bar_data": bar_data,
        "pie_data": pie_data,
    })


# =================== NOUVELLES VUES POUR JSON ET RÉSUMÉS D'ANNOTATIONS ===================

from .regulatory_analyzer import RegulatoryAnalyzer

from collections import OrderedDict
from datetime import datetime


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


@login_required
@csrf_exempt
def generate_page_annotation_summary(request, page_id):
    """
    Produit un JSON minimaliste (doc info + entities) et un résumé
    basés uniquement sur {entité -> valeurs} pour UNE page.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        page = get_object_or_404(DocumentPage, id=page_id)

        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        # Récupérer les annotations de la page
        annotations = page.annotations.all().select_related('annotation_type').order_by('start_pos')

        # Construire entities -> [valeurs]
        entities = _build_entities_map(annotations, use_display_name=True)

        # JSON minimaliste
        page_json = {
            'document': {
                'id': str(page.document.id),
                'title': page.document.title,
                'doc_type': getattr(page.document, 'doc_type', None),
                'source': getattr(page.document, 'source', None),
            },
            'page': {
                'number': page.page_number,
                'annotations_count': annotations.count(),
            },
            'entities': entities,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }

        # Résumé à partir des seules entités/valeurs
        summary = generate_entities_based_page_summary(
            entities=entities,
            page_number=page.page_number,
            document_title=page.document.title
        )

        # Sauvegarde
        page.annotations_json = page_json
        page.annotations_summary = summary
        page.save(update_fields=['annotations_json', 'annotations_summary'])

        return JsonResponse({
            'success': True,
            'page_json': page_json,
            'summary': summary,
            'message': f'JSON et résumé générés pour la page {page.page_number}'
        })
    except Exception as e:
        print(f"❌ Erreur génération résumé page {page_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de la génération: {str(e)}'}, status=500)


@login_required
@csrf_exempt
def generate_document_annotation_summary(request, doc_id):
    """
    Produit un JSON global minimaliste (doc info + entities) et un résumé
    basés uniquement sur {entité -> valeurs} pour TOUT le document.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)

        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        pages = document.pages.all().order_by('page_number')

        # Agrégation globale des entités
        global_entities = OrderedDict()
        total_annotations_count = 0

        for page in pages:
            page_annotations = page.annotations.all().select_related('annotation_type').order_by('start_pos')
            total_annotations_count += page_annotations.count()

            page_entities = _build_entities_map(page_annotations, use_display_name=True)
            # Fusion {entité -> valeurs}
            for ent, vals in page_entities.items():
                if ent not in global_entities:
                    global_entities[ent] = []
                for v in vals:
                    if v not in global_entities[ent]:
                        global_entities[ent].append(v)

        global_json = {
            'document': {
                'id': str(document.id),
                'title': document.title,
                'doc_type': getattr(document, 'doc_type', None),
                'source': getattr(document, 'source', None),
                'total_pages': getattr(document, 'total_pages', pages.count()),
                'total_annotations': total_annotations_count,
            },
            'entities': global_entities,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }

        # Résumé global basé uniquement sur les entités/valeurs
        global_summary = generate_entities_based_document_summary(
            entities=global_entities,
            doc_title=document.title,
            doc_type=getattr(document, 'doc_type', None),
            total_annotations=total_annotations_count
        )

        document.global_annotations_json = global_json
        document.global_annotations_summary = global_summary
        document.save(update_fields=['global_annotations_json', 'global_annotations_summary'])

        return JsonResponse({
            'success': True,
            'global_json': global_json,
            'global_summary': global_summary,
            'stats': {
                'total_pages': getattr(document, 'total_pages', pages.count()),
                'total_annotations': total_annotations_count,
                'entities_count': len(global_entities)
            },
            'message': 'JSON global et résumé générés pour le document complet'
        })
    except Exception as e:
        print(f"❌ Erreur génération résumé document {doc_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de la génération: {str(e)}'}, status=500)


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


@login_required
def view_page_annotation_json(request, page_id):
    """
    Affiche le JSON et résumé d'une page dans une vue dédiée
    """
    try:
        page = get_object_or_404(DocumentPage, id=page_id)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            messages.error(request, "Permission denied")
            return redirect('rawdocs:annotation_dashboard')

        # Si pas encore généré, le générer
        if not hasattr(page, 'annotations_json') or not page.annotations_json:
            # Déclencher la génération
            from django.test import RequestFactory
            factory = RequestFactory()
            fake_request = factory.post(f'/generate-page-annotation-summary/{page_id}/')
            fake_request.user = request.user
            generate_page_annotation_summary(fake_request, page_id)
            page.refresh_from_db()

        context = {
            'page': page,
            'document': page.document,
            'annotations_json': page.annotations_json if hasattr(page, 'annotations_json') else None,
            'annotations_summary': page.annotations_summary if hasattr(page, 'annotations_summary') else None,
            'total_annotations': page.annotations.count()
        }

        return render(request, 'rawdocs/view_page_annotation_json.html', context)

    except Exception as e:
        messages.error(request, f"Erreur: {str(e)}")
        return redirect('rawdocs:annotation_dashboard')


@login_required
@user_passes_test(is_dev_metier)
@csrf_exempt
def dev_metier_generate_page_annotation_summary(request, page_id):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        page = get_object_or_404(DocumentPage, id=page_id)

        # Récupérer les annotations de la page
        annotations = page.annotations.all().select_related('annotation_type').order_by('start_pos')

        # Construire entities -> [valeurs]
        entities = _build_entities_map(annotations, use_display_name=True)

        # JSON minimaliste de la page
        page_json = {
            'document': {
                'id': str(page.document.id),
                'title': page.document.title,
                'doc_type': getattr(page.document, 'doc_type', None),
                'source': getattr(page.document, 'source', None),
            },
            'page': {
                'number': page.page_number,
                'annotations_count': annotations.count(),
            },
            'entities': entities,
            'generated_at': datetime.utcnow().isoformat() + 'Z',
        }

        # Résumé basé sur les entités de la page
        summary = generate_entities_based_page_summary(
            entities=entities,
            page_number=page.page_number,
            document_title=page.document.title
        )

        # Sauvegarde avec timestamp
        page.annotations_json = page_json
        page.annotations_summary = summary
        page.annotations_summary_generated_at = timezone.now()  # ⭐ NOUVEAU
        page.save(update_fields=['annotations_json', 'annotations_summary', 'annotations_summary_generated_at'])

        return JsonResponse({'success': True, 'page_json': page_json, 'summary': summary})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required(login_url='rawdocs:login')
@user_passes_test(is_dev_metier, login_url='rawdocs:login')
def dev_metier_document_annotation_json(request, doc_id):
    document = get_object_or_404(RawDocument, id=doc_id, is_expert_validated=True)

    # Générer le JSON global si absent avec gestion d'erreur
    if not document.global_annotations_json:
        try:
            from django.test import RequestFactory
            fake = RequestFactory().post(f'/expert/annotation/document/{doc_id}/generate-summary/')
            fake.user = request.user
            # Appel à la fonction de génération (à adapter selon votre structure)
            generate_document_annotation_summary(fake, doc_id)
            document.refresh_from_db()
        except Exception as e:
            messages.warning(request, f"Génération globale non effectuée : {e}")

    # Gestion de la page sélectionnée avec meilleure gestion d'erreur
    selected_page_number = request.GET.get('page') or None
    page_json = None
    page_summary = None

    if selected_page_number:
        try:
            page_num = int(selected_page_number)
            page = DocumentPage.objects.get(document=document, page_number=page_num)

            # Générer le JSON de la page si absent
            if not page.annotations_json:
                from django.test import RequestFactory
                fake = RequestFactory().post(f'/dev-metier/annotation/page/{page.id}/generate-summary/')
                fake.user = request.user
                dev_metier_generate_page_annotation_summary(fake, page.id)  # ⭐ NOUVEAU
                page.refresh_from_db()

            page_json = page.annotations_json or {}
            page_summary = page.annotations_summary or ""
        except (ValueError, DocumentPage.DoesNotExist):
            messages.error(request, f"Page {selected_page_number} introuvable pour ce document.")

    pages = document.pages.all().order_by('page_number')

    context = {
        'document': document,
        'global_annotations_json': document.global_annotations_json or {},
        'global_annotations_summary': document.global_annotations_summary or "",
        'page_json': page_json,
        'page_summary': page_summary,
        'pages': pages,
        'selected_page_number': selected_page_number,
        'total_annotations': sum(p.annotations.count() for p in document.pages.all()),
        'annotated_pages': document.pages.filter(annotations__isnull=False).distinct().count(),
        'total_pages': document.total_pages,
    }



@login_required
def view_document_annotation_json(request, doc_id):
    """
    Affiche le JSON global et résumé du document dans une vue dédiée avec édition pour expert
    """
    try:
        document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            messages.error(request, "Permission denied")
            return redirect('rawdocs:annotation_dashboard')

        # Si pas encore généré, le générer
        if not hasattr(document, 'global_annotations_json') or not document.global_annotations_json:
            # Déclencher la génération
            from django.test import RequestFactory
            factory = RequestFactory()
            fake_request = factory.post(f'/generate-document-annotation-summary/{doc_id}/')
            fake_request.user = request.user
            generate_document_annotation_summary(fake_request, doc_id)
            document.refresh_from_db()

        # Statistiques
        total_annotations = sum(page.annotations.count() for page in document.pages.all())
        annotated_pages = document.pages.filter(annotations__isnull=False).distinct().count()

        context = {
            'document': document,
            'global_annotations_json': document.global_annotations_json if hasattr(document,
                                                                                   'global_annotations_json') else None,
            'global_annotations_summary': document.global_annotations_summary if hasattr(document,
                                                                                         'global_annotations_summary') else None,
            'total_annotations': total_annotations,
            'annotated_pages': annotated_pages,
            'total_pages': document.total_pages
        }

        return render(request, 'rawdocs/view_document_annotation_json.html', context)

    except Exception as e:
        messages.error(request, f"Erreur: {str(e)}")
        return redirect('rawdocs:annotation_dashboard')


##################edit################
# Ajouter cette nouvelle vue dans rawdocs/views.py

@login_required
@csrf_exempt
def edit_annotation(request, annotation_id):
    """
    Permet de modifier une annotation existante
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        data = json.loads(request.body)

        # Vérifier les champs requis
        required_fields = ['selected_text', 'annotation_type_id']
        for field in required_fields:
            if field not in data:
                return JsonResponse({'error': f'Champ requis manquant: {field}'}, status=400)

        # Obtenir le nouveau type d'annotation
        new_annotation_type = get_object_or_404(AnnotationType, id=data['annotation_type_id'])

        # Sauvegarder les anciennes valeurs pour logging
        old_values = {
            'selected_text': annotation.selected_text,
            'annotation_type': annotation.annotation_type.display_name,
            'start_pos': annotation.start_pos,
            'end_pos': annotation.end_pos
        }

        # Mettre à jour l'annotation
        annotation.selected_text = data['selected_text'].strip()
        annotation.annotation_type = new_annotation_type

        # Mettre à jour les positions si fournies
        if 'start_pos' in data:
            annotation.start_pos = int(data['start_pos'])
        if 'end_pos' in data:
            annotation.end_pos = int(data['end_pos'])

        # Marquer comme modifiée par un humain
        annotation.modified_by_human = True
        annotation.human_modified_at = timezone.now()
        annotation.last_modified_by = request.user

        # Ajouter une note sur la modification
        if annotation.ai_reasoning:
            annotation.ai_reasoning = f"[Modifié par {request.user.username}] {annotation.ai_reasoning}"
        else:
            annotation.ai_reasoning = f"Annotation modifiée par {request.user.username}"

        annotation.save()

        # Logger la modification (optionnel)
        print(f"✏️ Annotation {annotation_id} modifiée par {request.user.username}")
        print(f"   Ancien texte: '{old_values['selected_text']}'")
        print(f"   Nouveau texte: '{annotation.selected_text}'")
        print(f"   Ancien type: {old_values['annotation_type']}")
        print(f"   Nouveau type: {annotation.annotation_type.display_name}")

        return JsonResponse({
            'success': True,
            'message': 'Annotation modifiée avec succès',
            'annotation': {
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'annotation_type': {
                    'id': annotation.annotation_type.id,
                    'name': annotation.annotation_type.name,
                    'display_name': annotation.annotation_type.display_name,
                    'color': annotation.annotation_type.color
                },
                'confidence_score': annotation.confidence_score,
                'ai_reasoning': annotation.ai_reasoning,
                'start_pos': annotation.start_pos,
                'end_pos': annotation.end_pos,
                'modified_by_human': True
            }
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON invalide'}, status=400)
    except Exception as e:
        print(f"❌ Erreur modification annotation {annotation_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de la modification: {str(e)}'}, status=500)


@login_required
def get_annotation_details(request, annotation_id):
    """
    Récupère les détails d'une annotation pour l'édition
    """
    try:
        annotation = get_object_or_404(Annotation, id=annotation_id)

        # Vérifier les permissions
        if not (is_annotateur(request.user) or is_expert(request.user) or is_metadonneur(request.user)):
            return JsonResponse({'error': 'Permission denied'}, status=403)

        return JsonResponse({
            'success': True,
            'annotation': {
                'id': annotation.id,
                'selected_text': annotation.selected_text,
                'annotation_type': {
                    'id': annotation.annotation_type.id,
                    'name': annotation.annotation_type.name,
                    'display_name': annotation.annotation_type.display_name,
                    'color': annotation.annotation_type.color
                },
                'confidence_score': annotation.confidence_score,
                'ai_reasoning': annotation.ai_reasoning,
                'start_pos': annotation.start_pos,
                'end_pos': annotation.end_pos,
                'created_by': annotation.created_by.username if annotation.created_by else None,
                'modified_by_human': getattr(annotation, 'modified_by_human', False)
            }
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# =================== NOUVELLES VUES POUR L'ÉDITION DU RÉSUMÉ GLOBAL PAR L'EXPERT ===================

from .models import GlobalSummaryEditHistory  # Import du modèle depuis models.py


@login_required
@user_passes_test(is_expert)
@csrf_exempt
def edit_global_summary(request, doc_id):
    """
    Permet à l'expert de modifier le résumé global du document
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        document = get_object_or_404(RawDocument, id=doc_id)
        data = json.loads(request.body)

        if 'summary' not in data:
            return JsonResponse({'error': 'Résumé manquant'}, status=400)

        # Sauvegarder l'ancien résumé pour l'historique
        old_summary = document.global_annotations_summary or ""
        new_summary = data['summary'].strip()

        # Créer une entrée dans l'historique
        GlobalSummaryEditHistory.objects.create(
            document=document,
            old_summary=old_summary,
            new_summary=new_summary,
            modified_by=request.user,
            reason=data.get('reason', 'Modification expert')
        )

        # Mettre à jour le résumé
        document.global_annotations_summary = new_summary
        document.save(update_fields=['global_annotations_summary'])

        return JsonResponse({
            'success': True,
            'message': 'Résumé global mis à jour avec succès',
            'summary': new_summary
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON invalide'}, status=400)
    except Exception as e:
        print(f"❌ Erreur modification résumé global du document {doc_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de la modification: {str(e)}'}, status=500)


@login_required
@user_passes_test(is_expert)
def get_global_summary_history(request, doc_id):
    """
    Récupère l'historique des modifications du résumé global
    """
    try:
        document = get_object_or_404(RawDocument, id=doc_id)
        history = GlobalSummaryEditHistory.objects.filter(
            document=document
        ).order_by('-modified_at')

        history_data = [{
            'old_summary': entry.old_summary,
            'new_summary': entry.new_summary,
            'modified_by': entry.modified_by.username if entry.modified_by else "Système",
            'modified_at': entry.modified_at.isoformat(),
            'reason': entry.reason
        } for entry in history]

        return JsonResponse({
            'success': True,
            'history': history_data
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


@login_required
@user_passes_test(is_expert)
@csrf_exempt
def validate_global_summary(request, doc_id):
    """
    Permet à l'expert de valider le résumé global
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    try:
        document = get_object_or_404(RawDocument, id=doc_id)
        data = json.loads(request.body)

        # Marquer comme validé par l'expert
        document.global_summary_validated = True
        document.global_summary_validated_at = timezone.now()
        document.global_summary_validated_by = request.user
        document.expert_comments = data.get('comments', '')
        document.save()

        return JsonResponse({
            'success': True,
            'message': 'Résumé global validé avec succès'
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'JSON invalide'}, status=400)
    except Exception as e:
        print(f"❌ Erreur validation résumé global du document {doc_id}: {e}")
        return JsonResponse({'error': f'Erreur lors de la validation: {str(e)}'}, status=500)


@login_required
@user_passes_test(is_metadonneur)
def metadata_learning_dashboard(request):
    """Dashboard showing AI learning statistics with proper calculations"""
    try:
        from .models import MetadataFeedback, MetadataLearningMetrics

        total_feedbacks = MetadataFeedback.objects.count()

        if total_feedbacks == 0:
            return render(request, 'rawdocs/learning_dashboard.html', {
                'no_data': True
            })

        # Calculate average score
        avg_score = MetadataFeedback.objects.aggregate(
            avg=models.Avg('feedback_score')
        )['avg'] or 0

        # Field performance with percentages calculated
        field_stats = {}
        document_stats = {}  # NEW: Track per-document performance

        for feedback in MetadataFeedback.objects.all():
            corrections = feedback.corrections_made
            doc_id = feedback.document.id
            doc_title = feedback.document.title or f"Document {doc_id}"

            # Initialize document stats
            if doc_id not in document_stats:
                document_stats[doc_id] = {
                    'title': doc_title,
                    'correct': 0,
                    'wrong': 0,
                    'missed': 0,
                    'precision': 0
                }

            for kept in corrections.get('kept_correct', []):
                field = kept.get('field')
                if field not in field_stats:
                    field_stats[field] = {'correct': 0, 'wrong': 0, 'missed': 0}
                field_stats[field]['correct'] += 1
                document_stats[doc_id]['correct'] += 1

            for wrong in corrections.get('corrected_fields', []):
                field = wrong.get('field')
                if field not in field_stats:
                    field_stats[field] = {'correct': 0, 'wrong': 0, 'missed': 0}
                field_stats[field]['wrong'] += 1
                document_stats[doc_id]['wrong'] += 1

            for missed in corrections.get('missed_fields', []):
                field = missed.get('field')
                if field not in field_stats:
                    field_stats[field] = {'correct': 0, 'wrong': 0, 'missed': 0}
                field_stats[field]['missed'] += 1
                document_stats[doc_id]['missed'] += 1

        # Calculate precision percentages
        for field, stats in field_stats.items():
            total = stats['correct'] + stats['wrong'] + stats['missed']
            stats['precision'] = int((stats['correct'] / total * 100)) if total > 0 else 0

        for doc_id, stats in document_stats.items():
            total = stats['correct'] + stats['wrong'] + stats['missed']
            stats['precision'] = int((stats['correct'] / total * 100)) if total > 0 else 0

        # Get improvement trend
        feedbacks = MetadataFeedback.objects.order_by('created_at')
        improvement = 0
        if feedbacks.count() >= 2:
            first_score = feedbacks.first().feedback_score * 100
            last_score = feedbacks.last().feedback_score * 100
            improvement = int(last_score - first_score)

        return render(request, 'rawdocs/learning_dashboard.html', {
            'total_feedbacks': total_feedbacks,
            'avg_score': int(avg_score * 100),
            'field_stats': field_stats,
            'document_stats': document_stats,  # NEW: Pass document stats
            'improvement': improvement,
            'has_data': True
        })

    except Exception as e:
        print(f"Learning dashboard error: {e}")
        return render(request, 'rawdocs/learning_dashboard.html', {'error': str(e)})


@login_required
def metadata_learning_api(request):
    """API for learning stats"""
    try:
        from .models import MetadataFeedback

        total = MetadataFeedback.objects.count()
        avg = MetadataFeedback.objects.aggregate(avg=models.Avg('feedback_score'))['avg'] or 0

        return JsonResponse({
            'total_feedbacks': total,
            'average_score': avg * 100,
            'learning_active': total > 0
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
from django.shortcuts import get_object_or_404


@require_http_methods(["POST"])
def clear_page_annotations(request, page_id):
    try:
        page = get_object_or_404(DocumentPage, id=page_id)
        page.annotations.all().delete()
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)})



        return JsonResponse({'success': False, 'error': 'Méthode non autorisée'}, status=405)

    try:
        # 1) Charger le doc validé (même logique qu’avant)
        document = get_object_or_404(RawDocument, id=doc_id, is_validated=True)

        # 2) Sécurité groupe
        if not is_dev_metier(request.user):
            return JsonResponse({'success': False, 'error': 'Permission refusée'}, status=403)

        # 3) Parser JSON
        data = json.loads(request.body)
        json_content = data.get('json_content')
        if json_content is None:
            return JsonResponse({'success': False, 'error': 'Contenu JSON manquant'}, status=400)
        try:
            json.dumps(json_content)  # vérifie sérialisable
        except (TypeError, ValueError):
            return JsonResponse({'success': False, 'error': 'JSON invalide'}, status=400)

        # 4) Historique (ancien JSON)
        old_json = document.global_annotations_json or {}

        # 5) Sauvegarde côté Django (SQLite) - complète (pas update_fields)
        document.global_annotations_json = json_content
        document.save()

        # 6) Sauvegarde Mongo (UPsert par rawdoc_id)
        mongo_write = {'matched': None, 'modified': None, 'upserted': None}
        if _mongo_coll is not None:
            payload = {
                "rawdoc_id": int(doc_id),
                "title": getattr(document, "title", None),
                "file_name": getattr(document, "file_name", None),
                "owner": getattr(getattr(document, "owner", None), "username", None),
                "total_pages": getattr(document, "total_pages", None),
                "global_annotations_json": json_content,
                "updated_at": timezone.now(),
                "updated_by": request.user.username,
            }
            res = _mongo_coll.update_one(
                {"rawdoc_id": int(doc_id)},
                {"$set": payload},
                upsert=True,
            )
            mongo_write = {
                'matched': res.matched_count,
                'modified': res.modified_count,
                'upserted': getattr(res, "upserted_id", None) is not None
            }
            print(
                f"✅ Mongo write d{doc_id}: matched={res.matched_count} modified={res.modified_count} upserted={getattr(res, 'upserted_id', None)}")
        else:
            print("⚠️ Pas de connexion Mongo (_mongo_coll is None)")

        # 7) Historique application
        GlobalSummaryEditHistory.objects.create(
            document=document,
            old_summary=json.dumps(old_json),
            new_summary=json.dumps(json_content),
            modified_by=request.user,
            reason='Modification JSON via éditeur Dev Métier'
        )

        return JsonResponse({
            'success': True,
            'message': 'JSON global sauvegardé dans MongoDB',
            'mongo': mongo_write
        })

    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'JSON invalide dans la requête'}, status=400)
    except Exception as e:
        print(f"❌ Erreur sauvegarde JSON document {doc_id}: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required
@require_POST
def mistral_suggest_annotations(request, page_id):
    """
    Endpoint API pour suggérer des annotations à l'aide de Mistral AI
    Cette fonction utilise l'API Mistral pour analyser le texte d'une page
    et générer des suggestions d'entités à annoter

    Si un document_id est fourni dans le corps de la requête et que le page_id est fictif (1),
    nous utilisons le document_id pour trouver la première page non annotée
    """
    from .annotation_utils import call_mistral_annotation  # Import ici pour éviter les imports circulaires
    from .models import DocumentPage, Annotation, AnnotationType, Document

    try:
        # Vérifier si nous avons reçu un document_id dans le corps de la requête
        data = json.loads(request.body.decode('utf-8')) if request.body else {}
        document_id = data.get('document_id')

        # Si nous avons un document_id et que le page_id est l'ID fictif (1)
        if document_id and page_id == 1:
            # Récupérer le document
            document = get_object_or_404(Document, id=document_id)

            # Vérifier les permissions
            if not document.is_accessible_by(request.user):
                return JsonResponse({'success': False, 'error': 'Accès non autorisé'}, status=403)

            # Trouver la première page du document
            page = DocumentPage.objects.filter(document=document).order_by('page_number').first()

            if not page:
                return JsonResponse({'success': False, 'error': 'Aucune page trouvée pour ce document'}, status=404)

        else:
            # Récupérer la page directement par son ID
            page = get_object_or_404(DocumentPage, id=page_id)
            document = page.document

            # Vérifier les permissions
            if not document.is_accessible_by(request.user):
                return JsonResponse({'success': False, 'error': 'Accès non autorisé'}, status=403)

        # Supprimer les annotations existantes sur cette page
        Annotation.objects.filter(page=page).delete()

        # Obtenir le texte de la page
        page_text = page.cleaned_text or ""

        # Appeler l'API Mistral pour obtenir des suggestions d'annotations
        annotations_data = call_mistral_annotation(page_text, page.page_number)

        # Créer les nouvelles annotations basées sur les suggestions de Mistral
        created_count = 0
        for ann_data in annotations_data:
            # Vérifier que les données sont valides
            if not (isinstance(ann_data, dict) and 'text' in ann_data and 'type' in ann_data and
                    'start_pos' in ann_data and 'end_pos' in ann_data):
                continue

            # Récupérer ou créer le type d'annotation
            ann_type_name = ann_data['type'].lower().strip()
            ann_type, created = AnnotationType.objects.get_or_create(
                name=ann_type_name,
                defaults={
                    'color': '#' + ''.join([format(hash(ann_type_name) % 256, '02x') for _ in range(3)]),
                    'description': f"Type détecté par Mistral AI: {ann_type_name}"
                }
            )

            # Créer l'annotation
            annotation = Annotation.objects.create(
                page=page,
                text=ann_data['text'],
                start_pos=ann_data['start_pos'],
                end_pos=ann_data['end_pos'],
                annotation_type=ann_type,
                confidence=ann_data.get('confidence', 0.75),
                created_by=request.user,
                is_ai_generated=True,
                ai_reasoning=ann_data.get('reasoning', 'Détecté par Mistral AI')
            )
            created_count += 1

        # Construire l'URL de redirection vers la page d'annotation
        redirect_url = f"/rawdocs/annotate/{document.id}/?page={page.page_number}"

        return JsonResponse({
            'success': True,
            'message': f'Mistral AI a suggéré {created_count} annotations',
            'annotations_count': created_count,
            'redirect_url': redirect_url
        })

    except Exception as e:
        print(f"❌ Erreur lors de la suggestion d'annotations avec Mistral: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required
@require_POST
def test_mistral_page(request):
    """
    Page de test pour le fonctionnement de Mistral Annotation
    """
    return render(request, 'rawdocs/test_mistral.html')


def mistral_direct_analysis(request):
    """
    Analyse directe d'un texte avec Mistral AI sans l'associer à une page de document
    Utilisé principalement pour la page de test
    """
    import json
    import traceback
    from django.http import JsonResponse
    from .annotation_utils import call_mistral_annotation

    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Méthode HTTP non autorisée'}, status=405)

    try:
        data = json.loads(request.body)
        text = data.get('text')
        page_number = data.get('page_number', 1)

        if not text:
            return JsonResponse({'success': False, 'error': 'Aucun texte fourni'}, status=400)

        # Limiter la taille du texte pour éviter les abus
        if len(text) > 10000:
            return JsonResponse({'success': False, 'error': 'Texte trop long (max 10000 caractères)'}, status=400)

        # Appel à l'API Mistral
        print(f"🔍 Analyse directe Mistral d'un texte de {len(text)} caractères")
        annotations_data = call_mistral_annotation(text, page_number)

        return JsonResponse({
            'success': True,
            'annotations': annotations_data,
            'text_length': len(text)
        })

    except Exception as e:
        traceback.print_exc()
        print(f"❌ Exception lors de l'analyse Mistral: {e}")
        return JsonResponse({
            'success': False,
            'error': f"Une erreur est survenue lors de l'analyse: {str(e)}"
        }, status=500)


def mistral_analyze_document(request, document_id):
    """
    Analyse un document avec Mistral AI pour proposer des types d'entités d'annotation pertinents
    en fonction du contexte et de la langue du document.
    """
    from .annotation_utils import analyze_document_context_with_mistral
    import traceback

    # Débogage: Ajouter des logs au début
    print(f"🔵 API mistral_analyze_document appelée pour document_id={document_id}")
    print(f"🔵 Méthode: {request.method}, Utilisateur: {request.user}")

    # Pour débogage: Retourner un succès simulé pour tester la redirection
    if request.GET.get('debug') == '1':
        print("🟠 MODE DEBUG: Retour d'une réponse simulée")
        first_page = 1
        return JsonResponse({
            'success': True,
            'message': "Test de redirection réussi",
            'document_domain': "Test",
            'document_language': "fr",
            'entity_types': [
                {"id": 1, "name": "test", "display_name": "Test", "description": "Entité de test", "color": "#FF5733"}
            ],
            'entity_types_count': 1,
            'annotation_url': f"/rawdocs/annotate_document/{document_id}/?page=1"
        })

    try:
        # Récupérer le document
        document = get_object_or_404(RawDocument, id=document_id)

        # Vérifier que l'utilisateur a accès au document
        if not document.is_accessible_by(request.user):
            print(f"🔴 Accès refusé: L'utilisateur {request.user} n'a pas accès au document {document_id}")
            return JsonResponse({
                'success': False,
                'error': 'Vous n\'avez pas l\'autorisation d\'accéder à ce document'
            }, status=403)

        # Log pour débuguer
        print(f"🔍 Début analyse Mistral du document ID={document_id}")

        # Récupérer les pages du document pour l'analyse
        pages = DocumentPage.objects.filter(document=document).order_by('page_number')

        if not pages.exists():
            return JsonResponse({
                'success': False,
                'error': 'Aucune page trouvée pour ce document'
            }, status=404)

        # Préparer un échantillon de texte pour l'analyse (premières pages)
        document_text = ""
        for page in pages[:5]:  # Limiter à 5 pages pour l'analyse
            document_text += page.cleaned_text + "\n\n"
            if len(document_text) > 15000:  # Limiter la taille
                document_text = document_text[:15000]
                break

        # Toujours détecter automatiquement la langue du document
        # et utiliser cette langue pour les annotations
        detect_document_language = True
        annotation_language = None  # Pas de langue forcée, on utilisera celle du document

        # Détecter la langue avec une méthode qui prend en charge de nombreuses langues

        # Marqueurs pour un large éventail de langues (ajout de langues européennes et mondiales)
        language_markers = {
            # Langues latines
            'fr': ["le", "la", "les", "des", "pour", "avec", "par", "dans", "ce", "cette", "ces", "est", "sont",
                   "était", "qui", "que"],
            'es': ["el", "la", "los", "las", "de", "en", "para", "con", "por", "es", "son", "fue", "que", "pero",
                   "como", "cuando"],
            'it': ["il", "la", "i", "le", "di", "in", "per", "con", "da", "è", "sono", "era", "che", "ma", "come",
                   "quando"],
            'pt': ["o", "a", "os", "as", "de", "em", "para", "com", "por", "é", "são", "foi", "que", "mas", "como",
                   "quando"],
            'ro': ["un", "o", "și", "în", "la", "cu", "de", "pe", "pentru", "este", "sunt", "care", "că", "dar",
                   "acest", "acesta"],

            # Langues germaniques
            'en': ["the", "and", "of", "in", "to", "for", "with", "by", "this", "that", "is", "are", "was", "were",
                   "which", "who"],
            'de': ["der", "die", "das", "und", "in", "mit", "für", "von", "zu", "ist", "sind", "war", "wenn", "aber",
                   "oder", "wie"],
            'nl': ["de", "het", "een", "in", "op", "voor", "met", "door", "en", "is", "zijn", "was", "waren", "die",
                   "dat", "als"],
            'sv': ["en", "ett", "och", "att", "det", "är", "som", "för", "med", "på", "av", "den", "till", "inte",
                   "har", "från"],

            # Langues slaves
            'bg': ["на", "и", "за", "се", "от", "да", "в", "с", "по", "е", "са", "като", "че", "това", "тези", "този"],
            'ru': ["и", "в", "не", "на", "с", "по", "для", "от", "из", "о", "что", "это", "этот", "как", "так",
                   "когда"],
            'pl': ["w", "i", "z", "na", "do", "się", "jest", "to", "że", "dla", "nie", "jak", "przez", "od", "po",
                   "który"],
            'cs': ["a", "v", "na", "s", "z", "do", "je", "to", "že", "pro", "jako", "když", "od", "nebo", "také",
                   "který"],

            # Autres langues européennes
            'el': ["και", "του", "της", "τη", "σε", "από", "με", "για", "ο", "η", "το", "οι", "τα", "είναι", "που",
                   "αυτό"],
            'hu': ["a", "az", "és", "van", "egy", "hogy", "nem", "ez", "azt", "mint", "csak", "de", "ha", "vagy", "aki",
                   "ami"],
            'fi': ["ja", "on", "että", "ei", "se", "hän", "ovat", "oli", "kun", "mitä", "tai", "kuin", "mutta", "vain",
                   "jos", "myös"]
        }

        # Mapper le code de langue à un nom plus explicite pour les logs
        lang_names = {
            'fr': 'Français',
            'en': 'Anglais',
            'de': 'Allemand',
            'es': 'Espagnol',
            'it': 'Italien',
            'pt': 'Portugais'
        }

        # Préparer le texte pour la détection
        document_text_lower = " " + document_text.lower() + " "

        # Compter les occurrences de chaque marqueur de langue
        language_counts = {}
        for lang, markers in language_markers.items():
            count = sum(document_text_lower.count(f" {marker} ") for marker in markers)
            language_counts[lang] = count

        # Mapper le code de langue à un nom plus explicite pour les logs
        lang_names = {
            'fr': 'Français',
            'en': 'Anglais',
            'de': 'Allemand',
            'es': 'Espagnol',
            'it': 'Italien',
            'pt': 'Portugais',
            'ro': 'Roumain',
            'nl': 'Néerlandais',
            'sv': 'Suédois',
            'bg': 'Bulgare',
            'ru': 'Russe',
            'pl': 'Polonais',
            'cs': 'Tchèque',
            'el': 'Grec',
            'hu': 'Hongrois',
            'fi': 'Finnois'
        }

        # Détection automatique de la langue du document
        document_language = "fr"  # Valeur par défaut

        if detect_document_language:
            # Trouver la langue avec le plus de marqueurs
            if language_counts:
                detected_lang = max(language_counts, key=language_counts.get)
                lang_count = language_counts[detected_lang]

                # Vérifier si la détection est fiable (au moins 3 marqueurs trouvés)
                if lang_count >= 3:
                    document_language = detected_lang
                    lang_name = lang_names.get(document_language, f'Autre ({document_language})')
                    print(
                        f"🔍 Langue du document détectée: {lang_name} ({document_language}) avec {lang_count} marqueurs")
                else:
                    # Pas assez de marqueurs, utiliser la langue par défaut
                    document_language = "fr"
                    print(
                        f"⚠️ Détection de langue peu fiable ({lang_count} marqueurs). Document considéré en français par défaut")
            else:
                # Aucun marqueur trouvé, utiliser la langue par défaut
                document_language = "fr"
                print("⚠️ Aucun marqueur de langue trouvé. Document considéré en français par défaut")

        # Toujours utiliser la langue du document pour les annotations
        language = document_language
        print(f"🔄 Utilisation automatique de la langue du document pour les annotations: {language}")

        # Appeler Mistral pour l'analyse contextuelle
        print(f"📝 Appel à Mistral pour analyse document (langue: {language})")
        context_analysis = analyze_document_context_with_mistral(document_text, language)

        if "error" in context_analysis and not context_analysis.get("entity_types"):
            print(f"❌ Erreur lors de l'analyse Mistral: {context_analysis['error']}")
            return JsonResponse({
                'success': False,
                'error': f"Erreur lors de l'analyse: {context_analysis['error']}"
            }, status=500)

        # Traiter les types d'entités proposés par Mistral
        entity_types = context_analysis.get("entity_types", [])
        print(f"✅ Mistral a proposé {len(entity_types)} types d'entités")

        # Créer ou mettre à jour les types d'annotation dans la base de données
        created_types = []
        for entity_type in entity_types:
            name = entity_type.get("name", "").lower().strip()
            display_name = entity_type.get("display_name", name).strip()
            description = entity_type.get("description", "").strip()

            if not name:
                continue

            # Générer une couleur aléatoire basée sur le nom (pour être cohérent)
            color = '#' + ''.join([format(hash(name + str(i)) % 256, '02x') for i in range(3)])

            # Créer ou mettre à jour le type d'annotation
            ann_type, created = AnnotationType.objects.get_or_create(
                name=name,
                defaults={
                    'display_name': display_name,
                    'description': description,
                    'color': color
                }
            )

            # Mettre à jour si le type existe déjà
            if not created:
                ann_type.description = description
                ann_type.display_name = display_name
                ann_type.save()

            created_types.append({
                "id": ann_type.id,
                "name": ann_type.name,
                "display_name": ann_type.display_name,
                "description": ann_type.description,
                "color": ann_type.color
            })

        # Construire l'URL de redirection
        first_page = pages.first()
        annotation_url = f"/rawdocs/annotate/{document.id}/?page={first_page.page_number}"

        # Obtenir le nom d'affichage de la langue
        detected_lang_name = lang_names.get(document_language, document_language)

        # Retourner la réponse
        return JsonResponse({
            'success': True,
            'message': f"Mistral a identifié {len(created_types)} types d'entités pour ce document",
            'document_domain': context_analysis.get('document_domain', 'Non spécifié'),
            'document_language': document_language,  # Code ISO de la langue du document (fr, en, de, etc.)
            'displayed_language': detected_lang_name,  # Nom de la langue pour affichage (Français, Anglais, etc.)
            'entity_types': created_types,
            'entity_types_count': len(created_types),
            'annotation_url': annotation_url
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Exception lors de l'analyse Mistral: {e}")
        return JsonResponse({
            'success': False,
            'error': f"Une erreur est survenue: {str(e)}"
        }, status=500)


import requests
import json
import re
from django.utils import timezone

def local_llm_annotate_llama(page_text):
    """
    Annotation Llama 3.2 - Prompt ultra-simplifié
    """
    
    # PROMPT ULTRA-SIMPLE pour éviter hallucinations
    prompt = f"""Extract pharmaceutical entities and return ONLY a JSON array.

Document text:
{page_text}

Extract entities like:
- dosage: "500 mg", "25 mg/tablet"
- specification: "95% to 105%", "NMT 0.5%"
- test: "dissolution", "content uniformity"
- value: numbers with units
- batch_info: lot numbers, dates

Return ONLY this format:
[{{"text":"exact text from doc","type":"dosage","confidence":0.9,"reasoning":"brief"}}]

No code. No explanation. Only JSON array.
Maximum 30 unique entities.

JSON array:"""

    try:
        print("🤖 Appel Llama simplifié...")
        
        response = requests.post('http://localhost:11434/api/generate', 
            json={
                'model': 'llama3.2:3b',
                'prompt': prompt,
                'stream': False,
                'options': {
                    'temperature': 0.05,       # TRÈS bas
                    'num_predict': 2000,       # Court pour éviter divagations
                    'num_ctx': 4096,
                    'num_gpu': 99,
                    'num_thread': 1,
                    'repeat_penalty': 1.3,
                    'stop': ['\n\nExplanation', 'Note:', 'Please', 'Here'],  # Arrête si explications
                }
            },
            timeout=90
        )
        
        result = response.json()
        llm_output = result.get('response', '').strip()
        
        print(f"📝 Réponse: {len(llm_output)} chars")
        print(f"🔍 Début: {llm_output[:200]}")
        
        # Nettoyer toute explication
        if 'import ' in llm_output or 'def ' in llm_output or 'Here' in llm_output:
            print("⚠️ Le modèle a généré du code/texte au lieu de JSON!")
            # Essayer de trouver le JSON quand même
            json_start = llm_output.find('[{')
            if json_start != -1:
                llm_output = llm_output[json_start:]
                print(f"✅ JSON trouvé à position {json_start}")
        
        llm_output = llm_output.replace('```json', '').replace('```', '').strip()
        
        # Chercher JSON
        start_idx = llm_output.find('[')
        end_idx = llm_output.rfind(']')
        
        print(f"📍 '[' at {start_idx}, ']' at {end_idx}")
        
        if start_idx == -1:
            print("❌ Pas de JSON - le modèle n'a pas suivi les instructions")
            return []
        
        if end_idx == -1 or end_idx <= start_idx:
            last_brace = llm_output.rfind('}')
            if last_brace > start_idx:
                json_str = llm_output[start_idx:last_brace+1] + ']'
            else:
                return []
        else:
            json_str = llm_output[start_idx:end_idx+1]
        
        try:
            annotations = json.loads(json_str)
            print(f"🎯 {len(annotations)} annotations")
            
            # Déduplication
            seen = set()
            unique = []
            for ann in annotations:
                if not isinstance(ann, dict):
                    continue
                key = (ann.get('text', '').strip().lower(), ann.get('type', '').lower())
                if key not in seen and key[0] and len(key[0]) > 1:
                    seen.add(key)
                    unique.append(ann)
            
            annotations = unique[:40]  # Max 40
            print(f"✅ {len(annotations)} uniques")
            
        except json.JSONDecodeError as e:
            print(f"❌ JSON invalide: {e}")
            print(f"JSON: {json_str[:300]}")
            return []
        
        # Valider positions
        validated = []
        for ann in annotations:
            if not all(k in ann for k in ['text', 'type']):
                continue
            
            text_to_find = ann['text'].strip()
            if not text_to_find:
                continue
            
            start = page_text.find(text_to_find)
            
            if start == -1:
                normalized = re.sub(r'\s+', ' ', text_to_find)
                start = page_text.find(normalized)
                if start != -1:
                    text_to_find = normalized
            
            if start == -1:
                start = page_text.lower().find(text_to_find.lower())
                if start != -1:
                    text_to_find = page_text[start:start + len(text_to_find)]
            
            if start != -1:
                ann['start_pos'] = start
                ann['end_pos'] = start + len(text_to_find)
                ann['selected_text'] = text_to_find
                ann['confidence'] = ann.get('confidence', 0.8)
                ann['reasoning'] = ann.get('reasoning', 'extracted')
                validated.append(ann)
        
        print(f"🎉 {len(validated)} validées")
        return validated
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return []
    
    
@login_required
@csrf_exempt
def local_llm_annotate_page(request, page_id):
    """Annotation 100% PRIVÉE avec Llama 3.2 local sur RTX 4060"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode POST requise'}, status=405)
    
    try:
        page = get_object_or_404(DocumentPage, id=page_id)
        page_text = page.raw_text or ""
        
        if not page_text.strip():
            return JsonResponse({'error': 'Page sans texte'}, status=400)
        
        print(f"🔍 Annotation locale de la page {page.id} ({len(page_text)} caractères)")
        
        # Obtenir les annotations du modèle LOCAL
        annotations = local_llm_annotate_llama(page_text)
        
        if not annotations:
            return JsonResponse({
                'success': False,
                'error': 'Aucune annotation trouvée',
                'annotations_created': 0
            })
        
        # Sauvegarder dans la base de données
        saved_count = 0
        annotation_types = {at.name: at for at in AnnotationType.objects.all()}
        
        for ann_data in annotations:
            try:
                type_name = ann_data['type'].lower().replace(' ', '_')
                
                # Créer le type d'annotation s'il n'existe pas
                if type_name not in annotation_types:
                    ann_type = AnnotationType.objects.create(
                        name=type_name,
                        display_name=ann_data['type'],
                        color='#' + format(hash(type_name) % 0xFFFFFF, '06x'),
                        description=f"Llama 3.2 local: {ann_data['type']}"
                    )
                    annotation_types[type_name] = ann_type
                    print(f"  ➕ Nouveau type créé: {ann_data['type']}")
                else:
                    ann_type = annotation_types[type_name]
                
                # Créer l'annotation
                confidence_score = float(ann_data.get('confidence', 0.9)) * 100
                
                Annotation.objects.create(
                    page=page,
                    annotation_type=ann_type,
                    start_pos=ann_data['start_pos'],
                    end_pos=ann_data['end_pos'],
                    selected_text=ann_data['selected_text'],
                    confidence_score=confidence_score,
                    ai_reasoning=ann_data.get('reasoning', 'Llama 3.2 extraction locale'),
                    created_by=request.user
                )
                saved_count += 1
                
            except Exception as e:
                print(f"❌ Erreur sauvegarde annotation: {e}")
                continue
        
        # Marquer la page comme annotée
        if saved_count > 0:
            page.is_annotated = True
            page.annotated_at = timezone.now()
            page.annotated_by = request.user
            page.save(update_fields=['is_annotated', 'annotated_at', 'annotated_by'])
        
        print(f"✅ {saved_count} annotations sauvegardées")
        
        return JsonResponse({
            'success': True,
            'annotations_created': saved_count,
            'message': f'✅ {saved_count} annotations créées (100% privé, RTX 4060)',
            'method': 'local_llama_3.2'
        })
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return JsonResponse({'error': str(e)}, status=500)
    

from bs4 import BeautifulSoup
from django.views.decorators.csrf import csrf_protect
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST
import json

from .models import RawDocument, MetadataLog


# ---- save_edited_text (remplacer / ajouter) ----
@csrf_protect
@login_required
@require_POST
def save_edited_text(request):
    try:
        data = json.loads(request.body)
        doc_id = data.get('document_id')
        edits = data.get('edits', [])

        if not doc_id or not edits:
            return JsonResponse({'success': False, 'error': 'Missing required fields'}, status=400)

        document = get_object_or_404(RawDocument, id=doc_id, owner=request.user)

        if not document.structured_html:
            return JsonResponse({'success': False, 'error': 'No structured HTML to edit'}, status=400)

        soup = BeautifulSoup(document.structured_html, 'html.parser')
        updated_count = 0

        for edit in edits:
            element_id = edit.get('element_id')
            new_text = edit.get('new_text', '').strip()

            if not element_id or new_text is None:
                continue

            element = soup.find(id=element_id)
            if element:
                old_text = element.get_text().strip()
                # Replace safely
                element.string = new_text
                updated_count += 1

                MetadataLog.objects.create(
                    document=document,
                    field_name='edited_text_' + element_id[:200],
                    old_value=old_text[:2000],
                    new_value=new_text[:2000],
                    modified_by=request.user
                )

        if updated_count > 0:
            document.structured_html = str(soup)
            document.save(update_fields=['structured_html'])

        return JsonResponse({
            'success': True,
            'message': f'{updated_count} élément(s) mis à jour avec succès',
            'updated_count': updated_count
        })
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({'success': False, 'error': str(e)}, status=500)