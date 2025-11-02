import { AnnotationLabel } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AnnotationToolbarProps {
  labels: AnnotationLabel[];
  selectedLabel: string | null;
  onSelectLabel: (labelId: string) => void;
}

export function AnnotationToolbar({ labels, selectedLabel, onSelectLabel }: AnnotationToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2 p-4 bg-card rounded-lg border">
      <p className="w-full text-sm font-medium mb-2">Annotation Labels</p>
      {labels.map((label) => (
        <Button
          key={label.id}
          variant={selectedLabel === label.id ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelectLabel(label.id)}
          className="gap-2"
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          {label.name}
        </Button>
      ))}
    </div>
  );
}
