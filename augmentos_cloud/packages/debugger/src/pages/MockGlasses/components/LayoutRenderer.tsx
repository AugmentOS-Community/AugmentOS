// src/components/LayoutRenderer.tsx

import React, { useMemo } from 'react';
import { 
  Layout,
  TextWall,
  DoubleTextWall,
  TextRows,
  TextLine,
  ReferenceCard,
  DashboardCard
} from '@augmentos/types';

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
      case 'double_text_wall':
        return <DoubleTextWallLayout layout={layout} />;
      case 'reference_card':
        return <ReferenceCardLayout layout={layout} />;
      case 'dashboard_card':
        return <DashboardCardLayout layout={layout} />;
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

interface TextWallLayoutProps {
  layout: TextWall;
}

const TextWallLayout: React.FC<TextWallLayoutProps> = ({ layout }) => (
  <div className="text-wall whitespace-pre-wrap break-words">
    {layout.text}
  </div>
);

interface DoubleTextWallLayoutProps {
  layout: DoubleTextWall;
}

const DoubleTextWallLayout: React.FC<DoubleTextWallLayoutProps> = ({ layout }) => (
  <div>
    <div className="text-wall whitespace-pre-wrap break-words">
      {layout.topText}
    </div>
    <div className="text-wall whitespace-pre-wrap break-words">
      {layout.bottomText}
    </div>
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

interface DashboardCardLayoutProps {
  layout: DashboardCard;
}

const DashboardCardLayout: React.FC<DashboardCardLayoutProps> = ({ layout }) => (
  <div className="dashboard-card bg-gray-100 border rounded-lg p-4 shadow-md flex flex-col justify-between">
    {/* Top section: Time, date & battery */}
    <div className="mb-2">
      <div className="text-sm text-gray-600">{layout.timeDateAndBattery}</div>
    </div>
    {/* Middle section: Top right and bottom right (can be used for quick info) */}
    <div className="flex justify-between items-center">
      <div className="text-lg font-bold">{layout.topRight}</div>
      <div className="text-lg">{layout.bottomRight}</div>
    </div>
    {/* Bottom section: Additional info */}
    <div className="text-sm text-gray-500 mt-2">{layout.bottomLeft}</div>
  </div>
);

export default LayoutRenderer;
