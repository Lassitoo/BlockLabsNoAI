// components/editor/JsonViewer.tsx
// Composant JSON Viewer avec le même style que les templates Django

interface JsonViewerProps {
  value: string | object;
  title?: string;
  height?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onCopy?: () => void;
  onDownload?: () => void;
  showActions?: boolean;
}

// Fonction pour formater le JSON avec coloration syntaxique
const syntaxHighlight = (json: string) => {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return '<span class="' + cls + '">' + match + '</span>';
  });
};

export const JsonViewer = ({
  value,
  title = "JSON Structuré des Annotations",
  height = "600px",
  readOnly = false,
  onChange,
  onCopy,
  onDownload,
  showActions = true,
}: JsonViewerProps) => {
  const jsonString = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const highlightedJson = syntaxHighlight(jsonString);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange && !readOnly) {
      onChange(e.target.value);
    }
  };

  return (
    <div className="json-editor-card">
      <div className="json-editor-head">
        <h3>
          <i className="fas fa-code"></i> {title}
        </h3>
        <span className="badge-pill badge-ok">
          <i className="fas fa-check-circle"></i> Chargé
        </span>
      </div>
      <div className="json-editor-body">
        <div className="monaco-editor" style={{ height }}>
          {readOnly ? (
            <pre className="json-content" dangerouslySetInnerHTML={{ __html: highlightedJson }} />
          ) : (
            <textarea
              value={jsonString}
              onChange={handleChange}
              className="json-textarea"
              style={{ height: '100%', width: '100%' }}
              spellCheck={false}
            />
          )}
        </div>
        {showActions && (
          <div className="json-actions">
            {onCopy && (
              <button className="copy-btn" onClick={onCopy}>
                <i className="fas fa-copy"></i> Copier le JSON
              </button>
            )}
            {onDownload && (
              <button className="copy-btn" onClick={onDownload}>
                <i className="fas fa-download"></i> Télécharger JSON
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .json-editor-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          margin: 1.25rem 0;
        }

        .json-editor-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid #e2e8f0;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(52, 211, 153, 0.05));
        }

        .json-editor-head h3 {
          margin: 0;
          font-size: 1.15rem;
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-weight: 600;
          color: #1f2937;
        }

        .badge-pill {
          padding: 0.35rem 0.8rem;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.8rem;
          border: 1px solid transparent;
        }

        .badge-ok {
          background: rgba(5, 150, 105, 0.12);
          color: #047857;
          border-color: rgba(5, 150, 105, 0.25);
        }

        .json-editor-body {
          padding: 1.25rem 1.5rem;
        }

        .monaco-editor {
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #e9ecef;
          background: #f8f9fa;
        }

        .json-content {
          margin: 0;
          padding: 1rem;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
          font-size: 14px;
          line-height: 1.8;
          color: #1f2937;
          background: #ffffff;
          overflow: auto;
          white-space: pre;
          height: 100%;
          tab-size: 2;
        }

        .json-content :global(.json-key) {
          color: #0451a5;
          font-weight: 600;
        }

        .json-content :global(.json-string) {
          color: #a31515;
        }

        .json-content :global(.json-number) {
          color: #098658;
        }

        .json-content :global(.json-boolean) {
          color: #0000ff;
          font-weight: 600;
        }

        .json-content :global(.json-null) {
          color: #0000ff;
          font-weight: 600;
        }

        .json-textarea {
          margin: 0;
          padding: 1rem;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', monospace;
          font-size: 13px;
          line-height: 1.6;
          color: #1f2937;
          background: #ffffff;
          border: none;
          outline: none;
          resize: none;
        }

        .json-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
          flex-wrap: wrap;
        }

        .copy-btn {
          background: linear-gradient(135deg, #10b981, #34d399);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 0.6rem 1.25rem;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
        }

        .copy-btn:hover {
          background: linear-gradient(135deg, #059669, #10b981);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(16, 185, 129, 0.25);
        }
      `}</style>
    </div>
  );
};

export default JsonViewer;
