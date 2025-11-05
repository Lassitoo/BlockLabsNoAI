# expert/semantic_urls.py
"""
URLs pour les API JSON Sémantiques
Routes pour la visualisation et l'enrichissement des annotations JSON
"""

from django.urls import path
from expert import semantic_api_views

urlpatterns = [
    # ==================== JSON BASIQUE ====================
    # GET /api/expert/documents/{id}/json/
    path(
        'documents/<int:id>/json/',
        semantic_api_views.get_document_json,
        name='api_expert_document_json'
    ),

    # ==================== JSON ENRICHI ====================
    # GET /api/expert/documents/{id}/json-enriched/
    path(
        'documents/<int:id>/json-enriched/',
        semantic_api_views.get_document_json_enriched,
        name='api_expert_document_json_enriched'
    ),

    # POST /api/expert/documents/{id}/enrich-json/
    path(
        'documents/<int:id>/enrich-json/',
        semantic_api_views.enrich_document_json,
        name='api_expert_enrich_json'
    ),

    # POST /api/expert/documents/{id}/save-enriched-json/
    path(
        'documents/<int:id>/save-enriched-json/',
        semantic_api_views.save_enriched_json,
        name='api_expert_save_enriched_json'
    ),

    # POST /api/expert/documents/{id}/regenerate-json/
    path(
        'documents/<int:id>/regenerate-json/',
        semantic_api_views.regenerate_json,
        name='api_expert_regenerate_json'
    ),

    # ==================== JSON DE PAGE SPÉCIFIQUE ====================
    # GET/PUT /api/expert/documents/{id}/pages/{page_number}/json/
    path(
        'documents/<int:id>/pages/<int:page_number>/json/',
        semantic_api_views.get_page_json,
        name='api_expert_page_json'
    ),

    # ==================== DELTAS IA VS EXPERT ====================
    # GET /api/expert/documents/{id}/deltas/
    path(
        'documents/<int:id>/deltas/',
        semantic_api_views.get_expert_deltas,
        name='api_expert_deltas'
    ),

    # POST /api/expert/deltas/{id}/rate/
    path(
        'deltas/<int:delta_id>/rate/',
        semantic_api_views.rate_delta,
        name='api_expert_rate_delta'
    ),

    # ==================== APPRENTISSAGE ====================
    # POST /api/expert/documents/{id}/regenerate-with-learning/
    path(
        'documents/<int:id>/regenerate-with-learning/',
        semantic_api_views.regenerate_with_learning,
        name='api_expert_regenerate_with_learning'
    ),

    # ==================== DOCUMENTS VALIDÉS ====================
    # GET /api/expert/validated-documents/
    path(
        'validated-documents/',
        semantic_api_views.get_validated_documents,
        name='api_expert_validated_documents'
    ),

    # ==================== ANALYSE DE PAGES ====================
    # POST /api/expert/documents/{id}/analyze-pages/
    path(
        'documents/<int:id>/analyze-pages/',
        semantic_api_views.analyze_document_pages,
        name='api_expert_analyze_pages'
    ),
]
