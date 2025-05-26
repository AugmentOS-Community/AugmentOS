import { requireNativeView } from 'expo';
import * as React from 'react';

import { AugmodViewProps } from './Augmod.types';

const NativeView: React.ComponentType<AugmodViewProps> =
  requireNativeView('Augmod');

export default function AugmodView(props: AugmodViewProps) {
  return <NativeView {...props} />;
}
