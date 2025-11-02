import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Annotation, AnnotationLabel } from '@/types';

interface RelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annotations: Annotation[];
  labels: AnnotationLabel[];
  onCreateRelationship: (
    name: string,
    sourceId: string,
    targetId: string,
    description?: string
  ) => void;
}

export function RelationshipDialog({
  open,
  onOpenChange,
  annotations,
  labels,
  onCreateRelationship,
}: RelationshipDialogProps) {
  const [name, setName] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [description, setDescription] = useState('');

  const getLabelName = (labelId: string) => {
    return labels.find(l => l.id === labelId)?.name || 'Unknown';
  };

  const handleSubmit = () => {
    if (name && sourceId && targetId) {
      onCreateRelationship(name, sourceId, targetId, description || undefined);
      setName('');
      setSourceId('');
      setTargetId('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Relationship</DialogTitle>
          <DialogDescription>
            Define a relationship between two annotations
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rel-name">Relationship Name</Label>
            <Input
              id="rel-name"
              placeholder="e.g., references, caused_by, related_to"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source Annotation</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="source">
                <SelectValue placeholder="Select source annotation" />
              </SelectTrigger>
              <SelectContent>
                {annotations.map((ann) => (
                  <SelectItem key={ann.id} value={ann.id}>
                    {getLabelName(ann.labelId)}: {ann.text.substring(0, 30)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target">Target Annotation</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger id="target">
                <SelectValue placeholder="Select target annotation" />
              </SelectTrigger>
              <SelectContent>
                {annotations.map((ann) => (
                  <SelectItem key={ann.id} value={ann.id}>
                    {getLabelName(ann.labelId)}: {ann.text.substring(0, 30)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="Add a description for this relationship"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name || !sourceId || !targetId}>
            Create Relationship
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
