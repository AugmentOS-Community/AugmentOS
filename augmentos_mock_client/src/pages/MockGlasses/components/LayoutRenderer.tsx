// src/components/LayoutRenderer.tsx

import React, { useMemo } from 'react';
import { Layout, TextWall, TextRows, TextLine, ReferenceCard } from '@shared/index';

interface LayoutRendererProps {
  layout: Layout;
  className?: string;
}

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({ 
  layout,
  className = ''
}) => {
  const renderContent = useMemo(() => {
    switch (layout.layoutType) {
      case 'text_wall':
        return <TextWallLayout layout={layout} />;
      case 'text_rows':
        return <TextRowsLayout layout={layout} />;
      case 'text_line':
        return <TextLineLayout layout={layout} />;
      case 'reference_card':
        return <ReferenceCardLayout layout={layout} />;
      default:
        return <div className="text-red-500">Unsupported layout type</div>;
    }
  }, [layout]);

  return (
    <div className={`layout-renderer ${className}`}>
      {renderContent}
    </div>
  );
};

// Individual layout type components
interface TextWallLayoutProps {
  layout: TextWall;
}

const TextWallLayout: React.FC<TextWallLayoutProps> = ({ layout }) => (
  <div className="text-wall whitespace-pre-wrap break-words">
    {layout.text}
  </div>
);

interface TextRowsLayoutProps {
  layout: TextRows;
}

const TextRowsLayout: React.FC<TextRowsLayoutProps> = ({ layout }) => (
  <div className="text-rows space-y-2">
    {layout.text.map((row, index) => (
      <div 
        key={`${index}`} 
        className="text-row"
      >
        {row}
      </div>
    ))}
  </div>
);

interface TextLineLayoutProps {
  layout: TextLine;
}

const TextLineLayout: React.FC<TextLineLayoutProps> = ({ layout }) => (
  <div className="text-line text-lg font-medium">
    {layout.text}
  </div>
);

interface ReferenceCardLayoutProps {
  layout: ReferenceCard;
}

const ReferenceCardLayout: React.FC<ReferenceCardLayoutProps> = ({ layout }) => (
  <div className="reference-card bg-black/20 rounded-lg p-4">
    <h3 className="text-lg font-semibold mb-2">
      {layout.title}
    </h3>
    <div className="text-sm text-gray-300">
      {layout.text}
    </div>
  </div>
);

export default LayoutRenderer;