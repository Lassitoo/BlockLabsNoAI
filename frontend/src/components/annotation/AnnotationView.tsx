import {JSX, useState} from 'react';
import { Annotation, AnnotationLabel } from '@/types';
import { X } from 'lucide-react';

interface AnnotationViewProps {
  content: string;
  annotations: Annotation[];
  labels: AnnotationLabel[];
  selectedLabel: string | null;
  onAddAnnotation: (text: string, startIndex: number, endIndex: number) => void;
  onRemoveAnnotation: (annotationId: string) => void;
}

export function AnnotationView({
  content,
  annotations,
  labels,
  selectedLabel,
  onAddAnnotation,
  onRemoveAnnotation,
}: AnnotationViewProps) {
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);

  const handleTextSelection = () => {
    if (!selectedLabel) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(document.getElementById('annotation-content')!);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const startIndex = preSelectionRange.toString().length;
    const endIndex = startIndex + selectedText.length;

    onAddAnnotation(selectedText, startIndex, endIndex);
    selection.removeAllRanges();
  };

  const getLabelColor = (labelId: string) => {
    return labels.find(l => l.id === labelId)?.color || '#000';
  };

  const getLabelName = (labelId: string) => {
    return labels.find(l => l.id === labelId)?.name || 'Unknown';
  };

  const renderAnnotatedContent = () => {
    if (annotations.length === 0) {
      return <p className="whitespace-pre-wrap">{content}</p>;
    }

    const sortedAnnotations = [...annotations].sort((a, b) => a.startIndex - b.startIndex);
    const segments: JSX.Element[] = [];
    let lastIndex = 0;

    sortedAnnotations.forEach((annotation, i) => {
      if (annotation.startIndex > lastIndex) {
        segments.push(
          <span key={`text-${i}`}>
            {content.substring(lastIndex, annotation.startIndex)}
          </span>
        );
      }

      segments.push(
        <span
          key={annotation.id}
          className="relative inline-block px-1 rounded cursor-pointer group"
          style={{
            backgroundColor: `${getLabelColor(annotation.labelId)}20`,
            borderBottom: `2px solid ${getLabelColor(annotation.labelId)}`,
          }}
          onMouseEnter={() => setHoveredAnnotation(annotation.id)}
          onMouseLeave={() => setHoveredAnnotation(null)}
        >
          {annotation.text}
          {hoveredAnnotation === annotation.id && (
            <span className="absolute -top-8 left-0 z-10 flex items-center gap-2 px-2 py-1 text-xs bg-popover border rounded shadow-lg whitespace-nowrap">
              <span className="font-medium">{getLabelName(annotation.labelId)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveAnnotation(annotation.id);
                }}
                className="p-0.5 hover:bg-destructive/20 rounded"
              >
                <X className="w-3 h-3 text-destructive" />
              </button>
            </span>
          )}
        </span>
      );

      lastIndex = annotation.endIndex;
    });

    if (lastIndex < content.length) {
      segments.push(
        <span key="text-end">{content.substring(lastIndex)}</span>
      );
    }

    return <div className="whitespace-pre-wrap">{segments}</div>;
  };

  return (
    <div
      id="annotation-content"
      className="p-6 bg-card rounded-lg border min-h-[400px] select-text"
      onMouseUp={handleTextSelection}
    >
      {renderAnnotatedContent()}
    </div>
  );
}
