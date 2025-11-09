# expert/api_urls.py
"""
API URL Configuration for Expert Dashboard - Next.js Frontend
"""

from django.urls import path
from . import api_views

app_name = 'expert_api'

urlpatterns = [
    # Dashboard
    path('dashboard/', api_views.get_expert_dashboard_data, name='dashboard'),

    # Documents List
    path('documents/', api_views.get_expert_documents_list, name='documents_list'),

    # Document Review
    path('documents/<int:doc_id>/review/', api_views.get_document_review_data, name='document_review'),

    # Annotation Validation
    path('annotations/<int:annotation_id>/validate/', api_views.validate_annotation, name='validate_annotation'),

    # Bulk Validation
    path('documents/<int:doc_id>/bulk-validate/', api_views.bulk_validate_annotations, name='bulk_validate'),

    # Model Evaluation
    path('evaluation/', api_views.get_model_evaluation_data, name='evaluation'),
    # Relationship Validation
    path('pages/<int:page_id>/relationships/', api_views.get_page_relationships_for_expert, name='page_relationships'),
    path('relationships/<int:relationship_id>/validate/', api_views.validate_relationship, name='validate_relationship'),
    path('relationships/<int:relationship_id>/update/', api_views.update_relationship, name='update_relationship'),
    path('relationships/<int:relationship_id>/delete/', api_views.delete_relationship, name='delete_relationship'),  # ADD THIS LINE

]
