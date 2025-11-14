# Standard library imports
import base64
import io
import json
import logging
import os
import re
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

# Third-party imports
import dateparser
import pdfplumber
from docx import Document
from dotenv import load_dotenv
from langdetect import detect
from pdfminer.high_level import extract_text
from PIL import Image
from PyPDF2 import PdfReader

# Django imports
from MyProject import settings
from .models import MetadataFeedback

# Load environment variables
load_dotenv()

# Configure logging
logger = logging.getLogger(__name__)

# ============================================================================
# TEXT EXTRACTION FUNCTIONS
# ============================================================================

def extract_text_content(file_path: str) -> str:
    """Extract raw text content from a file based on its type.

    Args:
        file_path: Path to the document file

    Returns:
        Extracted text content as a string
    """
    ext = Path(file_path).suffix.lower()
    text = ""
    logger.info(f"Starting text extraction for {file_path} (type: {ext})")

    if ext == ".pdf":
        try:
            text = extract_text(file_path)
            logger.info(f"Successfully extracted PDF text ({len(text)} characters)")
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
    elif ext in [".docx"]:
        try:
            doc = Document(file_path)
            text = "\n".join([p.text for p in doc.paragraphs])
            logger.info(f"Successfully extracted DOCX text ({len(text)} characters)")
        except Exception as e:
            logger.error(f"Error extracting DOCX text: {e}")

    return text


def extract_full_text(file_path: str) -> str:
    """Extract complete text using pdfplumber fallback.

    Args:
        file_path: Path to the PDF file

    Returns:
        Complete extracted text
    """
    text = ""
    try:
        with pdfplumber.open(file_path) as pdf:
            # Extract first 2 pages in detail
            for page in pdf.pages[:2]:
                page_text = page.extract_text() or ""
                text += "\n" + page_text
            # Extract remaining pages
            for page in pdf.pages[2:]:
                text += "\n" + (page.extract_text() or "")
        logger.info(f"Extracted full text: {len(text)} characters")
    except Exception as e:
        logger.error(f"Error extracting full text: {e}")

    return text


# ============================================================================
# EXIF & METADATA EXTRACTION
# ============================================================================

