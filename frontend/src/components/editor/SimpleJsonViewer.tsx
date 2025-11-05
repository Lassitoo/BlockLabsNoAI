// components/editor/SimpleJsonViewer.tsx
// Composant simple pour afficher du JSON sans dépendance externe
// Alternative légère à Monaco Editor

interface SimpleJsonViewerProps {
  value: string;
  height?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}

export const SimpleJsonViewer = ({
  value,
  height = '600px',
  readOnly = false,
  onChange,
}: SimpleJsonViewerProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange && !readOnly) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      <pre
        className="p-4 overflow-auto text-sm font-mono"
        style={{ height, margin: 0 }}
      >
        {readOnly ? (
          <code className="text-gray-800">{value}</code>
        ) : (
          <textarea
            value={value}
            onChange={handleChange}
            className="w-full h-full bg-transparent border-none outline-none resize-none font-mono text-sm text-gray-800"
            style={{ minHeight: height }}
            spellCheck={false}
          />
        )}
      </pre>
    </div>
  );
};

export default SimpleJsonViewer;
