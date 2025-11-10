# expert/api_urls.py
"""
API URL Configuration for Expert Dashboard - Next.js Frontend
"""

from django.urls import path
from . import api_views
from . import qa_api_views

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

    # Expert Chat (No AI)
    path('documents/<int:doc_id>/chat/', api_views.chat_messages_handler, name='chat_messages'),
    path('documents/<int:doc_id>/search-json/', api_views.search_in_json, name='search_in_json'),
    path('chat/<int:message_id>/', api_views.chat_message_handler, name='chat_message'),
    path('chat/<int:message_id>/resolve/', api_views.toggle_message_resolved, name='toggle_message_resolved'),

    # Intelligent Q&A System (No AI)
    path('documents/<int:doc_id>/ask/', qa_api_views.ask_question, name='ask_question'),
    path('documents/<int:doc_id>/validate-answer/', qa_api_views.validate_answer, name='validate_answer'),
    path('documents/<int:doc_id>/qa/', qa_api_views.get_validated_qa_list, name='qa_list'),
    path('documents/<int:doc_id>/qa/statistics/', qa_api_views.get_qa_statistics, name='qa_statistics_doc'),
    path('qa/<int:qa_id>/correct/', qa_api_views.correct_answer, name='correct_answer'),
    path('qa/correct/', qa_api_views.correct_answer_from_search, name='correct_answer_from_search'),  # Nouveau: correction depuis l'assistant
    path('qa/<int:qa_id>/', qa_api_views.delete_qa, name='delete_qa'),
    path('qa/statistics/', qa_api_views.get_qa_statistics, name='qa_statistics_global'),

    # Relationship Management via Q&A
    path('relations/create-from-qa/', qa_api_views.create_relation_from_qa, name='create_relation_from_qa'),
    path('relations/<int:relationship_id>/update-from-qa/', qa_api_views.update_relation_from_qa, name='update_relation_from_qa'),
    path('documents/<int:doc_id>/update-json-from-relations/', qa_api_views.update_json_from_relations, name='update_json_from_relations'),
    path('documents/<int:doc_id>/json-sync-status/', qa_api_views.get_json_sync_status, name='json_sync_status'),
    path('documents/<int:doc_id>/initialize-enriched-json/', qa_api_views.initialize_enriched_json, name='initialize_enriched_json'),

]