def extract_exif_metadata(file_path: str) -> Dict[str, Any]:
    """Extract EXIF metadata using ExifTool with inference fallback.

    Args:
        file_path: Path to the file

    Returns:
        Dictionary of extracted metadata with confidence scores
    """
    logger.debug(f"Attempting ExifTool extraction for {file_path}")

    try:
        result = subprocess.run(
            ["exiftool", "-json", file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        if result.returncode != 0:
            logger.warning(f"ExifTool error: {result.stderr}")
            text = extract_text_content(file_path).strip().split('\n')[0] if extract_text_content(file_path) else Path(
                file_path).stem
            return {'Title (inferred)': {'value': text, 'confidence': 50, 'method': 'text_inference'}}

        metadata = json.loads(result.stdout)[0]
        logger.info(f"ExifTool extracted {len(metadata)} fields")

        if 'Title' in metadata and metadata['Title']:
            metadata['Title'] = {'value': metadata['Title'], 'confidence': 75, 'method': 'exif'}
        elif 'Title' not in metadata or not metadata['Title']:
            text = extract_text_content(file_path).strip().split('\n')[0] if extract_text_content(file_path) else Path(
                file_path).stem
            metadata['Title (inferred)'] = {'value': text, 'confidence': 50, 'method': 'text_inference'}

        return metadata

    except Exception as e:
        logger.error(f"ExifTool error: {e}")
        text = extract_text_content(file_path).strip().split('\n')[0] if extract_text_content(file_path) else Path(
            file_path).stem
        return {'Title (inferred)': {'value': text, 'confidence': 50, 'method': 'text_inference'}}


# ============================================================================
# SOURCE & ORGANIZATION DETECTION
# ============================================================================

def extract_source_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Extract source/organization from document text.

    Args:
        text: Document text content

    Returns:
        Dictionary with source info, confidence, and method, or None
    """
    text_sample = text[:3000]

    # Extended organization dictionary with patterns
    organizations = {
        'EMA': {
            'patterns': [
                r'European\s+Medicines\s+Agency',
                r'\bEMA\b',
                r'EMA/CHMP',
                r'Committee\s+for\s+Medicinal\s+Products',
                r'CHMP',
                r'www\.ema\.europa\.eu'
            ],
            'confidence': 95
        },
        'FDA': {
            'patterns': [
                r'Food\s+and\s+Drug\s+Administration',
                r'\bFDA\b',
                r'U\.?S\.?\s+FDA',
                r'www\.fda\.gov'
            ],
            'confidence': 95
        },
        'ANSM': {
            'patterns': [
                r'Agence\s+Nationale\s+de\s+Sécurité\s+du\s+Médicament',
                r'\bANSM\b',
                r'ansm\.sante\.fr'
            ],
            'confidence': 95
        },
        'WHO': {
            'patterns': [
                r'World\s+Health\s+Organization',
                r'\bWHO\b',
                r'Organisation\s+Mondiale\s+de\s+la\s+Santé'
            ],
            'confidence': 95
        },
        'ICH': {
            'patterns': [
                r'International\s+Council\s+for\s+Harmonisation',
                r'\bICH\b',
                r'ICH\s+Harmonised'
            ],
            'confidence': 90
        },
        'European Commission': {
            'patterns': [
                r'European\s+Commission',
                r'Commission\s+Européenne',
                r'ec\.europa\.eu'
            ],
            'confidence': 90
        },
        'MHRA': {
            'patterns': [
                r'Medicines\s+and\s+Healthcare\s+products\s+Regulatory\s+Agency',
                r'\bMHRA\b',
                r'www\.gov\.uk/mhra'
            ],
            'confidence': 95
        },
        'European Pharmacopoeia': {
            'patterns': [
                r'European\s+Pharmacopoeia',
                r'Pharmacopée\s+Européenne',
                r'\bPh\.?\s*Eur\.?',
                r'EDQM'
            ],
            'confidence': 90
        }
    }

    # Search for organizations
    for org_name, org_data in organizations.items():
        for pattern in org_data['patterns']:
            if re.search(pattern, text_sample, re.IGNORECASE):
                logger.info(f"Source detected: {org_name} (via pattern: {pattern})")
                return {
                    'value': org_name,
                    'confidence': org_data['confidence'],
                    'method': 'text_pattern_match'
                }

    # Search for organization in PDF metadata (Author)
    try:
        with pdfplumber.open(file_path) as pdf:
            metadata = pdf.metadata or {}
            if 'Author' in metadata and metadata['Author']:
                author = metadata['Author'].strip()
                if author and len(author) > 2:
                    logger.info(f"Source found in Author: {author}")
                    return {
                        'value': author,
                        'confidence': 80,
                        'method': 'pdf_metadata_author'
                    }
    except:
        pass

    logger.warning("Source not detected")
    return None


# ============================================================================
# CONTEXT & DOMAIN DETECTION
# ============================================================================

def extract_context_from_text(text: str) -> Optional[Dict[str, Any]]:
    """Extract context/domain from document text.

    Args:
        text: Document text content

    Returns:
        Dictionary with context info, confidence, and method, or None
    """
    text_sample = text[:5000]

    # Context dictionary with weighted keywords
    contexts = {
        'pharmaceutical': {
            'keywords': ['pharmaceutical', 'medicinal', 'drug', 'medicine', 'API', 'active substance',
                         'excipient', 'formulation', 'dosage', 'tablet', 'capsule', 'injection',
                         'pharmaceutique', 'médicament', 'substance active'],
            'weight': 2,
            'min_score': 3
        },
        'regulatory': {
            'keywords': ['regulation', 'directive', 'compliance', 'authorization', 'approval',
                         'regulatory', 'legal requirement', 'legislation', 'law',
                         'réglementation', 'directive', 'conformité', 'autorisation'],
            'weight': 2,
            'min_score': 3
        },
        'quality_control': {
            'keywords': ['quality control', 'GMP', 'quality assurance', 'validation', 'testing',
                         'specification', 'analytical', 'method', 'stability',
                         'contrôle qualité', 'assurance qualité', 'validation'],
            'weight': 2,
            'min_score': 3
        },
        'manufacturing': {
            'keywords': ['manufacturing', 'production', 'facility', 'plant', 'process',
                         'fabrication', 'production', 'installation', 'processus'],
            'weight': 2,
            'min_score': 3
        },
        'clinical': {
            'keywords': ['clinical trial', 'patient', 'treatment', 'therapy', 'diagnosis',
                         'essai clinique', 'patient', 'traitement', 'thérapie'],
            'weight': 1.5,
            'min_score': 2
        },
        'safety': {
            'keywords': ['safety', 'adverse event', 'pharmacovigilance', 'risk', 'side effect',
                         'sécurité', 'effet indésirable', 'pharmacovigilance', 'risque'],
            'weight': 1.5,
            'min_score': 2
        }
    }

    # Calculate scores for each context
    scores = {}
    for context_name, context_data in contexts.items():
        score = 0
        for keyword in context_data['keywords']:
            count = text_sample.lower().count(keyword.lower())
            score += count * context_data['weight']

        if score >= context_data['min_score']:
            scores[context_name] = score

    # Return context with highest score
    if scores:
        best_context = max(scores, key=scores.get)
        confidence = min(70 + (scores[best_context] * 2), 95)
        logger.info(f"Context detected: {best_context} (score: {scores[best_context]})")
        return {
            'value': best_context,
            'confidence': confidence,
            'method': 'keyword_scoring'
        }

    logger.warning("Context not detected")
    return None


# ============================================================================
# COUNTRY & LANGUAGE DETECTION
# ============================================================================

def extract_country_from_text(text: str, file_path: str = "") -> Optional[Dict[str, Any]]:
    """Extract country information from document text.

    Args:
        text: Document text content
        file_path: Optional file path for filename analysis

    Returns:
        Dictionary with country code, confidence, and method, or None
    """
    text_sample = text[:3000]

    # Country detection patterns
    country_patterns = {
        'EU': [
            r'European\s+Union',
            r'\bEU\b',
            r'Union\s+Européenne',
            r'EMA/CHMP',
            r'Official\s+Journal\s+of\s+the\s+European\s+Union'
        ],
        'FR': [
            r'\bFrance\b',
            r'French\s+Republic',
            r'République\s+Française',
            r'ANSM',
            r'\+33\s*\d',
            r'\bF-\d{5}\b'
        ],
        'US': [
            r'United\s+States',
            r'\bUSA\b',
            r'\bU\.?S\.?A\.?\b',
            r'FDA',
            r'Washington,?\s*DC'
        ],
        'UK': [
            r'United\s+Kingdom',
            r'\bUK\b',
            r'Great\s+Britain',
            r'MHRA',
            r'London,?\s*England'
        ],
        'DE': [
            r'\bGermany\b',
            r'\bDeutschland\b',
            r'BfArM',
            r'\+49\s*\d'
        ],
        'IE': [
            r'\bIreland\b',
            r'\bIrlande\b',
            r'Irish',
            r'Dublin,?\s*Ireland',
            r'\+353\s*\d'
        ],
        'PL': [
            r'\bPoland\b',
            r'\bPologne\b',
            r'Polish',
            r'Warsaw',
            r'\+48\s*\d'
        ]
    }

    # Search for country patterns
    for country_code, patterns in country_patterns.items():
        for pattern in patterns:
            if re.search(pattern, text_sample, re.IGNORECASE):
                logger.info(f"Country detected: {country_code} (via pattern: {pattern})")
                return {
                    'value': country_code,
                    'confidence': 85,
                    'method': 'text_pattern_match'
                }

    # Analyze filename for clues
    if file_path:
        filename = Path(file_path).stem.upper()
        for country_code in country_patterns.keys():
            if f"_{country_code}_" in filename or f"_{country_code}." in filename:
                logger.info(f"Country detected in filename: {country_code}")
                return {
                    'value': country_code,
                    'confidence': 75,
                    'method': 'filename_pattern'
                }

    logger.warning("Country not detected")
    return None


def detect_document_language(text: str, file_path: str = "") -> Optional[Dict[str, Any]]:
    """Detect document language using multiple methods.

    Args:
        text: Document text content
        file_path: Optional file path for filename analysis

    Returns:
        Dictionary with language code, confidence, and method, or None
    """
    if not text or len(text.strip()) < 50:
        logger.warning("Text too short for language detection")
        return None

    detected_langs = []

    # Method 1: langdetect on full text
    try:
        lang_full = detect(text[:5000])
        detected_langs.append(('langdetect_full', lang_full, 90))
        logger.debug(f"Language detected (full text): {lang_full}")
    except Exception as e:
        logger.warning(f"langdetect error (full text): {e}")

    # Method 2: langdetect on multiple samples
    try:
        samples = [
            text[:1000],
            text[len(text) // 2:len(text) // 2 + 1000] if len(text) > 2000 else text,
            text[-1000:] if len(text) > 1000 else text
        ]
        lang_counts = {}
        for sample in samples:
            if len(sample.strip()) > 50:
                try:
                    lang = detect(sample)
                    lang_counts[lang] = lang_counts.get(lang, 0) + 1
                except:
                    pass

        if lang_counts:
            most_common_lang = max(lang_counts, key=lang_counts.get)
            confidence = 85 + (lang_counts[most_common_lang] * 5)
            detected_langs.append(('langdetect_samples', most_common_lang, min(confidence, 98)))
            logger.debug(f"Language detected (samples): {most_common_lang}")
    except Exception as e:
        logger.warning(f"langdetect error (samples): {e}")

    # Method 3: Filename analysis
    if file_path:
        filename = Path(file_path).stem.upper()
        lang_indicators = {
            'en': ['_EN_', '_EN.', 'ENGLISH', '_ENG_'],
            'fr': ['_FR_', '_FR.', 'FRENCH', '_FRA_'],
            'de': ['_DE_', '_DE.', 'GERMAN', '_DEU_'],
            'es': ['_ES_', '_ES.', 'SPANISH', '_ESP_'],
            'it': ['_IT_', '_IT.', 'ITALIAN', '_ITA_'],
            'pl': ['_PL_', '_PL.', 'POLISH', '_POL_']
        }

        for lang_code, indicators in lang_indicators.items():
            if any(ind in filename for ind in indicators):
                detected_langs.append(('filename', lang_code, 80))
                logger.debug(f"Language detected (filename): {lang_code}")
                break

    # Method 4: Keyword analysis
    text_sample = text[:3000].lower()
    keyword_scores = {
        'en': sum([
            text_sample.count(' the ') * 2,
            text_sample.count(' and '),
            text_sample.count(' of '),
            text_sample.count(' to '),
            text_sample.count(' in ')
        ]),
        'fr': sum([
            text_sample.count(' le ') * 2,
            text_sample.count(' la ') * 2,
            text_sample.count(' les ') * 2,
            text_sample.count(' de '),
            text_sample.count(' du ')
        ]),
        'de': sum([
            text_sample.count(' der ') * 2,
            text_sample.count(' die ') * 2,
            text_sample.count(' das ') * 2,
            text_sample.count(' und ')
        ])
    }

    if keyword_scores:
        best_lang = max(keyword_scores, key=keyword_scores.get)
        if keyword_scores[best_lang] > 10:
            confidence = min(70 + (keyword_scores[best_lang] // 5), 85)
            detected_langs.append(('keywords', best_lang, confidence))
            logger.debug(f"Language detected (keywords): {best_lang}")

    # Consolidation
    if not detected_langs:
        logger.error("No language detected")
        return None

    detected_langs.sort(key=lambda x: x[2], reverse=True)
    best_method, best_lang, best_confidence = detected_langs[0]

    # Boost confidence if consensus
    lang_votes = {}
    for method, lang, conf in detected_langs:
        lang_votes[lang] = lang_votes.get(lang, 0) + 1

    if lang_votes.get(best_lang, 0) >= 2:
        best_confidence = min(best_confidence + 10, 98)
        logger.info(f"Language consensus: {best_lang}")

    return {
        'value': best_lang,
        'confidence': best_confidence,
        'method': f'language_detection_{best_method}'
    }


# ============================================================================
# ENHANCED NLP ANALYSIS
# ============================================================================

def enhanced_nlp_analysis(text: str, file_path: str = "") -> Dict[str, Any]:
    """Enhanced NLP analysis without LLM.

    Args:
        text: Document text content
        file_path: Optional file path for additional context

    Returns:
        Dictionary of extracted metadata with confidence scores
    """
    meta = {}

    if not text.strip():
        logger.warning("No text to analyze for NLP")
        return meta

    logger.info("Starting enhanced NLP analysis")

    # DOCUMENT TYPE DETECTION
    doc_types = {
        'guideline': ['guideline', 'guidance', 'recommendations', 'best practices', 'guide', 'notice', 'instructions',
                      'ligne directrice', 'recommandations'],
        'regulation': ['regulation', 'directive', 'law', 'legal', 'article', 'decree', 'règlement', 'directive'],
        'report': ['report', 'assessment', 'evaluation', 'analysis', 'study', 'rapport', 'évaluation'],
        'procedure': ['procedure', 'protocol', 'method', 'process', 'operating', 'utilisation', 'précautions',
                      'procédure', 'protocole'],
        'specifications': ['specifications', 'specs', 'requirements', 'criteria', 'specification', 'spécifications',
                           'exigences'],
        'manufacturer': ['manufacturer', 'manufacturing', 'production', 'facility', 'plant', 'fabricant',
                         'manufacturier'],
        'certificate': ['certificate', 'certification', 'approval', 'authorization', 'certificat', 'approbation'],
        'standard': ['standard', 'norm', 'iso', 'quality standard', 'norme', 'standard qualité']
    }

    text_lower = text.lower()
    for doc_type, keywords in doc_types.items():
        if any(keyword in text_lower for keyword in keywords):
            meta['type'] = {
                'value': doc_type,
                'confidence': 85,
                'method': 'nlp_keyword_match'
            }
            logger.info(f"Type detected: {doc_type}")
            break

    # DATE EXTRACTION (Enhanced)
    date_candidates = []

    # Detect language
    language_info = detect_document_language(text, file_path)
    lang = language_info.get('value', 'en') if language_info else 'en'
    logger.debug(f"Language for date detection: {lang}")

    # Define month names by language
    month_names_by_lang = {
        'en': "(?:January|February|March|April|May|June|July|August|September|October|November|December)",
        'fr': "(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)"
    }
    month_names = month_names_by_lang.get(lang, month_names_by_lang['en'])

    # Pattern 1: Explicit "Publication date:" label (highest priority)
    pub_label_pattern = rf'(?:Date\s+de\s+publication|Published\s+on)[:\s\|]+(\d{{1,2}}\s+{month_names}\s+\d{{4}})'
    for match in re.finditer(pub_label_pattern, text, re.IGNORECASE):
        date_str = match.group(1)
        parsed_date = dateparser.parse(date_str, languages=[lang])
        if parsed_date:
            normalized_date = parsed_date.strftime('%d %B %Y')
            date_candidates.append({
                'date': normalized_date,
                'priority': 99,
                'context': 'publication_date_label',
                'raw': date_str
            })
            logger.debug(f"Date found (Publication label): {date_str} → {normalized_date}")

    # Pattern 2: Header date with month/year
    header_date_pattern = rf'^([A-Z][a-z]+\s+\d{{4}}|{month_names}\s+\d{{4}})'
    for match in re.finditer(header_date_pattern, text, re.MULTILINE | re.IGNORECASE):
        date_str = match.group(1)
        parsed_date = dateparser.parse(date_str, languages=[lang])
        if parsed_date and not any(c['context'] == 'publication_date_label' for c in date_candidates):
            normalized_date = parsed_date.strftime('1 %B %Y')
            date_candidates.append({
                'date': normalized_date,
                'priority': 93,
                'context': 'header_date',
                'raw': date_str
            })
            logger.debug(f"Date found (header): {date_str} → {normalized_date}")

    # Pattern 3: Format DD Month YYYY (generic)
    generic_date_pattern = rf'\b(\d{{1,2}}\s+{month_names}\s+\d{{4}})\b'
    for match in re.finditer(generic_date_pattern, text, re.IGNORECASE):
        date_str = match.group(1)
        parsed_date = dateparser.parse(date_str, languages=[lang])
        if parsed_date and not any(c['context'] == 'publication_date_label' for c in date_candidates):
            normalized_date = parsed_date.strftime('%d %B %Y')
            start_pos = max(0, match.start() - 100)
            end_pos = min(len(text), match.end() + 100)
            context = text[start_pos:end_pos].lower()

            if 'coming into effect' in context or 'entrée en vigueur' in context:
                priority = 50
                ctx_type = 'effective_date'
            elif 'published' in context or 'publication' in context:
                priority = 94
                ctx_type = 'publication_date'
            elif 'adopted' in context or 'adoption' in context:
                priority = 90
                ctx_type = 'adoption_date'
            else:
                priority = 75
                ctx_type = 'generic_date'

            date_candidates.append({
                'date': normalized_date,
                'priority': priority,
                'context': ctx_type,
                'raw': date_str
            })
            logger.debug(f"Date found ({ctx_type}): {date_str}")

    # Select best date
    if date_candidates:
        date_candidates.sort(key=lambda x: x['priority'], reverse=True)
        selected_date = date_candidates[0]['date']
        meta['publication_date'] = {
            'value': selected_date,
            'confidence': date_candidates[0]['priority'],
            'context': date_candidates[0]['context'],
            'method': 'nlp_pattern_match_multilingual'
        }
        logger.info(f"Publication date selected: {selected_date}")

    # VERSION EXTRACTION
    version_patterns = [
        r'version\s*[:\-]?\s*(\d+\.?\d*)',
        r'v\.?\s*(\d+\.?\d*)',
        r'rev\.?\s*(\d+)',
        r'r(\d+)',
        r'step\s*(\d+)',
        r'corr\.?\s*(\d+)',
        r'EN_(\d+\.?\d*)',
        r'_(\d+\.?\d*)\.pdf'
    ]
    for pattern in version_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            meta['version'] = {
                'value': match.group(1),
                'confidence': 80,
                'method': 'regex_version'
            }
            logger.info(f"Version detected: {match.group(1)}")
            break

    # SOURCE EXTRACTION
    source_info = extract_source_from_text(text)
    if source_info:
        meta['source'] = source_info

    # CONTEXT EXTRACTION
    context_info = extract_context_from_text(text)
    if context_info:
        meta['context'] = context_info

    # COUNTRY EXTRACTION
    country_info = extract_country_from_text(text, file_path)
    if country_info:
        meta['country'] = country_info

    # LANGUAGE EXTRACTION
    if language_info:
        meta['language'] = language_info

    return meta


# ============================================================================
# METADATA QUALITY & CALCULATION
# ============================================================================

def calculate_overall_quality(confidence_scores: Dict[str, int]) -> int:
    """Calculate overall extraction quality.

    Args:
        confidence_scores: Dictionary of field names to confidence scores

    Returns:
        Overall quality score (0-100)
    """
    if not confidence_scores:
        return 0

    weights = {
        'title': 1.5,
        'type': 1.2,
        'publication_date': 1.3,
        'source': 1.2,
        'context': 1.0,
        'language': 0.8,
        'country': 0.8,
        'version': 0.7
    }

    total_weighted_score = 0
    total_weight = 0

    for field, score in confidence_scores.items():
        w = weights.get(field, 1.0)
        total_weighted_score += score * w
        total_weight += w

    return int(total_weighted_score / total_weight) if total_weight else 0


# ============================================================================
# MAIN METADATA EXTRACTION PIPELINE
# ============================================================================

def extract_metadata_local_pipeline(file_path: str) -> Dict[str, Any]:
    """Main entry point for local metadata extraction pipeline.

    Args:
        file_path: Path to the document file

    Returns:
        Dictionary containing all extracted metadata with quality scores
    """
    logger.info(f"Starting professional dynamic extraction for {Path(file_path).name}")

    # 1. Extract text
    full_text = extract_text_content(file_path)

    # 2. Enhanced NLP analysis as primary source
    nlp_meta = enhanced_nlp_analysis(full_text, file_path)

    # 3. Complementary Exif extraction (if available)
    exif_meta = extract_exif_metadata(file_path)

    # 4. Normalization: convert all data to uniform format
    normalized_meta = {}

    # Process NLP data
    for field, value in nlp_meta.items():
        if isinstance(value, dict) and 'value' in value:
            normalized_meta[field] = value
        elif value:
            normalized_meta[field] = {
                'value': value,
                'confidence': 80,
                'method': 'nlp_analysis'
            }

    # Add Exif data if it improves quality
    if exif_meta:
        # Title from Exif (priority if present)
        if 'Title' in exif_meta and isinstance(exif_meta['Title'], dict) and exif_meta['Title'].get('value'):
            if 'title' not in normalized_meta or normalized_meta['title']['confidence'] < exif_meta['Title'][
                'confidence']:
                normalized_meta['title'] = exif_meta['Title']
        # Title (inferred) as fallback
        elif 'Title (inferred)' in exif_meta and isinstance(exif_meta['Title (inferred)'], dict) and exif_meta[
            'Title (inferred)'].get('value'):
            if 'title' not in normalized_meta or normalized_meta['title']['confidence'] < exif_meta['Title (inferred)'][
                'confidence']:
                normalized_meta['title'] = exif_meta['Title (inferred)']

        # Source from Author
        if 'Author' in exif_meta and exif_meta['Author']:
            if 'source' not in normalized_meta or normalized_meta['source']['confidence'] < 70:
                normalized_meta['source'] = {
                    'value': exif_meta['Author'],
                    'confidence': 70,
                    'method': 'exif'
                }

        # Language from Exif (medium priority)
        if 'Language' in exif_meta and exif_meta['Language']:
            if 'language' not in normalized_meta or normalized_meta['language']['confidence'] < 75:
                normalized_meta['language'] = {
                    'value': exif_meta['Language'],
                    'confidence': 75,
                    'method': 'exif'
                }

    # 5. Final consolidation
    final_metadata = {}
    confidence_scores = {}

    expected_fields = ['title', 'type', 'publication_date', 'version', 'source', 'context', 'country', 'language',
                       'url_source']

    for field in expected_fields:
        if field in normalized_meta:
            meta_obj = normalized_meta[field]
            final_metadata[field] = meta_obj['value']
            confidence_scores[field] = meta_obj['confidence']
            logger.info(
                f"  • {field}: {meta_obj['value']} (confidence: {meta_obj['confidence']}% - {meta_obj['method']})")
        else:
            final_metadata[field] = ""
            confidence_scores[field] = 0
            logger.debug(f"  • {field}: (not detected)")

    # 6. Calculate overall quality
    overall_quality = calculate_overall_quality(confidence_scores)

    # 7. Build quality object
    extraction_reasoning = {}
    for field in expected_fields:
        if field in normalized_meta:
            method = normalized_meta[field]['method']
            extraction_reasoning[field] = f"Detected via {method}"
        else:
            extraction_reasoning[field] = "Not detected"

    final_metadata['quality'] = {
        'extraction_rate': overall_quality,
        'field_scores': confidence_scores,
        'extraction_reasoning': extraction_reasoning,
        'extracted_fields': sum(1 for v in final_metadata.values() if v and v != ""),
        'total_fields': len(expected_fields),
        'llm_powered': False
    }

    logger.info(f"Extraction complete - Fill rate: {final_metadata['quality']['extraction_rate']}%")
    logger.info(
        f"Fields extracted: {final_metadata['quality']['extracted_fields']}/{final_metadata['quality']['total_fields']}")

    return final_metadata


# ============================================================================
# FALLBACK EXTRACTION
# ============================================================================

def extract_basic_fallback(file_path: str, source_url: str = "") -> Dict[str, Any]:
    """Basic fallback extraction with honest low confidence scores.

    Args:
        file_path: Path to the document file
        source_url: Optional source URL

    Returns:
        Dictionary with basic metadata and quality scores
    """
    try:
        reader = PdfReader(file_path)
        info = reader.metadata or {}
        title = info.title or Path(file_path).stem
    except Exception as e:
        logger.error(f"Error reading PDF metadata: {e}")
        title = Path(file_path).stem

    full_text = extract_full_text(file_path)

    try:
        lang = detect(full_text)
    except:
        lang = "en"

    basic_meta = {
        "title": title,
        "type": "unknown",
        "publication_date": "",
        "version": "",
        "source": "",
        "context": "",
        "country": "",
        "language": lang,
        "url_source": source_url
    }

    conf_scores = {
        'title': 30 if title else 0,
        'type': 0,
        'publication_date': 0,
        'version': 0,
        'source': 0,
        'context': 0,
        'country': 0,
        'language': 80 if lang else 0
    }

    overall_quality = calculate_overall_quality(conf_scores)

    basic_meta['quality'] = {
        'extraction_rate': overall_quality,
        'field_scores': conf_scores,
        'extraction_reasoning': {
            'title': 'Basic PDF metadata extraction',
            'type': 'Could not determine document type',
            'source': 'No source identification possible'
        },
        'extracted_fields': 1,
        'total_fields': len(conf_scores),
        'llm_powered': False
    }

    return basic_meta


# ============================================================================
# PUBLIC API
# ============================================================================

def extract_metadonnees(pdf_path: str, url: str = "") -> Dict[str, Any]:
    """Main public API for metadata extraction - ALWAYS LOCAL.

    Args:
        pdf_path: Path to the PDF file
        url: Optional source URL (not used for extraction method)

    Returns:
        Dictionary containing all extracted metadata
    """
    logger.info(f"Starting LOCAL metadata extraction for {pdf_path}")

    try:
        return extract_metadata_local_pipeline(pdf_path)
    except Exception as e:
        logger.error(f"Error in local extraction: {e}")
        return extract_basic_fallback(pdf_path, url)
