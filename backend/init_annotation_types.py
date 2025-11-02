#!/usr/bin/env python
"""
Script pour initialiser les types d'annotation prédéfinis
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'MyProject.settings')
django.setup()

from rawdocs.models import AnnotationType

# Types d'annotation prédéfinis avec leurs couleurs
PREDEFINED_TYPES = [
    {
        'name': 'product',
        'display_name': 'Produit',
        'color': '#3b82f6',  # Bleu
        'description': 'Nom du produit ou médicament'
    },
    {
        'name': 'procedure_type',
        'display_name': 'Type de Procédure',
        'color': '#8b5cf6',  # Violet
        'description': 'Type de procédure réglementaire'
    },
    {
        'name': 'country',
        'display_name': 'Pays',
        'color': '#10b981',  # Vert
        'description': 'Pays concerné par la réglementation'
    },
    {
        'name': 'authority',
        'display_name': 'Autorité',
        'color': '#f59e0b',  # Orange
        'description': 'Autorité réglementaire'
    },
    {
        'name': 'legal_reference',
        'display_name': 'Référence Légale',
        'color': '#ef4444',  # Rouge
        'description': 'Référence à une loi ou réglementation'
    },
    {
        'name': 'required_document',
        'display_name': 'Document Requis',
        'color': '#06b6d4',  # Cyan
        'description': 'Document nécessaire pour la procédure'
    },
    {
        'name': 'required_condition',
        'display_name': 'Condition Requise',
        'color': '#ec4899',  # Rose
        'description': 'Condition ou critère à respecter'
    },
    {
        'name': 'delay',
        'display_name': 'Délai',
        'color': '#f97316',  # Orange foncé
        'description': 'Délai ou durée'
    },
    {
        'name': 'variation_code',
        'display_name': 'Code de Variation',
        'color': '#6366f1',  # Indigo
        'description': 'Code de variation réglementaire'
    },
    {
        'name': 'file_type',
        'display_name': 'Type de Fichier',
        'color': '#14b8a6',  # Teal
        'description': 'Type de fichier ou format requis'
    },
    {
        'name': 'dosage',
        'display_name': 'Dosage',
        'color': '#a855f7',  # Violet clair
        'description': 'Dosage ou posologie'
    },
    {
        'name': 'indication',
        'display_name': 'Indication',
        'color': '#22c55e',  # Vert clair
        'description': 'Indication thérapeutique'
    }
]

def init_annotation_types():
    """Initialise les types d'annotation prédéfinis"""
    print("Initialisation des types d'annotation...")
    
    created_count = 0
    updated_count = 0
    
    for type_data in PREDEFINED_TYPES:
        annotation_type, created = AnnotationType.objects.get_or_create(
            name=type_data['name'],
            defaults={
                'display_name': type_data['display_name'],
                'color': type_data['color'],
                'description': type_data['description']
            }
        )
        
        if created:
            created_count += 1
            print(f"[CREE] {annotation_type.display_name} ({annotation_type.color})")
        else:
            # Mettre à jour si nécessaire
            updated = False
            if annotation_type.display_name != type_data['display_name']:
                annotation_type.display_name = type_data['display_name']
                updated = True
            if annotation_type.color != type_data['color']:
                annotation_type.color = type_data['color']
                updated = True
            if annotation_type.description != type_data['description']:
                annotation_type.description = type_data['description']
                updated = True
            
            if updated:
                annotation_type.save()
                updated_count += 1
                print(f"[MAJ] {annotation_type.display_name}")
            else:
                print(f"[OK] {annotation_type.display_name}")
    
    print(f"\nRésumé:")
    print(f"  - Types créés: {created_count}")
    print(f"  - Types mis à jour: {updated_count}")
    print(f"  - Total: {AnnotationType.objects.count()}")

if __name__ == '__main__':
    init_annotation_types()
