import { Annotation, AnnotationRelationship, AnnotationLabel } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface JsonViewProps {
  annotations: Annotation[];
  relationships: AnnotationRelationship[];
  labels: AnnotationLabel[];
}

export function JsonView({ annotations, relationships, labels }: JsonViewProps) {
  const getLabelName = (labelId: string) => {
    return labels.find(l => l.id === labelId)?.name || 'Unknown';
  };

  const jsonData = {
    annotations: annotations.map(ann => ({
      id: ann.id,
      label: getLabelName(ann.labelId),
      text: ann.text,
      position: {
        start: ann.startIndex,
        end: ann.endIndex,
      },
      pageNumber: ann.pageNumber,
      createdAt: ann.createdAt,
    })),
    relationships: relationships.map(rel => ({
      id: rel.id,
      name: rel.name,
      source: rel.sourceAnnotationId,
      target: rel.targetAnnotationId,
      description: rel.description,
      createdAt: rel.createdAt,
    })),
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-lg">JSON Output</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto">
            {JSON.stringify(jsonData, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
