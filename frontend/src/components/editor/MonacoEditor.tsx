// components/editor/MonacoEditor.tsx
// Utilise SimpleJsonViewer par défaut
// Pour utiliser Monaco Editor, installez: npm install @monaco-editor/react

import SimpleJsonViewer from './SimpleJsonViewer';

interface MonacoEditorProps {
  value: string;
  language?: string;
  height?: string;
  readOnly?: boolean;
  onChange?: (value: string | undefined) => void;
  theme?: string;
  options?: any;
}

export const MonacoEditor = ({
  value,
  height = '600px',
  readOnly = false,
  onChange,
}: MonacoEditorProps) => {
  // Pour l'instant, on utilise toujours SimpleJsonViewer
  // Décommentez le code ci-dessous après avoir installé @monaco-editor/react
  
  return (
    <SimpleJsonViewer
      value={value}
      height={height}
      readOnly={readOnly}
      onChange={onChange}
    />
  );
};

export default MonacoEditor;

/* 
// VERSION AVEC MONACO EDITOR (après installation)
// Décommentez ce code après avoir exécuté: npm install @monaco-editor/react

import dynamic from 'next/dynamic';

const Editor = dynamic(
  () => import('@monaco-editor/react'),
  { 
    ssr: false,
    loading: () => (
      <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
        <p className="text-sm text-gray-600">Chargement de l'éditeur...</p>
      </div>
    ),
  }
);

export const MonacoEditor = ({
  value,
  language = 'json',
  height = '600px',
  readOnly = false,
  onChange,
  theme = 'vs',
  options = {},
}: MonacoEditorProps) => {
  const defaultOptions = {
    automaticLayout: true,
    minimap: { enabled: true },
    readOnly,
    fontSize: 14,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'all' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    ...options,
  };

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
      <Editor
        height={height}
        language={language}
        value={value}
        theme={theme}
        options={defaultOptions}
        onChange={onChange}
      />
    </div>
  );
};
*/
